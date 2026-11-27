import { mkdirSync, mkdtempSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FrameReader,
  bridgeEndpoint,
  defaultPermissions,
  encodeFrame,
  type AnyFrame,
  type HostFrame,
} from "@adelie/device";
import { AdbClient } from "../src/adb-client.js";
import { AdbBridge } from "../src/bridge.js";
import { DEVICES_L, GETPROP, scriptedBinaryRunner, scriptedRunner, TINY_PNG } from "./helpers.js";

/**
 * The bridge against a host on the endpoint the product itself computes — a Unix socket under
 * the data root, a named pipe on Windows. It asserts the handshake, the environment frame, a
 * device report, a layered snapshot, a command round trip and the second permission lock.
 */

class FakeHost {
  readonly frames: AnyFrame[] = [];
  private readonly reader = new FrameReader();
  private socket: net.Socket | null = null;
  private readonly waiters: Array<{
    predicate: (frame: AnyFrame) => boolean;
    resolve: (frame: AnyFrame) => void;
  }> = [];
  private readonly server: net.Server;

  constructor(private readonly endpoint: string) {
    this.server = net.createServer((socket) => {
      this.socket = socket;
      socket.setNoDelay(true);
      socket.on("data", (chunk) => {
        for (const frame of this.reader.push(chunk)) this.push(frame);
      });
    });
  }

  listen(): Promise<void> {
    return new Promise((resolve) => this.server.listen(this.endpoint, resolve));
  }

  close(): Promise<void> {
    this.socket?.destroy();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  send(frame: HostFrame): void {
    this.socket?.write(encodeFrame(frame));
  }

  private push(frame: AnyFrame): void {
    this.frames.push(frame);
    for (let i = this.waiters.length - 1; i >= 0; i -= 1) {
      const waiter = this.waiters[i]!;
      if (waiter.predicate(frame)) {
        this.waiters.splice(i, 1);
        waiter.resolve(frame);
      }
    }
  }

  waitFor<T extends AnyFrame>(
    predicate: (frame: AnyFrame) => boolean,
    timeoutMs = 5_000,
  ): Promise<T> {
    const found = this.frames.find(predicate);
    if (found !== undefined) return Promise.resolve(found as T);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((w) => w.resolve === resolved);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(
          new Error(`timed out waiting for a frame; saw ${this.frames.map((f) => f.t).join(", ")}`),
        );
      }, timeoutMs);
      const resolved = (frame: AnyFrame) => {
        clearTimeout(timer);
        resolve(frame as T);
      };
      this.waiters.push({ predicate, resolve: resolved });
    });
  }
}

const dir = mkdtempSync(path.join(os.tmpdir(), "adelie-bridge-"));
// Go through the product's own rule for where the bridge listens: on Windows that is a named
// pipe (a plain path there gets EACCES from `net.listen`), and the mkdtemp suffix keeps two
// runs from sharing one pipe.
const endpoint = bridgeEndpoint(dir, path.basename(dir), process.platform);
// The server side (BridgeHub) creates the socket's directory with 0700 before listening; the
// fake host here has to do the same when the endpoint is a path. A pipe name needs no directory.
if (!endpoint.startsWith("\\\\.\\pipe\\")) {
  mkdirSync(path.dirname(endpoint), { recursive: true, mode: 0o700 });
}
const host = new FakeHost(endpoint);
const calls: string[] = [];
const runner = scriptedRunner(
  {
    "devices -l": DEVICES_L,
    "-s R58M12ABC shell getprop": GETPROP,
    "-s R58M12ABC shell which su": "",
    "-s R58M12ABC shell uname -r": "6.1.75-android14\n",
    "-s R58M12ABC shell cat /proc/cpuinfo": "Hardware\t: Tensor G3\n",
    "-s R58M12ABC shell dumpsys battery": "level: 61\nstatus: 3\nvoltage: 4000\n",
    "-s R58M12ABC shell cat /proc/meminfo": "MemTotal: 1000 kB\nMemAvailable: 400 kB\n",
    "-s R58M12ABC shell df -k /data":
      "Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/x 2000 500 1500 25% /data\n",
    "-s R58M12ABC shell wm size": "Physical size: 1080x2400\n",
  },
  calls,
);
const binary = scriptedBinaryRunner({ "-s R58M12ABC exec-out screencap -p": TINY_PNG });

const realBridge = new AdbBridge({
  endpoint,
  bridgeId: "adb-install-1",
  bridgeName: "Test desktop",
  kind: "desktop",
  version: "0.8.7",
  pollMs: 25,
  dynamicMs: 60_000,
  resolveAdb: async () => ({
    adb: new AdbClient("adb", runner, binary),
    environment: {
      adb: { found: true, path: "/usr/bin/adb", version: "1.0.41", source: "path" },
      platform: "linux-x64",
    },
  }),
});

beforeAll(async () => {
  await host.listen();
  await realBridge.start();
});

afterAll(async () => {
  realBridge.stop();
  await host.close();
});

describe("AdbBridge over the bridge endpoint", () => {
  it("says hello, then what adb it found", async () => {
    const hello = await host.waitFor<Extract<AnyFrame, { t: "hello" }>>((f) => f.t === "hello");
    expect(hello.bridge).toMatchObject({
      id: "adb-install-1",
      name: "Test desktop",
      kind: "desktop",
      version: "0.8.7",
      protocol: 1,
      adapter: { id: "dev.adelie.adb", version: "0.8.7" },
    });
    expect(hello.bridge.capabilities).toContain("screen:view");
    expect(hello.bridge.capabilities).not.toContain("clipboard:read");

    const env = await host.waitFor<Extract<AnyFrame, { t: "env" }>>((f) => f.t === "env");
    expect(env.data).toMatchObject({
      adb: { found: true, path: "/usr/bin/adb", version: "1.0.41", source: "path" },
      platform: "linux-x64",
    });
  });

  it("reports the device and refines its name and platform from getprop", async () => {
    const devices = await host.waitFor<Extract<AnyFrame, { t: "devices" }>>(
      (f) => f.t === "devices" && f.devices.length === 1,
    );
    expect(devices.devices[0]).toMatchObject({
      id: "android-R58M12ABC",
      kind: "android",
      name: "Pixel 8",
      serial: "R58M12ABC",
      transport: "usb",
      state: "online",
    });

    const device = await host.waitFor<Extract<AnyFrame, { t: "device" }>>(
      (f) => f.t === "device" && f.device.platform === "Android 15",
    );
    expect(device.device.name).toBe("Google Pixel 8");
    expect(device.device.platform).toBe("Android 15");
  });

  it("sends identity and readings as one layered snapshot", async () => {
    const snapshot = await host.waitFor<Extract<AnyFrame, { t: "snapshot" }>>(
      (f) => f.t === "snapshot",
    );
    expect(snapshot.deviceId).toBe("android-R58M12ABC");
    expect(snapshot.snapshot.static?.data).toMatchObject({
      brand: "Google",
      model: "Pixel 8",
      androidVersion: "15",
      apiLevel: 35,
      cpu: "Tensor G3",
      kernel: "6.1.75-android14",
    });
    expect(snapshot.snapshot.static?.data.firstSeenAt).toBeDefined();
    expect(snapshot.snapshot.dynamic?.data.power).toMatchObject({
      level: 61,
      status: "discharging",
    });
    expect(snapshot.snapshot.dynamic?.data.memory).toEqual({
      totalBytes: 1000 * 1024,
      availableBytes: 400 * 1024,
      usedBytes: 600 * 1024,
    });
    expect(snapshot.snapshot.dynamic?.data.storage?.totalBytes).toBe(2000 * 1024);
  });

  it("returns a screenshot inline", async () => {
    // `screen:view` is off by default (design §4.5); the panel grants it per device first.
    host.send({
      t: "permissions",
      deviceId: "android-R58M12ABC",
      permissions: { ...defaultPermissions(), "screen:view": true },
    });
    host.send({
      t: "command",
      command: { id: "shot-1", deviceId: "android-R58M12ABC", op: "screenshot" },
    });
    const result = await host.waitFor<Extract<AnyFrame, { t: "result" }>>(
      (f) => f.t === "result" && f.result.id === "shot-1",
    );
    expect(result.result.ok).toBe(true);
    const data = result.result.data as { base64: string; mimeType: string; bytes: number };
    expect(data.mimeType).toBe("image/png");
    expect(Buffer.from(data.base64, "base64")).toEqual(TINY_PNG);
  });

  it("refuses a capability the host revoked", async () => {
    host.send({
      t: "permissions",
      deviceId: "android-R58M12ABC",
      permissions: { ...defaultPermissions(), "screen:view": false },
    });
    host.send({
      t: "command",
      command: { id: "shot-2", deviceId: "android-R58M12ABC", op: "screenshot" },
    });
    const result = await host.waitFor<Extract<AnyFrame, { t: "result" }>>(
      (f) => f.t === "result" && f.result.id === "shot-2",
    );
    expect(result.result.ok).toBe(false);
    expect(result.result.error?.code).toBe("capability_denied");

    // Granting it again lets the same command through.
    host.send({
      t: "permissions",
      deviceId: "android-R58M12ABC",
      permissions: { ...defaultPermissions(), "screen:view": true },
    });
    host.send({
      t: "command",
      command: { id: "shot-3", deviceId: "android-R58M12ABC", op: "screenshot" },
    });
    const granted = await host.waitFor<Extract<AnyFrame, { t: "result" }>>(
      (f) => f.t === "result" && f.result.id === "shot-3",
    );
    expect(granted.result.ok).toBe(true);
  });

  it("answers for a device it has never seen, and for a ping", async () => {
    host.send({
      t: "command",
      command: { id: "ghost", deviceId: "android-NOPE", op: "apps.list" },
    });
    const ghost = await host.waitFor<Extract<AnyFrame, { t: "result" }>>(
      (f) => f.t === "result" && f.result.id === "ghost",
    );
    expect(ghost.result.error?.code).toBe("not_found");

    host.send({ t: "ping" });
    await host.waitFor((f) => f.t === "pong");
    expect(calls).toContain("-s R58M12ABC shell getprop");
  });
});
