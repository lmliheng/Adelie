/**
 * JSON lines: one frame per line, nothing else between them. The codec is the same on both
 * ends of every channel, so the pipe, a socket and an adapter's stdin all speak it.
 *
 * A frame is validated on the way in. A bridge is a separate process — possibly a third
 * party's — and the host must not put an unvalidated object into a record the panel renders.
 */
import { isCapability } from "./capabilities.js";
import {
  DeviceProtocolError,
  isCommandOp,
  type AnyFrame,
  type BridgeDescriptor,
  type BridgeFrame,
  type DeviceReport,
  type HostFrame,
} from "./protocol.js";
import { isDeviceSnapshot } from "./snapshot.js";

/**
 * The largest single frame either side will buffer. Screenshots and pulled files travel inline
 * as base64 over the local pipe (P0 has no file channel), so this has to fit a phone photo:
 * 12 MiB of JSON carries 8 MiB of base64, i.e. 6 MiB of bytes — the adapter's own ceiling.
 * One line above it is still a protocol error rather than an ever-growing buffer.
 */
export const MAX_FRAME_BYTES = 12 * 1024 * 1024;

export function encodeFrame(frame: AnyFrame): string {
  return `${JSON.stringify(frame)}\n`;
}

const HOST_KINDS = new Set(["desktop", "cli", "companion", "adapter"]);
const DEVICE_KINDS = new Set(["android", "ios", "other"]);
const TRANSPORTS = new Set(["usb", "wifi", "companion", "browser"]);
const STATES = new Set(["online", "offline", "unauthorized", "pairing", "connecting"]);
const EVENT_KINDS = new Set(["state", "notify", "action", "alert"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, what: string): string {
  if (typeof value !== "string" || value === "") {
    throw new DeviceProtocolError("bad_frame", `${what} must be a non-empty string`);
  }
  return value;
}

function oneOf(value: unknown, allowed: Set<string>, what: string): string {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new DeviceProtocolError("bad_frame", `${what} is not one of ${[...allowed].join(", ")}`);
  }
  return value;
}

export function parseDeviceReport(value: unknown): DeviceReport {
  if (!isRecord(value)) throw new DeviceProtocolError("bad_frame", "device must be an object");
  const capabilities = Array.isArray(value.capabilities) ? value.capabilities : [];
  return {
    id: str(value.id, "device.id"),
    kind: oneOf(value.kind, DEVICE_KINDS, "device.kind") as DeviceReport["kind"],
    name: str(value.name, "device.name"),
    serial: typeof value.serial === "string" ? value.serial : null,
    transport: oneOf(value.transport, TRANSPORTS, "device.transport") as DeviceReport["transport"],
    platform: typeof value.platform === "string" ? value.platform : null,
    state: oneOf(value.state, STATES, "device.state") as DeviceReport["state"],
    capabilities: capabilities.filter(isCapability),
  };
}

export function parseBridgeDescriptor(value: unknown): BridgeDescriptor {
  if (!isRecord(value)) throw new DeviceProtocolError("bad_frame", "bridge must be an object");
  const capabilities = Array.isArray(value.capabilities) ? value.capabilities : [];
  const adapter = value.adapter;
  return {
    id: str(value.id, "bridge.id"),
    name: str(value.name, "bridge.name"),
    kind: oneOf(value.kind, HOST_KINDS, "bridge.kind") as BridgeDescriptor["kind"],
    version: str(value.version, "bridge.version"),
    protocol: typeof value.protocol === "number" ? value.protocol : -1,
    capabilities: capabilities.filter(isCapability),
    adapter:
      isRecord(adapter) && typeof adapter.id === "string" && typeof adapter.version === "string"
        ? { id: adapter.id, version: adapter.version }
        : undefined,
  };
}

/** Turns a parsed JSON value into a frame, or refuses it with a `bad_frame`. */
export function parseFrame(value: unknown): AnyFrame {
  if (!isRecord(value)) throw new DeviceProtocolError("bad_frame", "a frame must be an object");
  switch (value.t) {
    case "hello":
      return { t: "hello", bridge: parseBridgeDescriptor(value.bridge) };
    case "hello_ok":
      return { t: "hello_ok", bridgeId: str(value.bridgeId, "hello_ok.bridgeId") };
    case "devices": {
      if (!Array.isArray(value.devices))
        throw new DeviceProtocolError("bad_frame", "devices must be an array");
      return { t: "devices", devices: value.devices.map(parseDeviceReport) };
    }
    case "device":
      return { t: "device", device: parseDeviceReport(value.device) };
    case "snapshot": {
      if (!isDeviceSnapshot(value.snapshot))
        throw new DeviceProtocolError("bad_frame", "snapshot has the wrong shape");
      return {
        t: "snapshot",
        deviceId: str(value.deviceId, "snapshot.deviceId"),
        snapshot: value.snapshot,
      };
    }
    case "event": {
      if (!isRecord(value.event))
        throw new DeviceProtocolError("bad_frame", "event must be an object");
      const event = value.event;
      return {
        t: "event",
        event: {
          deviceId: str(event.deviceId, "event.deviceId"),
          at: str(event.at, "event.at"),
          kind: oneOf(event.kind, EVENT_KINDS, "event.kind") as
            "state" | "notify" | "action" | "alert",
          actor: typeof event.actor === "string" ? event.actor : null,
          action: typeof event.action === "string" ? event.action : null,
          detail: isRecord(event.detail) ? event.detail : null,
        },
      };
    }
    case "result": {
      if (!isRecord(value.result))
        throw new DeviceProtocolError("bad_frame", "result must be an object");
      const result = value.result;
      const error = isRecord(result.error)
        ? {
            code: str(result.error.code, "result.error.code") as never,
            message: typeof result.error.message === "string" ? result.error.message : "",
          }
        : undefined;
      return {
        t: "result",
        result: {
          id: str(result.id, "result.id"),
          ok: result.ok === true,
          data: result.data,
          error,
        },
      };
    }
    case "command": {
      if (!isRecord(value.command))
        throw new DeviceProtocolError("bad_frame", "command must be an object");
      const command = value.command;
      if (!isCommandOp(command.op))
        throw new DeviceProtocolError("bad_frame", `unknown command op ${String(command.op)}`);
      return {
        t: "command",
        command: {
          id: str(command.id, "command.id"),
          deviceId: str(command.deviceId, "command.deviceId"),
          op: command.op,
          args: isRecord(command.args) ? command.args : undefined,
        },
      };
    }
    case "permissions": {
      if (!isRecord(value.permissions))
        throw new DeviceProtocolError("bad_frame", "permissions must be an object");
      const permissions = value.permissions as Record<string, unknown>;
      for (const key of Object.keys(permissions)) {
        if (!isCapability(key) || typeof permissions[key] !== "boolean")
          throw new DeviceProtocolError("bad_frame", `permission ${key} is not a capability`);
      }
      return {
        t: "permissions",
        deviceId: str(value.deviceId, "permissions.deviceId"),
        permissions: permissions as never,
      };
    }
    case "env": {
      if (!isRecord(value.data))
        throw new DeviceProtocolError("bad_frame", "env must be an object");
      return { t: "env", data: value.data as never };
    }
    case "log":
      return {
        t: "log",
        level: oneOf(value.level, new Set(["info", "warn", "error"]), "log.level") as
          "info" | "warn" | "error",
        line: typeof value.line === "string" ? value.line : "",
      };
    case "ping":
      return { t: "ping" };
    case "pong":
      return { t: "pong" };
    default:
      throw new DeviceProtocolError("bad_frame", `unknown frame type ${String(value.t)}`);
  }
}

export function decodeFrame(line: string): AnyFrame {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new DeviceProtocolError("bad_frame", "a frame must be one line of JSON");
  }
  return parseFrame(value);
}

/**
 * Splits a byte stream into frames. Callers push whatever arrived — half a frame, several
 * frames, a frame ending exactly on a chunk boundary — and get back the frames that are
 * complete. One line longer than `limit` is a protocol error rather than an ever-growing
 * buffer: nothing legitimate is that big, and a peer that lies about its length must not be
 * able to exhaust memory.
 */
export class FrameReader {
  private buffer = "";
  private readonly decoder = new TextDecoder();
  private readonly limit: number;

  constructor(limit: number = MAX_FRAME_BYTES) {
    this.limit = limit;
  }

  push(chunk: string | Uint8Array): AnyFrame[] {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
    const frames: AnyFrame[] = [];
    for (;;) {
      const at = this.buffer.indexOf("\n");
      if (at < 0) break;
      const line = this.buffer.slice(0, at).replace(/\r$/, "");
      this.buffer = this.buffer.slice(at + 1);
      if (line.trim() === "") continue;
      frames.push(decodeFrame(line));
    }
    if (this.buffer.length > this.limit) {
      this.buffer = "";
      throw new DeviceProtocolError("bad_frame", "a frame is larger than the protocol allows");
    }
    return frames;
  }

  /** Bytes held back because no newline has arrived yet. */
  pending(): string {
    return this.buffer;
  }
}

export type { AnyFrame, BridgeFrame, HostFrame };
