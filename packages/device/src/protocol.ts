/**
 * The wire between a bridge (a process that owns phones) and the host (the server's device
 * service). It is JSON lines over a local channel — a Windows named pipe, a Unix socket, or
 * stdin/stdout for an adapter spawned with no channel of its own — and it is the ONLY thing a
 * third-party adapter has to implement.
 *
 * Rules that keep it honest:
 * - Every frame names its kind in `t`; an unknown `t` is a protocol error, never ignored.
 * - The bridge reports devices and snapshots; the host answers commands. Nothing flows the
 *   other way for data, so there is exactly one writer for each record.
 * - `hello` carries the protocol version. A host and a bridge that disagree refuse each other
 *   instead of half-working.
 */
import type { Capability, Permissions } from "./capabilities.js";
import type {
  DeviceEvent,
  DeviceKind,
  DeviceSnapshot,
  DeviceState,
  DeviceTransport,
} from "./types.js";

/** Bump only with a breaking change to the frames below; `hello` compares it. */
export const DEVICE_PROTOCOL_VERSION = 1;

export type DeviceErrorCode =
  | "bad_frame"
  | "bad_request"
  | "capability_denied"
  | "approval_required"
  | "device_offline"
  | "device_unauthorized"
  | "bridge_offline"
  | "bridge_mismatch"
  | "command_failed"
  | "command_timeout"
  | "adb_missing"
  | "adapter_missing"
  | "not_found"
  | "unsupported";

export class DeviceProtocolError extends Error {
  constructor(
    readonly code: DeviceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DeviceProtocolError";
  }
}

/** What a bridge says about itself when it connects. */
export interface BridgeDescriptor {
  /** Stable per installation of the bridge executable/host app. */
  id: string;
  name: string;
  /** `desktop | cli | companion | adapter` — where this bridge runs. */
  kind: "desktop" | "cli" | "companion" | "adapter";
  /** The bridge's own version, for the panel and the logs. */
  version: string;
  protocol: number;
  /** Capabilities this bridge can provide at all, across its devices. */
  capabilities: Capability[];
  /** Adapter the bridge runs, when it wraps exactly one (e.g. `dev.adelie.adb`). */
  adapter?: { id: string; version: string };
}

/** One device as the bridge sees it — the part of `DeviceInfo` a bridge owns. */
export interface DeviceReport {
  id: string;
  kind: DeviceKind;
  name: string;
  serial: string | null;
  transport: DeviceTransport;
  platform: string | null;
  state: DeviceState;
  capabilities: Capability[];
}

/** Commands a host may send. The capability each one needs is in `COMMAND_SPECS`. */
export type DeviceCommandOp =
  | "screenshot"
  | "files.list"
  | "files.pull"
  | "files.push"
  | "apps.list"
  | "apps.install"
  | "apps.uninstall"
  | "shell.exec"
  | "input.tap"
  | "input.swipe"
  | "input.text"
  | "input.key"
  | "notify.list"
  | "snapshot.refresh"
  | "pair.wifi.start";

export interface CommandSpec {
  capability: Capability | null;
  /** Write capabilities need a person's approval for EVERY command, not just a grant. */
  write: boolean;
  /** Audit action name, and what the panel calls it. */
  action: string;
}

export const COMMAND_SPECS: Record<DeviceCommandOp, CommandSpec> = {
  screenshot: { capability: "screen:view", write: false, action: "screenshot" },
  "files.list": { capability: "files:read", write: false, action: "ls" },
  "files.pull": { capability: "files:read", write: false, action: "pull" },
  "files.push": { capability: "files:write", write: true, action: "push" },
  "apps.list": { capability: "apps:read", write: false, action: "apps" },
  "apps.install": { capability: "apps:write", write: true, action: "install" },
  "apps.uninstall": { capability: "apps:write", write: true, action: "uninstall" },
  "shell.exec": { capability: "shell:exec", write: true, action: "shell" },
  "input.tap": { capability: "input:control", write: true, action: "input" },
  "input.swipe": { capability: "input:control", write: true, action: "input" },
  "input.text": { capability: "input:control", write: true, action: "input" },
  "input.key": { capability: "input:control", write: true, action: "input" },
  "notify.list": { capability: "notifications:read", write: false, action: "notify" },
  "snapshot.refresh": { capability: "info:read", write: false, action: "refresh" },
  // Pairing happens before any device exists, so it is a bridge-level action an admin asks for.
  "pair.wifi.start": { capability: null, write: false, action: "pair" },
};

export function isCommandOp(value: unknown): value is DeviceCommandOp {
  return typeof value === "string" && Object.hasOwn(COMMAND_SPECS, value);
}

export interface DeviceCommand {
  id: string;
  deviceId: string;
  op: DeviceCommandOp;
  /** Op-specific, validated by the bridge that implements it. */
  args?: Record<string, unknown>;
}

export interface DeviceCommandResult {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: { code: DeviceErrorCode; message: string };
}

/** The QR a person scans in the phone's "wireless debugging → pair with QR code". */
export interface PairingQr {
  /** `WIFI:T:ADB;S:<service>;P:<code>;;` */
  qr: string;
  serviceName: string;
  code: string;
  /** What the phone should dial once paired, when the bridge knows it. */
  endpoint?: string;
  expiresAt: string;
}

/* ------------------------------------------------------------------------- */
/* Frames                                                                     */
/* ------------------------------------------------------------------------- */

export type HostFrame =
  | { t: "hello_ok"; bridgeId: string; permissions?: Record<string, Permissions> }
  | { t: "command"; command: DeviceCommand }
  | { t: "permissions"; deviceId: string; permissions: Permissions }
  | { t: "ping" };

export type BridgeFrame =
  | { t: "hello"; bridge: BridgeDescriptor }
  | { t: "devices"; devices: DeviceReport[] }
  | { t: "device"; device: DeviceReport }
  | { t: "snapshot"; deviceId: string; snapshot: DeviceSnapshot }
  | { t: "event"; event: DeviceEvent }
  | { t: "result"; result: DeviceCommandResult }
  | { t: "log"; level: "info" | "warn" | "error"; line: string }
  | { t: "pong" };

export type AnyFrame = HostFrame | BridgeFrame;

/** `true` when this build and a peer speaking `version` can talk. */
export function compatibleProtocol(version: unknown): boolean {
  return version === DEVICE_PROTOCOL_VERSION;
}
