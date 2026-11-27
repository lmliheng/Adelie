/**
 * The device service: the one place that decides what a device IS right now — registered,
 * online, what a person allows on it, and what a command may do — and the one place every
 * change is audited.
 *
 * Dividing lines worth keeping:
 * - The bridge owns facts about the phone (name, state, capabilities, readings). This service
 *   stores them and never invents them.
 * - The host owns permissions and Project grants. A bridge that reconnects refreshes its
 *   facts and cannot widen a grant, which is what makes "revoke takes effect next command"
 *   true rather than aspirational.
 * - Every write capability needs the per-device grant AND a per-command `approve`. A grant is
 *   a standing "this kind of action is allowed here"; approval is "do this one".
 */
import {
  COMMAND_SPECS,
  isCommandOp,
  sanitizeDeviceId,
  type Capability,
  type DeviceCommand,
  type DeviceCommandOp,
  type DeviceCommandResult,
  type DeviceReport,
  type DeviceSnapshot,
  type Permissions,
} from "@adelie/device";
import type { AdbStatus, BridgeView, DeviceView } from "../api/types.js";
import type { DeviceRow, DevicesRepo } from "../db/repos/devices.js";
import type { DeviceAudit } from "./audit.js";
import type { SnapshotStore } from "./snapshot-store.js";

/** What the service needs from the bridge hub; the hub implements it (bridges.ts). */
export interface DeviceCommandDispatcher {
  sendCommand(bridgeId: string, command: DeviceCommand): Promise<DeviceCommandResult>;
  pushPermissions(deviceId: string, permissions: Permissions): void;
  isOnline(bridgeId: string): boolean;
  environment(): AdbStatus | null;
  bridges(): BridgeView[];
}

export class DeviceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DeviceError";
  }
}

const STATUS: Record<string, number> = {
  not_found: 404,
  bad_request: 400,
  capability_denied: 403,
  approval_required: 409,
  device_offline: 409,
  device_unauthorized: 409,
  bridge_offline: 409,
  bridge_mismatch: 409,
  command_timeout: 504,
  command_failed: 502,
  adb_missing: 409,
  unsupported: 409,
};

function failure(code: string, message: string): DeviceError {
  return new DeviceError(code, message, STATUS[code] ?? 500);
}

export interface DeviceUser {
  userId: string;
  isAdmin: boolean;
}

/**
 * A command's arguments as the audit may keep them: the shape, never the payload. A shell
 * command line and a free-text input are the two things a person typed; the audit keeps their
 * presence and length, not the words.
 */
function summarizeArgs(args: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (args === undefined) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (["data", "apk", "text"].includes(key)) {
      out[`${key}Bytes`] = typeof value === "string" ? value.length : undefined;
      continue;
    }
    if (typeof value === "string")
      out[key] = value.length > 120 ? `${value.slice(0, 120)}…` : value;
    else if (typeof value === "number" || typeof value === "boolean" || value === null)
      out[key] = value;
    else if (Array.isArray(value)) out[key] = value.slice(0, 8);
  }
  return out;
}

export class DevicesService {
  private dispatcher: DeviceCommandDispatcher | null = null;

  constructor(
    private readonly repo: DevicesRepo,
    private readonly snapshots: SnapshotStore,
    private readonly audit: DeviceAudit,
    private readonly log: (line: string) => void,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Wired after construction: the hub and the service call each other. */
  attachDispatcher(dispatcher: DeviceCommandDispatcher): void {
    this.dispatcher = dispatcher;
  }

  /* ------------------------------ reading -------------------------------- */

  private canSee(row: DeviceRow, projectId: string, user: DeviceUser): boolean {
    if (user.isAdmin) return true;
    return this.repo.projectsOf(row.id).includes(projectId);
  }

  private view(row: DeviceRow): DeviceView {
    const snapshot: DeviceSnapshot | null = this.snapshots.read(row.id);
    const now = this.now();
    return {
      id: row.id,
      bridgeId: row.bridgeId,
      kind: row.kind,
      name: row.prefs.displayName ?? row.name,
      serial: row.serial,
      transport: row.transport,
      platform: row.platform,
      state: row.state,
      capabilities: row.capabilities,
      permissions: row.permissions,
      pairedAt: row.pairedAt,
      lastSeenAt: row.lastSeenAt,
      prefs: row.prefs,
      bridgeOnline: this.dispatcher?.isOnline(row.bridgeId) ?? false,
      snapshot,
      snapshotAgeMs: this.snapshots.ageMs(row.id, now),
      grants: this.repo.projectsOf(row.id),
    };
  }

  list(
    projectId: string,
    user: DeviceUser,
  ): { devices: DeviceView[]; bridges: BridgeView[]; adb: AdbStatus | null } {
    const devices = this.repo
      .listDevices()
      .filter((row) => this.canSee(row, projectId, user))
      .map((row) => this.view(row));
    return {
      devices,
      bridges: this.dispatcher?.bridges() ?? [],
      adb: this.dispatcher?.environment() ?? null,
    };
  }

  private requireDevice(deviceId: string): DeviceRow {
    const row = this.repo.getDevice(deviceId);
    if (row === null) throw failure("not_found", `No device ${deviceId}.`);
    return row;
  }

  detail(
    deviceId: string,
    projectId: string,
    user: DeviceUser,
  ): { device: DeviceView; events: ReturnType<DeviceAudit["list"]> } {
    const row = this.requireDevice(deviceId);
    if (!this.canSee(row, projectId, user)) throw failure("not_found", `No device ${deviceId}.`);
    return { device: this.view(row), events: this.audit.list(deviceId) };
  }

  events(deviceId: string, projectId: string, user: DeviceUser, limit?: number) {
    const row = this.requireDevice(deviceId);
    if (!this.canSee(row, projectId, user)) throw failure("not_found", `No device ${deviceId}.`);
    return this.audit.list(deviceId, limit);
  }

  /* ------------------------------ permissions ---------------------------- */

  setPermission(
    deviceId: string,
    capability: Capability,
    allowed: boolean,
    actor: string,
    projectId: string,
  ): DeviceView {
    const row = this.requireDevice(deviceId);
    if (!row.capabilities.includes(capability)) {
      throw failure("unsupported", `This bridge does not provide ${capability} on this device.`);
    }
    const permissions: Permissions = { ...row.permissions, [capability]: allowed };
    this.repo.setPermissions(deviceId, permissions);
    this.audit.record({
      deviceId,
      kind: "action",
      actor,
      action: allowed ? "grant" : "revoke",
      detail: { capability, projectId },
    });
    this.dispatcher?.pushPermissions(deviceId, permissions);
    return this.view(this.requireDevice(deviceId));
  }

  /* -------------------------------- grants ------------------------------- */

  grant(deviceId: string, projectId: string, actor: string): void {
    this.requireDevice(deviceId);
    this.repo.addGrant(deviceId, projectId, actor, this.now().toISOString());
    this.audit.record({
      deviceId,
      kind: "action",
      actor,
      action: "grant_project",
      detail: { projectId },
    });
  }

  revokeGrant(deviceId: string, projectId: string, actor: string): void {
    this.requireDevice(deviceId);
    this.repo.removeGrant(deviceId, projectId);
    this.audit.record({
      deviceId,
      kind: "action",
      actor,
      action: "revoke_project",
      detail: { projectId },
    });
  }

  /** Who may use this device, as rows (the panel lists them; the CLI prints them). */
  grants(
    deviceId: string,
    projectId: string,
    user: DeviceUser,
  ): Array<{ projectId: string; grantedBy: string; grantedAt: string }> {
    const row = this.requireDevice(deviceId);
    if (!this.canSee(row, projectId, user)) throw failure("not_found", `No device ${deviceId}.`);
    return this.repo.listGrants(deviceId).map((grant) => ({
      projectId: grant.projectId,
      grantedBy: grant.grantedBy,
      grantedAt: grant.grantedAt,
    }));
  }

  /** Forget a device. Its audit rows stay: the trail outlives the record on purpose. */
  forget(deviceId: string, actor: string): void {
    const row = this.requireDevice(deviceId);
    this.audit.record({ deviceId, kind: "action", actor, action: "forget", detail: null });
    this.repo.deleteDevice(deviceId);
    this.snapshots.remove(deviceId);
    this.repo.endSession(deviceId, this.now().toISOString(), "forgotten");
    this.log(`device ${row.id}: forgotten by ${actor}`);
  }

  /* -------------------------------- commands ----------------------------- */

  /**
   * Starts the Android 11 pairing QR on a bridge. This is the one action that happens before a
   * device exists, so it is addressed to the bridge rather than to a device: an admin picks
   * which bridge (the connected one by default), and the bridge answers with the QR payload.
   * The background pairing result arrives as bridge log lines; there is nothing to wait for.
   */
  async pairWifi(
    bridgeId: string | undefined,
    actor: string,
    projectId: string,
    user: DeviceUser,
  ): Promise<DeviceCommandResult> {
    if (!user.isAdmin) throw failure("capability_denied", "Only an admin can pair a phone.");
    const dispatcher = this.dispatcher;
    if (dispatcher === null) throw failure("bridge_offline", "No device bridge is running.");
    const bridges = dispatcher.bridges();
    const bridge =
      bridgeId === undefined
        ? bridges.find((candidate) => candidate.online)
        : bridges.find((candidate) => candidate.id === bridgeId);
    if (bridge === undefined) {
      throw bridgeId === undefined
        ? failure("bridge_offline", "No device bridge is connected.")
        : failure("not_found", `No bridge ${bridgeId}.`);
    }
    if (!dispatcher.isOnline(bridge.id)) {
      throw failure("bridge_offline", `The bridge ${bridge.name} is not connected.`);
    }
    const command: DeviceCommand = {
      id: `pair-${this.now().getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      deviceId: bridge.id,
      op: "pair.wifi.start",
    };
    const result = await dispatcher.sendCommand(bridge.id, command);
    this.audit.record({
      deviceId: bridge.id,
      kind: "action",
      actor,
      action: "pair",
      detail: { bridgeId: bridge.id, projectId, ok: result.ok, code: result.error?.code ?? null },
    });
    if (!result.ok && result.error !== undefined)
      throw failure(result.error.code, result.error.message);
    return result;
  }

  /**
   * Runs one command against one device, after the two checks that make this model safe:
   * the capability must be granted on THIS device, and a write must carry the caller's
   * approval for THIS command. Both refusals are audited — a refusal is what an audit is for.
   */
  async issue(
    deviceId: string,
    request: { op: unknown; args?: unknown; approve?: unknown },
    actor: string,
    projectId: string,
    user: DeviceUser,
  ): Promise<DeviceCommandResult> {
    const row = this.requireDevice(deviceId);
    if (!this.canSee(row, projectId, user)) throw failure("not_found", `No device ${deviceId}.`);
    if (!isCommandOp(request.op))
      throw failure("bad_request", `Unknown command ${String(request.op)}.`);
    const op: DeviceCommandOp = request.op;
    const spec = COMMAND_SPECS[op];
    const args =
      typeof request.args === "object" && request.args !== null
        ? (request.args as Record<string, unknown>)
        : undefined;

    if (spec.capability !== null && row.permissions[spec.capability] !== true) {
      this.audit.record({
        deviceId,
        kind: "action",
        actor,
        action: `${spec.action}:denied`,
        detail: { op, capability: spec.capability },
      });
      throw failure(
        "capability_denied",
        `The capability ${spec.capability} is not granted on this device.`,
      );
    }
    if (spec.write && request.approve !== true) {
      this.audit.record({
        deviceId,
        kind: "action",
        actor,
        action: `${spec.action}:needs-approval`,
        detail: { op },
      });
      throw failure(
        "approval_required",
        `This command writes to the device; approve it explicitly.`,
      );
    }
    if (op !== "pair.wifi.start" && row.state !== "online") {
      throw failure("device_offline", `The device is ${row.state}.`);
    }
    const dispatcher = this.dispatcher;
    if (dispatcher === null || !dispatcher.isOnline(row.bridgeId)) {
      throw failure("bridge_offline", "The bridge that owns this device is not connected.");
    }

    const command: DeviceCommand = {
      id: `cmd-${this.now().getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      deviceId,
      op,
      args,
    };
    let result: DeviceCommandResult;
    try {
      result = await dispatcher.sendCommand(row.bridgeId, command);
    } catch (err) {
      const code = err instanceof DeviceError ? err.code : "command_failed";
      this.audit.record({
        deviceId,
        kind: "action",
        actor,
        action: spec.action,
        detail: { op, ok: false, code, args: summarizeArgs(args) },
      });
      throw err instanceof DeviceError
        ? err
        : failure("command_failed", err instanceof Error ? err.message : String(err));
    }

    this.audit.record({
      deviceId,
      kind: "action",
      actor,
      action: spec.action,
      detail: {
        op,
        ok: result.ok,
        code: result.error?.code ?? null,
        args: summarizeArgs(args),
      },
    });
    if (!result.ok && result.error !== undefined) {
      throw failure(result.error.code, result.error.message);
    }
    return result;
  }

  /* ------------------------- what the bridge says ------------------------ */

  /** A device was reported (first sight, reconnect, or a state change). */
  applyDeviceReport(bridgeId: string, report: DeviceReport): void {
    const now = this.now().toISOString();
    // The id becomes a URL path, a file name and a SQL key: the protocol lets a bridge mint it,
    // and the host folds it into this codebase's id alphabet rather than trusting it.
    const id = sanitizeDeviceId(report.id);
    const before = this.repo.getDevice(id);
    const row = this.repo.upsertDevice({ ...report, id, bridgeId, now });
    if (before === null) {
      this.audit.record({
        deviceId: row.id,
        kind: "state",
        actor: "system",
        action: "paired",
        detail: { transport: report.transport, kind: report.kind },
      });
      this.log(`device ${row.id}: reported by bridge ${bridgeId} (${report.state})`);
    } else if (before.state !== report.state) {
      this.audit.record({
        deviceId: row.id,
        kind: "state",
        actor: "system",
        action: report.state,
        detail: { from: before.state, to: report.state },
      });
    }
    if (report.state === "online" && !this.repo.hasOpenSession(row.id)) {
      this.repo.startSession(row.id, report.transport, now);
    }
    if (
      report.state !== "online" &&
      report.state !== "connecting" &&
      this.repo.hasOpenSession(row.id)
    ) {
      this.repo.endSession(row.id, now, report.state);
    }
  }

  applySnapshot(deviceId: string, snapshot: DeviceSnapshot): void {
    const id = sanitizeDeviceId(deviceId);
    if (this.repo.getDevice(id) === null) return; // a snapshot for a device never registered
    this.snapshots.merge(id, snapshot);
  }

  /** A bridge-reported event (a notification arrived, a warning) becomes one audit row. */
  applyEvent(event: {
    deviceId: string;
    kind: string;
    action?: string | null;
    detail?: Record<string, unknown> | null;
    at: string;
  }): void {
    const deviceId = sanitizeDeviceId(event.deviceId);
    if (this.repo.getDevice(deviceId) === null) return;
    const kind = ["state", "notify", "action", "alert"].includes(event.kind)
      ? (event.kind as "state" | "notify" | "action" | "alert")
      : "notify";
    this.audit.record({
      deviceId,
      kind,
      actor: "system",
      action: event.action ?? null,
      detail: event.detail ?? null,
      at: event.at,
    });
  }

  /** A bridge went away: its devices are offline, and that is a state change worth recording. */
  bridgeGone(bridgeId: string): void {
    const now = this.now().toISOString();
    for (const row of this.repo.listDevices()) {
      if (row.bridgeId !== bridgeId || row.state === "offline") continue;
      this.repo.setState(row.id, "offline", now);
      this.repo.endSession(row.id, now, "bridge_lost");
      this.audit.record({
        deviceId: row.id,
        kind: "state",
        actor: "system",
        action: "bridge_lost",
        detail: { from: row.state },
      });
    }
  }
}
