/**
 * The device API over a real platform: authentication, Project visibility, and who may change
 * a permission. A fake bridge connects to the socket the platform opened, reports a phone, and
 * the routes are asked about it as an admin and as an ordinary member.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEVICE_PROTOCOL_VERSION,
  FrameReader,
  bridgeEndpoint,
  encodeFrame,
  type AnyFrame,
  type BridgeDescriptor,
} from "@adelie/device";
import type {
  DeviceCommandResponse,
  DeviceDetailResponse,
  DevicePermissionResponse,
  DevicesResponse,
  ErrorBody,
} from "../src/api/types.js";
import { apiClient, createTestApp, loginAdmin, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

async function waitFor(check: () => Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

const descriptor: BridgeDescriptor = {
  id: "bridge-api",
  name: "This computer",
  kind: "desktop",
  version: "0.8.7",
  protocol: DEVICE_PROTOCOL_VERSION,
  capabilities: ["info:read", "apps:read", "shell:exec"],
};

class FakeBridge {
  private readonly socket: net.Socket;
  private readonly reader = new FrameReader();
  readonly frames: AnyFrame[] = [];

  constructor(endpoint: string) {
    this.socket = net.connect(endpoint);
    this.socket.on("data", (chunk) => this.frames.push(...this.reader.push(chunk)));
  }
  send(frame: AnyFrame): void {
    this.socket.write(encodeFrame(frame));
  }
  close(): void {
    this.socket.destroy();
  }
}

describe("the devices API", () => {
  let t: TestApp;
  let bridge: FakeBridge;

  beforeEach(async () => {
    t = await createTestApp();
    const installId = fs.readFileSync(path.join(t.root, "install-id"), "utf8").trim();
    const endpoint = bridgeEndpoint(t.root, installId, process.platform);
    bridge = new FakeBridge(endpoint);
    bridge.send({ t: "hello", bridge: descriptor });
    await waitFor(
      async () => bridge.frames.some((f) => f.t === "hello_ok"),
      "the bridge handshake",
    );
    bridge.send({
      t: "devices",
      devices: [
        {
          id: "android-API1",
          kind: "android",
          name: "Pixel 8",
          serial: "API1",
          transport: "usb",
          platform: "Android 15",
          state: "online",
          capabilities: ["info:read", "apps:read", "shell:exec"],
        },
      ],
    });
  });

  afterEach(async () => {
    bridge.close();
    await t.cleanup();
  });

  it("requires a signed-in user", async () => {
    const res = await t.app.request("/api/projects/default_project/devices");
    expect(res.status).toBe(401);
  });

  it("lists a device to an admin, with its bridge and the adb answer", async () => {
    const admin = await loginAdmin(t.app);
    const api = apiClient(t.app, admin.cookie);
    await waitFor(async () => {
      const res = await api.get("/api/projects/default_project/devices");
      const body = (await res.json()) as DevicesResponse;
      return body.devices.length === 1;
    }, "the device list");
    const res = await api.get("/api/projects/default_project/devices");
    const body = (await res.json()) as DevicesResponse;
    expect(body.devices[0]).toMatchObject({
      id: "android-API1",
      name: "Pixel 8",
      state: "online",
      bridgeOnline: true,
      grants: [],
    });
    expect(body.devices[0]?.permissions["shell:exec"]).toBe(false);
    expect(body.bridges.map((b) => b.id)).toEqual(["bridge-api"]);
  });

  it("hides a device from a member until the Project is granted, and then shows it", async () => {
    const admin = await loginAdmin(t.app);
    const member = await provisionUser(t.app, "bob");
    const adminApi = apiClient(t.app, admin.cookie);
    const memberApi = apiClient(t.app, member.cookie);
    expect(
      (await adminApi.post("/api/projects/default_project/members", { userId: "bob" })).status,
    ).toBe(201);

    expect(
      (await (
        await memberApi.get("/api/projects/default_project/devices")
      ).json()) as DevicesResponse,
    ).toMatchObject({ devices: [] });

    const granted = await adminApi.post(
      "/api/projects/default_project/devices/android-API1/grants",
      {
        projectId: "default_project",
      },
    );
    expect(granted.status).toBe(201);

    await waitFor(async () => {
      const body = (await (
        await memberApi.get("/api/projects/default_project/devices")
      ).json()) as DevicesResponse;
      return body.devices.length === 1;
    }, "the granted device");
    const detail = (await (
      await memberApi.get("/api/projects/default_project/devices/android-API1")
    ).json()) as DeviceDetailResponse;
    expect(detail.device.id).toBe("android-API1");
    // The trail is newest first (`DeviceDetailResponse`): the grant is the last thing that
    // happened, the pairing sits behind it — a member who just got access reads both.
    expect(detail.events[0]?.action).toBe("grant_project");
    expect(detail.events.some((event) => event.action === "paired")).toBe(true);
  });

  it("refuses a permission change from a member and takes one from an admin", async () => {
    const admin = await loginAdmin(t.app);
    const member = await provisionUser(t.app, "carol");
    const adminApi = apiClient(t.app, admin.cookie);
    expect(
      (await adminApi.post("/api/projects/default_project/members", { userId: "carol" })).status,
    ).toBe(201);
    const body = { capability: "shell:exec", allowed: true };

    const refused = await apiClient(t.app, member.cookie).put(
      "/api/projects/default_project/devices/android-API1/permissions",
      body,
    );
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as ErrorBody).error.code).toBe("admin_required");

    const accepted = await apiClient(t.app, admin.cookie).put(
      "/api/projects/default_project/devices/android-API1/permissions",
      body,
    );
    expect(accepted.status).toBe(200);
    expect(
      ((await accepted.json()) as DevicePermissionResponse).device.permissions["shell:exec"],
    ).toBe(true);
  });

  it("still refuses an unapproved write after the capability is granted", async () => {
    const admin = await loginAdmin(t.app);
    const api = apiClient(t.app, admin.cookie);
    await api.put("/api/projects/default_project/devices/android-API1/permissions", {
      capability: "shell:exec",
      allowed: true,
    });
    const refused = await api.post("/api/projects/default_project/devices/android-API1/commands", {
      op: "shell.exec",
      args: { cmd: "id" },
    });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as ErrorBody).error.code).toBe("approval_required");
  });

  it("runs an approved shell command through the bridge and answers its output", async () => {
    const admin = await loginAdmin(t.app);
    const api = apiClient(t.app, admin.cookie);
    await api.put("/api/projects/default_project/devices/android-API1/permissions", {
      capability: "shell:exec",
      allowed: true,
    });
    const running = api.post("/api/projects/default_project/devices/android-API1/commands", {
      op: "shell.exec",
      args: { cmd: "getprop ro.product.model" },
      approve: true,
    });
    await waitFor(async () => bridge.frames.some((f) => f.t === "command"), "the command");
    const command = bridge.frames.find((f) => f.t === "command");
    if (command?.t !== "command") throw new Error("no command frame");
    bridge.send({ t: "result", result: { id: command.command.id, ok: true, data: "Pixel 8" } });
    const res = await running;
    expect(res.status).toBe(200);
    expect((await res.json()) as DeviceCommandResponse).toMatchObject({
      ok: true,
      data: "Pixel 8",
    });
  });

  it("starts a wireless pairing QR on the bridge, for an admin only", async () => {
    const admin = await loginAdmin(t.app);
    const member = await provisionUser(t.app, "dave");
    const adminApi = apiClient(t.app, admin.cookie);
    expect(
      (await adminApi.post("/api/projects/default_project/members", { userId: "dave" })).status,
    ).toBe(201);

    const refused = await apiClient(t.app, member.cookie).post(
      "/api/projects/default_project/devices/pair",
      {},
    );
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as ErrorBody).error.code).toBe("admin_required");

    const running = adminApi.post("/api/projects/default_project/devices/pair", {});
    await waitFor(
      async () =>
        bridge.frames.some((f) => f.t === "command" && f.command.op === "pair.wifi.start"),
      "the pairing command",
    );
    const command = bridge.frames.find(
      (f) => f.t === "command" && f.command.op === "pair.wifi.start",
    );
    if (command?.t !== "command") throw new Error("no pairing command frame");
    expect(command.command.deviceId).toBe("bridge-api");
    bridge.send({
      t: "result",
      result: {
        id: command.command.id,
        ok: true,
        data: {
          pairing: {
            qr: "WIFI:T:ADB;S:adb-abc;P:123456;;",
            serviceName: "adb-abc",
            code: "123456",
            expiresAt: "2026-11-27T00:05:00.000Z",
          },
        },
      },
    });
    const res = await running;
    expect(res.status).toBe(200);
    expect(((await res.json()) as DeviceCommandResponse).data).toMatchObject({
      pairing: { code: "123456", serviceName: "adb-abc" },
    });
  });
});
