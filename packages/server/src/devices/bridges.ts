/**
 * The local bridge channel: a named pipe on Windows (`\\.\pipe\adelie-device-<instance>`), a
 * Unix socket under the data root elsewhere (0600), one JSON frame per line either way.
 *
 * Why a pipe and not a port: a bridge is a process on THIS machine, the data root's file
 * permissions already say who that is, and a port would add one more thing to find free and
 * one more thing to bind to the wrong interface.
 *
 * The hub keeps only what is live — connections, in-flight commands, the last environment a
 * bridge reported. Everything durable (devices, events, bridge rows) is the service's and the
 * repository's.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  FrameReader,
  bridgeEndpoint,
  compatibleProtocol,
  encodeFrame,
  type BridgeDescriptor,
  type BridgeEnvironment,
  type BridgeFrame,
  type DeviceCommand,
  type DeviceCommandResult,
  type Permissions,
} from "@adelie/device";
import type { AdbStatus, BridgeView } from "../api/types.js";
import type { DevicesRepo } from "../db/repos/devices.js";
import { DeviceError, type DeviceCommandDispatcher, type DevicesService } from "./service.js";

/** Handshake deadline: a socket that says nothing is not a bridge. */
const HELLO_TIMEOUT_MS = 10_000;
/** Per-command ceiling. Installing an APK or capturing a screenshot is slow; shell is not. */
const SLOW_OPS = new Set(["apps.install", "screenshot", "files.pull"]);
const COMMAND_TIMEOUT_MS = 30_000;
const SLOW_COMMAND_TIMEOUT_MS = 180_000;

interface Connection {
  socket: net.Socket;
  bridge: BridgeDescriptor;
  reader: FrameReader;
  pending: Map<string, { resolve: (result: DeviceCommandResult) => void; timer: NodeJS.Timeout }>;
}

export class BridgeHub implements DeviceCommandDispatcher {
  private server: net.Server | null = null;
  private readonly connections = new Map<string, Connection>();
  private env: BridgeEnvironment | null = null;
  private readonly endpoint: string;

  constructor(
    private readonly repo: DevicesRepo,
    private readonly service: DevicesService,
    private readonly options: {
      root: string;
      installId: string | null;
      log: (line: string) => void;
      /** Tests point the socket somewhere temporary. */
      endpoint?: string;
    },
  ) {
    this.endpoint =
      options.endpoint ?? bridgeEndpoint(options.root, options.installId, process.platform);
  }

  /** Where bridges should connect — the desktop app and `penguin device-bridge` read this. */
  address(): string {
    return this.endpoint;
  }

  start(): void {
    if (this.server !== null) return;
    if (!this.endpoint.startsWith("\\\\.\\pipe\\")) {
      fs.mkdirSync(path.dirname(this.endpoint), { recursive: true, mode: 0o700 });
      // A socket left by a crashed process has no listener; removing it is what makes a restart work.
      try {
        fs.rmSync(this.endpoint, { force: true });
      } catch {
        // Nothing to remove.
      }
    }
    const server = net.createServer((socket) => this.accept(socket));
    server.on("error", (err) => {
      this.options.log(`device bridge: the local channel failed: ${String(err)}`);
    });
    server.listen(this.endpoint, () => {
      if (!this.endpoint.startsWith("\\\\.\\pipe\\")) {
        try {
          fs.chmodSync(this.endpoint, 0o600);
        } catch {
          // Best effort: the directory is already 0700.
        }
      }
      this.options.log(`device bridge: listening on ${this.endpoint}`);
    });
    this.server = server;
  }

  dispose(): void {
    for (const [id, conn] of this.connections) {
      this.failConnection(conn, "bridge_gone");
      try {
        conn.socket.destroy();
      } catch {
        // Already gone.
      }
      this.connections.delete(id);
    }
    this.server?.close();
    this.server = null;
    if (!this.endpoint.startsWith("\\\\.\\pipe\\")) {
      try {
        fs.rmSync(this.endpoint, { force: true });
      } catch {
        // Already gone.
      }
    }
  }

  /* --------------------------- dispatcher surface ------------------------- */

  isOnline(bridgeId: string): boolean {
    return this.connections.has(bridgeId);
  }

  environment(): AdbStatus | null {
    return this.env?.adb ?? null;
  }

  bridges(): BridgeView[] {
    return this.repo.listBridges().map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      version: row.version,
      online: this.connections.has(row.id),
      lastSeenAt: row.lastSeenAt,
      devices: this.repo.listDevices().filter((d) => d.bridgeId === row.id).length,
      revokedAt: row.revokedAt,
    }));
  }

  sendCommand(bridgeId: string, command: DeviceCommand): Promise<DeviceCommandResult> {
    const conn = this.connections.get(bridgeId);
    if (conn === undefined) {
      return Promise.reject(
        new DeviceError(
          "bridge_offline",
          "The bridge that owns this device is not connected.",
          409,
        ),
      );
    }
    return new Promise<DeviceCommandResult>((resolve, reject) => {
      const timeout = SLOW_OPS.has(command.op) ? SLOW_COMMAND_TIMEOUT_MS : COMMAND_TIMEOUT_MS;
      const timer = setTimeout(() => {
        conn.pending.delete(command.id);
        reject(
          new DeviceError(
            "command_timeout",
            `The device did not answer '${command.op}' within ${Math.round(timeout / 1000)} seconds.`,
            504,
          ),
        );
      }, timeout);
      timer.unref?.();
      conn.pending.set(command.id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        timer,
      });
      this.write(conn, { t: "command", command });
    });
  }

  pushPermissions(deviceId: string, permissions: Permissions): void {
    const row = this.repo.getDevice(deviceId);
    if (row === null) return;
    const conn = this.connections.get(row.bridgeId);
    if (conn === undefined) return;
    this.write(conn, { t: "permissions", deviceId, permissions });
  }

  /* ------------------------------- plumbing ------------------------------- */

  private write(conn: Connection, frame: Parameters<typeof encodeFrame>[0]): void {
    if (!conn.socket.writable) return;
    conn.socket.write(encodeFrame(frame));
  }

  private failConnection(conn: Connection, code: string): void {
    for (const { resolve } of conn.pending.values()) {
      resolve({
        id: "",
        ok: false,
        error: { code: code as never, message: "The bridge went away." },
      });
    }
    conn.pending.clear();
  }

  private accept(socket: net.Socket): void {
    socket.setNoDelay(true);
    const reader = new FrameReader();
    let bridge: BridgeDescriptor | null = null;
    const conn: Connection = {
      socket,
      bridge: { id: "" } as BridgeDescriptor,
      reader,
      pending: new Map(),
    };

    const helloTimer = setTimeout(() => {
      if (bridge === null) socket.destroy();
    }, HELLO_TIMEOUT_MS);
    helloTimer.unref?.();

    socket.on("data", (chunk) => {
      let frames: BridgeFrame[];
      try {
        frames = reader.push(chunk) as BridgeFrame[];
      } catch (err) {
        this.options.log(`device bridge: ${err instanceof Error ? err.message : String(err)}`);
        socket.destroy();
        return;
      }
      for (const frame of frames) {
        if (frame.t === "hello") {
          if (bridge !== null) continue;
          if (!compatibleProtocol(frame.bridge.protocol)) {
            this.options.log(
              `device bridge: ${frame.bridge.name} speaks protocol ${frame.bridge.protocol}, this server ${1}`,
            );
            socket.write(encodeFrame({ t: "log", level: "error", line: "protocol mismatch" }));
            socket.destroy();
            return;
          }
          bridge = frame.bridge;
          clearTimeout(helloTimer);
          this.register(conn, frame.bridge);
          this.write(conn, { t: "hello_ok", bridgeId: frame.bridge.id });
          continue;
        }
        if (bridge === null) continue;
        this.onFrame(conn, frame);
      }
    });

    socket.on("error", () => {
      // The close handler does the bookkeeping.
    });

    socket.on("close", () => {
      clearTimeout(helloTimer);
      if (bridge === null) return;
      this.failConnection(conn, "bridge_offline");
      if (this.connections.get(bridge.id) === conn) {
        this.connections.delete(bridge.id);
        this.service.bridgeGone(bridge.id);
        this.options.log(`device bridge: ${bridge.name} disconnected`);
      }
    });
  }

  private register(conn: Connection, bridge: BridgeDescriptor): void {
    const previous = this.connections.get(bridge.id);
    if (previous !== undefined) {
      this.failConnection(previous, "bridge_replaced");
      previous.socket.destroy();
    }
    conn.bridge = bridge;
    this.connections.set(bridge.id, conn);
    const now = new Date().toISOString();
    this.repo.upsertBridge({
      id: bridge.id,
      name: bridge.name,
      kind: bridge.kind,
      // A local socket is authorized by the filesystem (0600), not a token: empty hash says so.
      tokenHash: "",
      version: bridge.version,
      capabilities: bridge.capabilities,
      now,
    });
    this.options.log(
      `device bridge: ${bridge.name} (${bridge.kind} ${bridge.version}) connected on ${this.endpoint}`,
    );
  }

  private onFrame(conn: Connection, frame: BridgeFrame): void {
    switch (frame.t) {
      case "devices":
        for (const device of frame.devices) this.service.applyDeviceReport(conn.bridge.id, device);
        break;
      case "device":
        this.service.applyDeviceReport(conn.bridge.id, frame.device);
        break;
      case "snapshot":
        this.service.applySnapshot(frame.deviceId, frame.snapshot);
        break;
      case "event":
        this.service.applyEvent(frame.event);
        break;
      case "env":
        this.env = frame.data;
        break;
      case "result": {
        const pending = conn.pending.get(frame.result.id);
        if (pending === undefined) break;
        conn.pending.delete(frame.result.id);
        pending.resolve(frame.result);
        break;
      }
      case "pong":
        break;
      case "log":
        this.options.log(`device bridge [${conn.bridge.name}]: ${frame.line}`);
        break;
      default:
        break;
    }
  }
}
