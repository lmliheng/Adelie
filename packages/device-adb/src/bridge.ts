/**
 * The ADB bridge: one process that owns the phone conversation and speaks the host protocol
 * over a local pipe (design §4.1). It is deliberately unaware of Adelie's UI and database — it
 * finds devices, collects, executes, and says what it saw. Everything durable belongs to the
 * host.
 *
 * The loop:
 * - connect (and reconnect, with backoff) to the endpoint the server listens on;
 * - `hello` once per connection, then `env` (what adb was found), so a machine without
 *   platform-tools can say WHY there is no phone instead of showing an empty list;
 * - every 5 s, `adb devices -l` → a `devices` frame (which also refreshes last-seen);
 * - for an online device: identity once, readings every 15 s, as `snapshot` frames;
 * - `command` in, `result` out; `permissions` in, remembered and enforced as a second line
 *   behind the host's own check.
 */
import net from "node:net";
import {
  COMMAND_SPECS,
  DEVICE_PROTOCOL_VERSION,
  DeviceProtocolError,
  FrameReader,
  defaultPermissions,
  deviceIdFor,
  encodeFrame,
  normalizePermissions,
  sanitizeDeviceId,
  type AnyFrame,
  type BridgeDescriptor,
  type BridgeEnvironment,
  type BridgeFrame,
  type Capability,
  type DeviceCommand,
  type DeviceCommandResult,
  type DeviceReport,
  type DeviceSnapshot,
  type Permissions,
} from "@adelie/device";
import { AdbClient } from "./adb-client.js";
import { collectDynamic, collectStatic } from "./collect.js";
import { executeCommand } from "./commands.js";
import type { AdbDeviceLine } from "./parse.js";
import { startWifiPairing } from "./pairing.js";

/** What this adapter can honestly do on an Android phone. Clipboard is deliberately absent:
 *  P0 only reaches it through a companion app, so claiming it would be a lie in the panel. */
export const ADB_CAPABILITIES: Capability[] = [
  "info:read",
  "apps:read",
  "apps:write",
  "files:read",
  "files:write",
  "screen:view",
  "input:control",
  "shell:exec",
  "notifications:read",
];

/** What the bridge settled on: a client (or none) and the env frame that explains it. */
export interface AdbRuntime {
  adb: AdbClient | null;
  environment: BridgeEnvironment;
}

export type AdbResolver = () => Promise<AdbRuntime>;

export interface AdbBridgeOptions {
  /** Socket path or Windows named pipe the host listens on. */
  endpoint: string;
  bridgeId: string;
  bridgeName?: string;
  kind?: "desktop" | "cli";
  version: string;
  /** Called once at start; again every 30 s while it yields no adb (the user may install one). */
  resolveAdb: AdbResolver;
  log?: (level: "info" | "warn" | "error", line: string) => void;
  pollMs?: number;
  dynamicMs?: number;
  retryMs?: number;
  now?: () => Date;
}

interface Tracked {
  report: DeviceReport;
  serial: string;
  firstSeenAt: string;
  staticCollected: boolean;
  /** When the last dynamic reading was taken (ms since epoch). */
  dynamicAt: number;
}

const RECONNECT_CAP_MS = 10_000;
const DISCOVERY_RETRY_MS = 30_000;

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `model:Pixel_8` becomes `Pixel 8`; a missing model falls back to the serial. */
function displayName(line: AdbDeviceLine): string {
  const model = line.model?.replace(/_/g, " ").trim();
  return model !== undefined && model !== "" ? model : line.serial;
}

function stateOf(adbState: string): DeviceReport["state"] {
  switch (adbState) {
    case "device":
      return "online";
    case "unauthorized":
      return "unauthorized";
    case "offline":
      return "offline";
    case "bootloader":
    case "recovery":
    case "sideload":
    case "rescue":
    case "authorizing":
    case "connecting":
      return "connecting";
    default:
      return "offline";
  }
}

export class AdbBridge {
  private socket: net.Socket | null = null;
  private reader = new FrameReader();
  private readonly tracked = new Map<string, Tracked>();
  private readonly permissions = new Map<string, Permissions>();
  private adb: AdbClient | null = null;
  private environment: BridgeEnvironment | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private retryMs: number;
  private polling = false;
  private stopped = false;
  private readonly now: () => Date;

  constructor(private readonly options: AdbBridgeOptions) {
    this.now = options.now ?? (() => new Date());
    this.retryMs = options.retryMs ?? 1_000;
  }

  async start(): Promise<void> {
    await this.resolve();
    if (this.stopped) return;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.stopPolling();
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    if (this.discoveryTimer !== null) clearTimeout(this.discoveryTimer);
    this.reconnectTimer = null;
    this.discoveryTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
  }

  /** The endpoint this bridge talks to (the CLI prints it in its log line). */
  get endpoint(): string {
    return this.options.endpoint;
  }

  /* ------------------------------- discovery ------------------------------ */

  private async resolve(): Promise<void> {
    try {
      const runtime = await this.options.resolveAdb();
      this.adb = runtime.adb;
      this.environment = runtime.environment;
      if (runtime.adb === null) {
        this.log("warn", runtime.environment.adb?.message ?? "No adb found.");
        this.scheduleDiscovery();
      }
    } catch (err) {
      this.log("warn", `finding adb failed: ${message(err)}`);
      this.adb = null;
      this.environment = {
        adb: { found: false, path: null, version: null, source: "missing", message: message(err) },
        platform: `${process.platform}-${process.arch}`,
      };
      this.scheduleDiscovery();
    }
  }

  private scheduleDiscovery(): void {
    if (this.stopped || this.discoveryTimer !== null) return;
    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = null;
      void this.resolve().then(() => {
        if (this.adb === null || this.socket === null) return;
        this.send({ t: "env", data: this.environment ?? {} });
        void this.tick();
      });
    }, DISCOVERY_RETRY_MS);
    this.discoveryTimer.unref?.();
  }

  /* ------------------------------ connection ------------------------------ */

  private descriptor(): BridgeDescriptor {
    return {
      id: this.options.bridgeId,
      name: this.options.bridgeName ?? "Adelie desktop",
      kind: this.options.kind ?? "desktop",
      version: this.options.version,
      protocol: DEVICE_PROTOCOL_VERSION,
      capabilities: ADB_CAPABILITIES,
      adapter: { id: "dev.adelie.adb", version: this.options.version },
    };
  }

  private connect(): void {
    if (this.stopped || this.socket !== null) return;
    const socket = net.connect({ path: this.options.endpoint });
    this.socket = socket;
    socket.setNoDelay(true);
    let errored = false;
    socket.on("error", (err) => {
      errored = true;
      this.log("warn", `bridge channel: ${message(err)}`);
    });
    socket.on("connect", () => {
      this.reader = new FrameReader();
      this.retryMs = this.options.retryMs ?? 1_000;
      this.log("info", `connected to ${this.options.endpoint}`);
      this.send({ t: "hello", bridge: this.descriptor() });
      if (this.environment !== null) this.send({ t: "env", data: this.environment });
      this.startPolling();
    });
    socket.on("data", (chunk) => this.onData(chunk));
    socket.on("close", () => {
      this.stopPolling();
      if (this.socket === socket) this.socket = null;
      if (this.stopped) return;
      if (!errored) this.log("warn", "bridge channel closed; reconnecting");
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, RECONNECT_CAP_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(frame: BridgeFrame): void {
    const socket = this.socket;
    if (socket === null || !socket.writable) return;
    try {
      socket.write(encodeFrame(frame));
    } catch (err) {
      this.log("warn", `writing to the bridge channel failed: ${message(err)}`);
      socket.destroy();
    }
  }

  private log(level: "info" | "warn" | "error", line: string): void {
    this.options.log?.(level, line);
    this.send({ t: "log", level, line });
  }

  private onData(chunk: Buffer): void {
    let frames: AnyFrame[];
    try {
      frames = this.reader.push(chunk);
    } catch (err) {
      this.log("error", `protocol: ${message(err)}`);
      this.socket?.destroy();
      return;
    }
    for (const frame of frames) {
      switch (frame.t) {
        case "hello_ok":
          if (frame.permissions !== undefined) {
            for (const [id, permissions] of Object.entries(frame.permissions)) {
              this.permissions.set(sanitizeDeviceId(id), normalizePermissions(permissions));
            }
          }
          break;
        case "permissions":
          this.permissions.set(sanitizeDeviceId(frame.deviceId), frame.permissions);
          break;
        case "command":
          void this.onCommand(frame.command);
          break;
        case "ping":
          this.send({ t: "pong" });
          break;
        default:
          break;
      }
    }
  }

  /* -------------------------------- polling ------------------------------- */

  private startPolling(): void {
    if (this.pollTimer !== null) return;
    void this.tick();
    this.pollTimer = setInterval(() => void this.tick(), this.options.pollMs ?? 5_000);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async tick(): Promise<void> {
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      if (this.adb === null) {
        await this.resolve();
        if (this.adb === null) return;
      }
      let lines: AdbDeviceLine[];
      try {
        lines = await this.adb.devices();
      } catch (err) {
        this.log("warn", `adb devices failed: ${message(err)}`);
        return;
      }
      const nowMs = this.now().getTime();
      const present = new Set<string>();
      for (const line of lines) {
        const id = deviceIdFor("android", line.serial, line.serial);
        present.add(id);
        const existing = this.tracked.get(id);
        const report: DeviceReport = {
          id,
          kind: "android",
          name: existing?.report.name ?? displayName(line),
          serial: line.serial,
          transport: line.transport === "wifi" ? "wifi" : "usb",
          platform: existing?.report.platform ?? null,
          state: stateOf(line.state),
          capabilities: ADB_CAPABILITIES,
        };
        if (existing === undefined) {
          this.tracked.set(id, {
            report,
            serial: line.serial,
            firstSeenAt: new Date(nowMs).toISOString(),
            staticCollected: false,
            dynamicAt: 0,
          });
          this.log("info", `device ${id}: ${line.serial} is ${report.state}`);
        } else {
          existing.serial = line.serial;
          existing.report = report;
        }
      }
      for (const [id, track] of this.tracked) {
        if (present.has(id) || track.report.state === "offline") continue;
        track.report = { ...track.report, state: "offline" };
        this.log("info", `device ${id} is no longer connected`);
      }
      // Every tick carries the whole list: it is also what keeps last-seen honest on the
      // host, and a phone list is three rows, not thirty thousand.
      this.send({ t: "devices", devices: [...this.tracked.values()].map((track) => track.report) });
      const dynamicMs = this.options.dynamicMs ?? 15_000;
      for (const track of this.tracked.values()) {
        if (track.report.state !== "online") continue;
        if (track.staticCollected && nowMs - track.dynamicAt < dynamicMs) continue;
        await this.refresh(track);
      }
    } finally {
      this.polling = false;
    }
  }

  /** Identity (once) and readings (when due), sent as one layered snapshot frame. */
  private async refresh(track: Tracked): Promise<void> {
    const client = this.adb?.forDevice(track.serial);
    if (client === undefined) return;
    const at = this.now().toISOString();
    const snapshot: DeviceSnapshot = {};
    try {
      if (!track.staticCollected) {
        const stat = await collectStatic(
          client,
          {
            serial: track.serial,
            state: "device",
            transport: track.report.transport === "wifi" ? "wifi" : "usb",
          },
          track.firstSeenAt,
        );
        if (
          stat.model === undefined &&
          stat.androidVersion === undefined &&
          stat.device === undefined
        ) {
          throw new Error("the device did not answer getprop");
        }
        snapshot.static = { at, data: stat };
        track.staticCollected = true;
        const platform =
          stat.androidVersion !== undefined ? `Android ${stat.androidVersion}` : null;
        const name = [stat.brand, stat.model]
          .filter((part): part is string => part !== undefined && part.trim() !== "")
          .join(" ")
          .trim();
        const betterName = name !== "" ? name : track.report.name;
        if (platform !== track.report.platform || betterName !== track.report.name) {
          track.report = { ...track.report, platform, name: betterName };
          this.send({ t: "device", device: track.report });
        }
      }
      const dynamic = await collectDynamic(client);
      if (Object.values(dynamic).some((value) => value !== undefined))
        snapshot.dynamic = { at, data: dynamic };
    } catch (err) {
      this.log("warn", `collecting ${track.report.id} failed: ${message(err)}`);
      track.dynamicAt = this.now().getTime();
      return;
    }
    if (Object.keys(snapshot).length > 0) {
      this.send({ t: "snapshot", deviceId: track.report.id, snapshot });
    }
    track.dynamicAt = this.now().getTime();
  }

  /* -------------------------------- commands ------------------------------ */

  private async onCommand(command: DeviceCommand): Promise<void> {
    let result: DeviceCommandResult;
    try {
      result = await this.runCommand(command);
    } catch (err) {
      result = {
        id: command.id,
        ok: false,
        error: { code: "command_failed", message: message(err) },
      };
    }
    this.send({ t: "result", result });
  }

  private async runCommand(command: DeviceCommand): Promise<DeviceCommandResult> {
    const id = sanitizeDeviceId(command.deviceId);
    const spec = COMMAND_SPECS[command.op];
    // The host already refused anything ungranted; this is the second lock, for the case
    // where the host's record and ours disagree (a revoke that raced a command, say).
    const permissions = this.permissions.get(id) ?? defaultPermissions();
    if (spec.capability !== null && permissions[spec.capability] !== true) {
      return {
        id: command.id,
        ok: false,
        error: {
          code: "capability_denied",
          message: `${spec.capability} is not granted on this device.`,
        },
      };
    }
    if (command.op === "pair.wifi.start") {
      if (this.adb === null) {
        return {
          id: command.id,
          ok: false,
          error: {
            code: "adb_missing",
            message: this.environment?.adb?.message ?? "No adb available.",
          },
        };
      }
      const { pairing, done } = startWifiPairing(this.adb, {
        log: (level, line) => this.log(level, line),
      });
      void done;
      return { id: command.id, ok: true, data: { pairing } };
    }
    const track = this.tracked.get(id);
    if (track === undefined) {
      return {
        id: command.id,
        ok: false,
        error: { code: "not_found", message: `No device ${id} on this bridge.` },
      };
    }
    if (track.report.state !== "online" || this.adb === null) {
      return {
        id: command.id,
        ok: false,
        error: { code: "device_offline", message: `The device is ${track.report.state}.` },
      };
    }
    try {
      const data = await executeCommand(this.adb.forDevice(track.serial), command, {
        refresh: async () => {
          await this.refresh(track);
          return this.now().toISOString();
        },
      });
      return { id: command.id, ok: true, data };
    } catch (err) {
      const code = err instanceof DeviceProtocolError ? err.code : "command_failed";
      return { id: command.id, ok: false, error: { code, message: message(err) } };
    }
  }
}

/** Convenience for the process entry point: build a bridge around one discovered adb. */
export function adbBridgeFor(options: AdbBridgeOptions): AdbBridge {
  return new AdbBridge(options);
}
