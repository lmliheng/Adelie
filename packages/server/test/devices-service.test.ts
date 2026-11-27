/**
 * The device service's rules, without a bridge: registration, the permission defaults, the
 * two refusals a write must survive (no grant, no approval), the audit rows a refusal leaves,
 * and what a bridge going away does to its devices.
 *
 * A fake dispatcher stands in for the pipe: it records what the service asked the bridge to
 * do, and answers with whatever the test says the phone answered.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeviceCommand, DeviceCommandResult, DeviceReport } from "@adelie/device";
import { DevicesRepo } from "../src/db/repos/devices.js";
import { openDatabase } from "../src/db/database.js";
import { DeviceAudit } from "../src/devices/audit.js";
import {
  DeviceError,
  DevicesService,
  type DeviceCommandDispatcher,
} from "../src/devices/service.js";
import { SnapshotStore } from "../src/devices/snapshot-store.js";
import type { AdbStatus, BridgeView } from "../src/api/types.js";
import type { DatabaseSync } from "node:sqlite";

class FakeDispatcher implements DeviceCommandDispatcher {
  online = true;
  sent: DeviceCommand[] = [];
  pushed: Array<{ deviceId: string; permissions: Record<string, boolean> }> = [];
  answer: DeviceCommandResult | null = null;
  env: AdbStatus | null = { found: true, path: "C:\\adb.exe", version: "1.0.41", source: "path" };

  isOnline(): boolean {
    return this.online;
  }
  environment(): AdbStatus | null {
    return this.env;
  }
  bridges(): BridgeView[] {
    return [];
  }
  pushPermissions(deviceId: string, permissions: Record<string, boolean>): void {
    this.pushed.push({ deviceId, permissions });
  }
  async sendCommand(_bridgeId: string, command: DeviceCommand): Promise<DeviceCommandResult> {
    this.sent.push(command);
    return this.answer ?? { id: command.id, ok: true, data: "ok" };
  }
}

const report = (over: Partial<DeviceReport> = {}): DeviceReport => ({
  id: "android-PIXEL8",
  kind: "android",
  name: "Pixel 8",
  serial: "PIXEL8",
  transport: "usb",
  platform: "Android 15",
  state: "online",
  capabilities: ["info:read", "apps:read", "shell:exec", "screen:view"],
  ...over,
});

const admin = { userId: "admin", isAdmin: true };
const member = { userId: "bob", isAdmin: false };

describe("the device service", () => {
  let root: string;
  let db: DatabaseSync;
  let dispatcher: FakeDispatcher;
  let service: DevicesService;
  let audit: DeviceAudit;
  let repo: DevicesRepo;
  const now = () => new Date("2026-11-27T10:00:00.000Z");

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "adelie-devices-"));
    db = openDatabase(path.join(root, "web.db"));
    repo = new DevicesRepo(db);
    dispatcher = new FakeDispatcher();
    audit = new DeviceAudit(repo, now);
    service = new DevicesService(repo, new SnapshotStore(root), audit, () => {}, now);
    service.attachDispatcher(dispatcher);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("registers a reported device with reads open and writes closed", () => {
    service.applyDeviceReport("bridge-1", report());
    const device = service.list("default_project", admin).devices[0]!;
    expect(device).toMatchObject({
      id: "android-PIXEL8",
      name: "Pixel 8",
      state: "online",
      bridgeOnline: true,
      grants: [],
    });
    expect(device.permissions["info:read"]).toBe(true);
    expect(device.permissions["shell:exec"]).toBe(false);
    expect(audit.list("android-PIXEL8").map((e) => e.action)).toEqual(["paired"]);
  });

  it("folds an id a bridge minted with punctuation into the id alphabet", () => {
    service.applyDeviceReport("bridge-1", report({ id: "android:39A:BC" }));
    expect(service.list("default_project", admin).devices.map((d) => d.id)).toEqual([
      "android-39A-BC",
    ]);
  });

  it("records a state change and keeps one connection session open at a time", () => {
    service.applyDeviceReport("bridge-1", report());
    service.applyDeviceReport("bridge-1", report({ state: "offline" }));
    const events = audit.list("android-PIXEL8");
    expect(events[0]).toMatchObject({ kind: "state", action: "offline" });
    expect(repo.hasOpenSession("android-PIXEL8")).toBe(false);
  });

  it("merges snapshots into one file and reports their age", () => {
    service.applyDeviceReport("bridge-1", report());
    service.applySnapshot("android-PIXEL8", {
      dynamic: { at: "2026-11-27T09:59:50.000Z", data: { power: { level: 78 } } },
    });
    service.applySnapshot("android-PIXEL8", {
      dynamic: { at: "2026-11-27T09:59:50.000Z", data: { storage: { totalBytes: 100 } } },
    });
    const fresh = new SnapshotStore(root).read("android-PIXEL8");
    expect(fresh?.dynamic?.data).toMatchObject({
      power: { level: 78 },
      storage: { totalBytes: 100 },
    });
    const device = service.list("default_project", admin).devices[0]!;
    expect(device.snapshotAgeMs).toBe(10_000);
  });

  it("grants a capability on one device and pushes the change to its bridge", () => {
    service.applyDeviceReport("bridge-1", report());
    service.setPermission("android-PIXEL8", "shell:exec", true, "admin", "default_project");
    expect(dispatcher.pushed.at(-1)).toMatchObject({
      deviceId: "android-PIXEL8",
      permissions: { "shell:exec": true },
    });
    const device = service.list("default_project", admin).devices[0]!;
    expect(device.permissions["shell:exec"]).toBe(true);
  });

  it("refuses a command whose capability is not granted, and audits the refusal", async () => {
    service.applyDeviceReport("bridge-1", report());
    await expect(
      service.issue(
        "android-PIXEL8",
        { op: "shell.exec", args: { cmd: "id" } },
        "bob",
        "default_project",
        admin,
      ),
    ).rejects.toMatchObject({ code: "capability_denied", status: 403 });
    expect(dispatcher.sent).toEqual([]);
    expect(audit.list("android-PIXEL8")[0]).toMatchObject({
      action: "shell:denied",
      actor: "bob",
    });
  });

  it("refuses a write without per-command approval, and runs it with approval", async () => {
    service.applyDeviceReport("bridge-1", report());
    service.setPermission("android-PIXEL8", "shell:exec", true, "admin", "default_project");

    await expect(
      service.issue(
        "android-PIXEL8",
        { op: "shell.exec", args: { cmd: "id" } },
        "bob",
        "default_project",
        admin,
      ),
    ).rejects.toMatchObject({ code: "approval_required", status: 409 });

    const result = await service.issue(
      "android-PIXEL8",
      { op: "shell.exec", args: { cmd: "id" }, approve: true },
      "bob",
      "default_project",
      admin,
    );
    expect(result.ok).toBe(true);
    expect(dispatcher.sent.at(-1)).toMatchObject({
      deviceId: "android-PIXEL8",
      op: "shell.exec",
      args: { cmd: "id" },
    });
  });

  it("keeps free text out of the audit, recording only its length", async () => {
    service.applyDeviceReport("bridge-1", report());
    service.setPermission("android-PIXEL8", "shell:exec", true, "admin", "default_project");
    await service.issue(
      "android-PIXEL8",
      { op: "shell.exec", args: { cmd: "id", text: "super-secret-password" }, approve: true },
      "bob",
      "default_project",
      admin,
    );
    const event = audit.list("android-PIXEL8")[0]!;
    const detail = event.detail as { args: Record<string, unknown> };
    expect(JSON.stringify(detail)).not.toContain("super-secret-password");
    expect(detail.args.textBytes).toBe("super-secret-password".length);
    expect(detail.args.cmd).toBe("id");
  });

  it("turns a bridge's own failure into a refusal with its code", async () => {
    service.applyDeviceReport("bridge-1", report());
    service.setPermission("android-PIXEL8", "shell:exec", true, "admin", "default_project");
    dispatcher.answer = {
      id: "x",
      ok: false,
      error: { code: "device_unauthorized", message: "approve the debugging key on the phone" },
    };
    await expect(
      service.issue(
        "android-PIXEL8",
        { op: "shell.exec", approve: true },
        "bob",
        "default_project",
        admin,
      ),
    ).rejects.toMatchObject({ code: "device_unauthorized", status: 409 });
  });

  it("refuses a command for a device that is not online, and one with no bridge", async () => {
    service.applyDeviceReport("bridge-1", report({ state: "offline" }));
    await expect(
      service.issue("android-PIXEL8", { op: "snapshot.refresh" }, "bob", "default_project", admin),
    ).rejects.toMatchObject({ code: "device_offline" });

    service.applyDeviceReport("bridge-1", report());
    dispatcher.online = false;
    await expect(
      service.issue("android-PIXEL8", { op: "snapshot.refresh" }, "bob", "default_project", admin),
    ).rejects.toMatchObject({ code: "bridge_offline" });
  });

  it("shows a device to its Project only, and to every admin", () => {
    service.applyDeviceReport("bridge-1", report());
    expect(service.list("default_project", member).devices).toEqual([]);
    service.grant("android-PIXEL8", "default_project", "admin");
    expect(service.list("default_project", member).devices).toHaveLength(1);
    expect(service.list("other_project", member).devices).toEqual([]);
  });

  it("marks a bridge's devices offline when it goes away, and says why", () => {
    service.applyDeviceReport("bridge-1", report());
    service.bridgeGone("bridge-1");
    const device = service.list("default_project", admin).devices[0]!;
    expect(device.state).toBe("offline");
    expect(device.bridgeOnline).toBe(true); // the fake dispatcher still says online; the row is what changed
    expect(audit.list("android-PIXEL8")[0]).toMatchObject({
      kind: "state",
      action: "bridge_lost",
    });
  });

  it("forgets a device but keeps its audit trail", () => {
    service.applyDeviceReport("bridge-1", report());
    service.forget("android-PIXEL8", "admin");
    expect(service.list("default_project", admin).devices).toEqual([]);
    expect(audit.list("android-PIXEL8").map((e) => e.action)).toContain("forget");
  });

  it("answers 404 rather than 403 for a device outside the caller's Projects", () => {
    service.applyDeviceReport("bridge-1", report());
    expect(() => service.detail("android-PIXEL8", "default_project", member)).toThrow(DeviceError);
    try {
      service.detail("android-PIXEL8", "default_project", member);
    } catch (err) {
      expect((err as DeviceError).status).toBe(404);
    }
  });
});
