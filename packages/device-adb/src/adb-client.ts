/**
 * One device's adb conversation. Every method takes the path it needs and returns what adb
 * said; parsing is in `parse.ts` and composition in `collect.ts`, so this file stays a thin
 * shell over the injected runner — which is what makes the whole package testable without a
 * phone (`--shell adb` in the tests is a script).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AdbBinaryRunner, AdbRunner, RunResult } from "./adb-discovery.js";
import { nodeAdbBinaryRunner, nodeAdbRunner } from "./adb-discovery.js";
import { parseDevices, type AdbDeviceLine, type RemoteFile } from "./parse.js";

/** A claim on a phone. Writes into a scratch directory only; never into the data root. */
const PUSH_DIR = path.join(os.tmpdir(), "adelie-device-adb");

export class AdbClient {
  constructor(
    readonly file: string,
    private readonly run: AdbRunner = nodeAdbRunner,
    private readonly runBinary: AdbBinaryRunner = nodeAdbBinaryRunner,
    private readonly serial?: string,
  ) {}

  /** A client pinned to one device (everything below goes through `-s`). */
  forDevice(serial: string): AdbClient {
    return new AdbClient(this.file, this.run, this.runBinary, serial);
  }

  private withSerial(args: string[]): string[] {
    return this.serial === undefined ? args : ["-s", this.serial, ...args];
  }

  async run0(
    args: string[],
    timeoutMs = 15_000,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return this.run(this.file, this.withSerial(args), { timeoutMs });
  }

  async version(): Promise<string | null> {
    const { code, stdout } = await this.run(this.file, ["version"], { timeoutMs: 10_000 });
    if (code !== 0) return null;
    const m = /version\s+([\d.]+)/i.exec(stdout);
    return m?.[1] ?? stdout.trim().split("\n")[0]?.trim() ?? null;
  }

  async devices(): Promise<AdbDeviceLine[]> {
    const { code, stdout, stderr } = await this.run0(["devices", "-l"], 20_000);
    if (code !== 0 && /cannot connect|failed to start|daemon not running/i.test(stderr + stdout)) {
      // A server that is not up answers here rather than in `devices`; one start is enough.
      await this.run(this.file, ["start-server"], { timeoutMs: 30_000 });
      const retry = await this.run0(["devices", "-l"], 20_000);
      return parseDevices(retry.stdout);
    }
    return parseDevices(stdout);
  }

  async shell(command: string, timeoutMs = 20_000): Promise<string> {
    const { stdout } = await this.run0(["shell", command], timeoutMs);
    return stdout;
  }

  /** `exec-out` keeps bytes intact (no pty, no CRLF translation) — what screenshots need. */
  async execOut(args: string[], timeoutMs = 60_000): Promise<Buffer | null> {
    const { code, stdout } = await this.runBinary(
      this.file,
      this.withSerial(["exec-out", ...args]),
      {
        timeoutMs,
      },
    );
    return code === 0 ? stdout : null;
  }

  async screencap(): Promise<Buffer | null> {
    return this.execOut(["screencap", "-p"], 90_000);
  }

  async pull(remotePath: string): Promise<Buffer | null> {
    // `adb pull` writes a local file, and this process's working directory is not the
    // caller's machine — so the bytes come back over `exec-out cat` instead. Fine for photos
    // and logs; the protocol caps what a single frame may carry.
    return this.execOut(["cat", remotePath], 120_000);
  }

  /** Writes the bytes to a scratch file and installs it; returns adb's own answer. */
  async push(bytes: Buffer, remotePath: string): Promise<{ code: number; stdout: string }> {
    fs.mkdirSync(PUSH_DIR, { recursive: true });
    const local = path.join(PUSH_DIR, `${process.pid}-${Date.now()}-${path.basename(remotePath)}`);
    fs.writeFileSync(local, bytes);
    try {
      return await this.run0(["push", local, remotePath], 180_000);
    } finally {
      fs.rmSync(local, { force: true });
    }
  }

  async installApk(bytes: Buffer): Promise<{ code: number; stdout: string }> {
    fs.mkdirSync(PUSH_DIR, { recursive: true });
    const local = path.join(PUSH_DIR, `${process.pid}-${Date.now()}.apk`);
    fs.writeFileSync(local, bytes);
    try {
      return await this.run0(["install", "-r", local], 300_000);
    } finally {
      fs.rmSync(local, { force: true });
    }
  }

  async uninstall(packageName: string): Promise<{ code: number; stdout: string }> {
    return this.run0(["uninstall", packageName], 120_000);
  }

  async connect(endpoint: string): Promise<RunResult> {
    return this.run(this.file, ["connect", endpoint], { timeoutMs: 30_000 });
  }

  /** Android 11's `adb pair <host:port> <code>`. */
  async pair(endpoint: string, code: string): Promise<RunResult> {
    return this.run(this.file, ["pair", endpoint, code], { timeoutMs: 60_000 });
  }

  async mdnsServices(): Promise<string> {
    const { stdout } = await this.run(this.file, ["mdns", "services"], { timeoutMs: 15_000 });
    return stdout;
  }

  async ls(remotePath: string): Promise<RemoteFile[]> {
    const stdout = await this.shell(`ls -la ${shellQuote(remotePath)}`);
    return (await import("./parse.js")).parseListing(stdout);
  }
}

/** POSIX single-quote for a path handed to the phone's shell. */
export function shellQuote(value: string): string {
  if (/^[\w@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
