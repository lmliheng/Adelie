/**
 * The Devices page: the phones a device bridge reported, drawn as cards.
 *
 * A fake bridge connects to the socket the platform opened (the data root's
 * `run/device-bridge.sock`, the path `@adelie/device`'s `bridgeEndpoint` gives on every platform
 * but Windows) and speaks the protocol's JSON lines: `hello`, then a device and its readings.
 * What the bridge says is the only data source the page has, so a phone on screen proves the
 * whole chain — socket, registry, view.
 *
 * - An admin reads a card and its detail: the state line, the battery figure on the folded card,
 *   and inside — serial, platform, power, screen, network, and the audit trail that starts at
 *   `paired`.
 * - "添加设备" asks the bridge to start wireless pairing and draws the QR once the bridge answers.
 * - A member sees the same card but none of the admin actions (pair, permissions, forget).
 */
import fs from "node:fs";
import net from "node:net";
import { test, expect, request } from "@playwright/test";
import { login, provisionAndLogin, ADMIN_ID, ADMIN_PASSWORD } from "./auth.mjs";

const BASE = process.env.BASE_URL;
/** run.sh exports the served data root; the bridge's socket sits in its `run/`. */
const HOME = process.env.ADELIE_HOME;
if (!HOME) throw new Error("ADELIE_HOME is not set — the runner exports the served data root");
const ENDPOINT = `${HOME.replace(/[\\/]+$/, "")}/run/device-bridge.sock`;

const DEVICE_ID = "android-E2E1";
const DEVICE_NAME = "Pixel 8 (e2e)";

/** One frame per line; an uninteresting line is not an error, the host may send `ping` anytime. */
class FakeBridge {
  constructor(socket) {
    this.socket = socket;
    this.buffer = "";
    this.seen = [];
    socket.on("data", (chunk) => {
      this.buffer += chunk.toString("utf8");
      let index = this.buffer.indexOf("\n");
      while (index !== -1) {
        const line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 1);
        if (line.trim() !== "") this.receive(JSON.parse(line));
        index = this.buffer.indexOf("\n");
      }
    });
  }

  receive(frame) {
    this.seen.push(frame);
    if (frame.t === "ping") this.send({ t: "pong" });
  }

  send(frame) {
    this.socket.write(`${JSON.stringify(frame)}\n`);
  }

  /** Resolves once a frame the predicate names has arrived — current or later. */
  async waitForFrame(match, what) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const hit = this.seen.find(match);
      if (hit !== undefined) return hit;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  close() {
    this.socket.destroy();
  }

  static async connect() {
    // The server starts listening before the first page load; a missing socket here means the
    // platform differs from what this spec assumes, and the failure should say so.
    expect(fs.existsSync(ENDPOINT), `bridge socket at ${ENDPOINT}`).toBeTruthy();
    const socket = net.connect(ENDPOINT);
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    const bridge = new FakeBridge(socket);
    bridge.send({
      t: "hello",
      bridge: {
        id: "bridge-e2e",
        name: "This computer",
        kind: "desktop",
        version: "0.8.8",
        protocol: 1,
        capabilities: ["info:read", "apps:read", "screen:view", "notifications:read"],
      },
    });
    await bridge.waitForFrame((frame) => frame.t === "hello_ok", "the handshake");
    const at = new Date().toISOString();
    bridge.send({
      t: "devices",
      devices: [
        {
          id: DEVICE_ID,
          kind: "android",
          name: DEVICE_NAME,
          serial: "E2E1",
          transport: "usb",
          platform: "Android 15",
          state: "online",
          capabilities: ["info:read", "apps:read", "screen:view", "notifications:read"],
        },
      ],
    });
    bridge.send({
      t: "snapshot",
      deviceId: DEVICE_ID,
      snapshot: {
        static: { at, data: { serial: "E2E1", buildId: "AP4A.250105.002" } },
        dynamic: {
          at,
          data: {
            foreground: "com.android.settings",
            power: { level: 87, charging: false, health: "good", temperatureC: 31.2 },
            screen: {
              widthPx: 1080,
              heightPx: 2400,
              densityDpi: 420,
              refreshHz: 120,
              orientation: "portrait",
              locked: false,
            },
            network: { wifi: { ssid: "lab-5g", rssi: -52 }, addresses: ["192.168.1.23"] },
            storage: { usedBytes: 43_000_000_000, totalBytes: 128_000_000_000 },
            memory: { availableBytes: 3_100_000_000, totalBytes: 7_900_000_000 },
          },
        },
      },
    });
    return bridge;
  }
}

let bridge;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  bridge = await FakeBridge.connect();
});

test.afterAll(() => {
  bridge.close();
});

/** The card for the reported phone — the list's only item, matched on its name. */
const card = (page) => page.getByRole("listitem").filter({ hasText: DEVICE_NAME });

test("an admin reads the card and unfolds it into the readings the bridge sent", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  await page.goto(`${BASE}/devices`);
  const phone = card(page);
  await expect(phone).toBeVisible();
  // The folded card is two lines: name + battery, state + platform + last seen + id.
  await expect(phone.getByText("87%")).toBeVisible();
  await expect(phone.getByText("在线", { exact: true })).toBeVisible();
  await expect(phone.getByText("USB")).toBeVisible();

  await phone.getByRole("button").first().click();
  // Overview, power, screen and network come from the static and dynamic layers.
  await expect(phone.getByText("序列号")).toBeVisible();
  await expect(phone.getByText("E2E1").first()).toBeVisible();
  await expect(phone.getByText("AP4A.250105.002")).toBeVisible();
  await expect(phone.getByText("31.2 °C")).toBeVisible();
  await expect(phone.getByText("1080×2400")).toBeVisible();
  await expect(phone.getByText("lab-5g")).toBeVisible();
  await expect(phone.getByText("-52 dBm")).toBeVisible();
  // The trail starts at the moment the bridge first reported it.
  await expect(phone.getByText("最近操作")).toBeVisible();
  await expect(phone.getByText("paired")).toBeVisible();
});

test("adding a phone asks the bridge for a pairing code and draws the QR it answers with", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  await page.goto(`${BASE}/devices`);
  await card(page).waitFor();
  await page.getByRole("button", { name: "添加设备" }).first().click();

  // The page says it is waiting until the bridge answers; the bridge answers `pair.wifi.start`.
  const command = await bridge.waitForFrame(
    (frame) => frame.t === "command" && frame.command?.op === "pair.wifi.start",
    "the pairing command",
  );
  bridge.send({
    t: "result",
    result: {
      id: command.command.id,
      ok: true,
      data: {
        pairing: {
          qr: "WIFI:T:ADB;S:adb-e2e;P:123456;;",
          serviceName: "adb-e2e",
          code: "123456",
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
      },
    },
  });

  await expect(page.getByRole("img", { name: "无线接入一台手机" })).toBeVisible();
  await expect(page.getByText("配对码 123456")).toBeVisible();
});

test("a member reads the card but is offered no admin action", async ({ page }) => {
  const member = "deviceviewer";
  await provisionAndLogin(page.request, member, "password123");

  // An admin has to make the Project a member and grant the device to it; both are idempotent.
  const admin = await request.newContext();
  await login(admin, ADMIN_ID, ADMIN_PASSWORD);
  await admin.post(`${BASE}/api/projects/default_project/members`, { data: { userId: member } });
  await admin.post(`${BASE}/api/projects/default_project/devices/${DEVICE_ID}/grants`, {
    data: { projectId: "default_project" },
  });
  await admin.dispose();

  await page.goto(`${BASE}/devices`);
  const phone = card(page);
  await expect(phone).toBeVisible();
  await expect(page.getByRole("button", { name: "添加设备" })).toHaveCount(0);

  await phone.getByRole("button").first().click();
  await expect(phone.getByText("序列号")).toBeVisible();
  await expect(phone.getByRole("button", { name: "权限…" })).toHaveCount(0);
  await expect(phone.getByRole("button", { name: "移除设备" })).toHaveCount(0);
  // Reads are on by default; writes need a capability this device has not been granted.
  await expect(phone.getByRole("button", { name: "截图" })).toBeDisabled();
  await expect(phone.getByRole("button", { name: "通知" })).toBeDisabled();
});
