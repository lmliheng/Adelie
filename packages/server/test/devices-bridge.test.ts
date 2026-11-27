/**
 * The local channel, end to end: a fake bridge connects over the Unix socket (the Windows pipe
 * is the same code path with a different path), reports itself and a device, and then takes a
 * command the service issued and answers it. Also pins what a protocol mismatch and a
 * disconnect do.
 *
 * These run on Linux's Unix socket; the Windows named pipe is the same `net` calls with
 * `\\.\pipe\…` as the path and cannot be exercised here (see the report).
 */
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import {
  FrameReader,
  DEVICE_PROTOCOL_VERSION,
  encodeFrame,
  type AnyFrame,
  type BridgeDescriptor,
} from "@adelie/device";
import { openDatabase } from "../src/db/database.js";
import { DevicesRepo } from "../src/db/repos/devices.js";
import { BridgeHub } from "../src/devices/bridges.js";
import { DeviceAudit } from "../src/devices/audit.js";
import { DevicesService } from "../src/devices/service.js";
import { SnapshotStore } from "../src/devices/snapshot-store.js";

async function waitFor(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

class FakeBridge {
  readonly frames: AnyFrame[] = [];
  private readonly reader = new FrameReader();
  private readonly socket: net.Socket;

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

const descriptor: BridgeDescriptor = {
  id: "bridge-test",
  name: "Test computer",
  kind: "desktop",
  version: "0.8.7",
  protocol: DEVICE_PROTOCOL_VERSION,
  capabilities: ["info:read", "apps:read", "shell:exec"],
  adapter: { id: "dev.adelie.adb", version: "0.8.7" },
};

describe("the local bridge channel", () => {
  let root: string;
  let db: DatabaseSync;
  let service: DevicesService;
  let hub: BridgeHub;
  let endpoint: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "adelie-bridge-"));
    db = openDatabase(path.join(root, "web.db"));
    const repo = new DevicesRepo(db);
    service = new DevicesService(repo, new SnapshotStore(root), new DeviceAudit(repo), () => {});
    endpoint = path.join(root, "test-bridge.sock");
    hub = new BridgeHub(repo, service, { root, installId: "test", log: () => {}, endpoint });
    service.attachDispatcher(hub);
    hub.start();
  });

  afterEach(() => {
    hub.dispose();
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("registers a bridge, its devices and their snapshots, then runs a command", async () => {
    const bridge = new FakeBridge(endpoint);
    bridge.send({ t: "hello", bridge: descriptor });
    await waitFor(() => bridge.frames.some((f) => f.t === "hello_ok"), "hello_ok");
    bridge.send({
      t: "devices",
      devices: [
        {
          id: "android-TEST1",
          kind: "android",
          name: "Pixel 8",
          serial: "TEST1",
          transport: "usb",
          platform: "Android 15",
          state: "online",
          capabilities: ["info:read", "apps:read", "shell:exec"],
        },
      ],
    });
    await waitFor(
      () => service.list("p", { userId: "a", isAdmin: true }).devices.length === 1,
      "device",
    );
    bridge.send({
      t: "snapshot",
      deviceId: "android-TEST1",
      snapshot: { static: { at: new Date().toISOString(), data: { model: "Pixel 8" } } },
    });
    await waitFor(
      () => service.list("p", { userId: "a", isAdmin: true }).devices[0]?.snapshot !== null,
      "snapshot",
    );

    // The write capability must be granted, and this command must carry the approval.
    service.setPermission("android-TEST1", "shell:exec", true, "admin", "p");
    const running = service.issue(
      "android-TEST1",
      { op: "shell.exec", args: { cmd: "getprop ro.product.model" }, approve: true },
      "admin",
      "p",
      { userId: "admin", isAdmin: true },
    );
    await waitFor(() => bridge.frames.some((f) => f.t === "command"), "command");
    const command = bridge.frames.find((f) => f.t === "command");
    if (command?.t !== "command") throw new Error("no command frame");
    bridge.send({
      t: "result",
      result: { id: command.command.id, ok: true, data: "Pixel 8" },
    });
    await expect(running).resolves.toMatchObject({ ok: true, data: "Pixel 8" });
    bridge.close();
  });

  it("pushes a revoked capability to the bridge before the next command", async () => {
    const bridge = new FakeBridge(endpoint);
    bridge.send({ t: "hello", bridge: descriptor });
    await waitFor(() => bridge.frames.some((f) => f.t === "hello_ok"), "hello_ok");
    bridge.send({
      t: "devices",
      devices: [
        {
          id: "android-TEST2",
          kind: "android",
          name: "Pixel",
          serial: "TEST2",
          transport: "usb",
          platform: null,
          state: "online",
          capabilities: ["info:read", "shell:exec"],
        },
      ],
    });
    await waitFor(
      () => service.list("p", { userId: "a", isAdmin: true }).devices.length === 1,
      "device",
    );
    service.setPermission("android-TEST2", "shell:exec", true, "admin", "p");
    service.setPermission("android-TEST2", "shell:exec", false, "admin", "p");
    await waitFor(
      () => bridge.frames.filter((f) => f.t === "permissions").length === 2,
      "permissions",
    );
    const pushed = bridge.frames.filter((f) => f.t === "permissions").at(-1);
    expect(pushed).toMatchObject({
      deviceId: "android-TEST2",
      permissions: { "shell:exec": false },
    });
    await expect(
      service.issue("android-TEST2", { op: "shell.exec", approve: true }, "admin", "p", {
        userId: "admin",
        isAdmin: true,
      }),
    ).rejects.toMatchObject({ code: "capability_denied" });
    bridge.close();
  });

  it("refuses a bridge that speaks another protocol instead of half-working", async () => {
    const bridge = new FakeBridge(endpoint);
    bridge.send({ t: "hello", bridge: { ...descriptor, protocol: 999 } });
    await waitFor(
      () => bridge.frames.some((f) => f.t === "log") && hub.isOnline(descriptor.id) === false,
      "refusal",
    );
    expect(hub.isOnline(descriptor.id)).toBe(false);
    bridge.close();
  });

  it("marks its devices offline and leaves no socket behind when the bridge disconnects", async () => {
    const bridge = new FakeBridge(endpoint);
    bridge.send({ t: "hello", bridge: descriptor });
    await waitFor(() => bridge.frames.some((f) => f.t === "hello_ok"), "hello_ok");
    bridge.send({
      t: "devices",
      devices: [
        {
          id: "android-TEST3",
          kind: "android",
          name: "Pixel",
          serial: "TEST3",
          transport: "wifi",
          platform: null,
          state: "online",
          capabilities: ["info:read"],
        },
      ],
    });
    await waitFor(
      () => service.list("p", { userId: "a", isAdmin: true }).devices.length === 1,
      "device",
    );
    bridge.close();
    await waitFor(
      () => service.list("p", { userId: "a", isAdmin: true }).devices[0]?.state === "offline",
      "offline",
    );
    hub.dispose();
    expect(fs.existsSync(endpoint)).toBe(false);
  });
});
