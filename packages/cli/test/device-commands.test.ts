/**
 * `penguin device`, driven through `cli()` in-process against the fake server's devices
 * handler: the request each command sends (path, op, and `approve` only where the op writes),
 * the two output contracts (`--json` and the human table), the file a screenshot lands in, and
 * the one-line error for a server with no bridge — the same shape the browser commands use.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPermissions } from "@adelie/device";
import type { DeviceView, DevicesResponse } from "@adelie/server/api";
import { cli } from "../src/index.js";
import { FakeServer } from "./fake-server.js";

const DEVICE: DeviceView = {
  id: "pixel-8",
  bridgeId: "adb-demo",
  kind: "android",
  name: "Google Pixel 8",
  serial: "R2CX9001ABC",
  transport: "usb",
  platform: "Android 15",
  state: "online",
  capabilities: ["info:read", "screen:view", "shell:exec"],
  permissions: { ...defaultPermissions(), "screen:view": true },
  pairedAt: "2026-11-20T10:00:00.000Z",
  lastSeenAt: new Date().toISOString(),
  prefs: {},
  bridgeOnline: true,
  snapshot: null,
  snapshotAgeMs: null,
  grants: ["default_project"],
};

const PNG_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]).toString("base64");

let server: FakeServer;
let uninstall: () => void;
let stdout: string[];
let stderr: string[];
let scratch: string;
let outSpy: { mockRestore(): void };
let errSpy: { mockRestore(): void };

const out = () => stdout.join("");
const err = () => stderr.join("");
const deviceRequests = () => server.requests.filter((r) => r.path.includes("/devices"));
const lastBody = () => deviceRequests().at(-1)?.body;

beforeEach(() => {
  server = new FakeServer();
  uninstall = server.install();
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "penguin-device-cli-"));
  stdout = [];
  stderr = [];
  outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  outSpy.mockRestore();
  errSpy.mockRestore();
  uninstall();
  fs.rmSync(scratch, { recursive: true, force: true });
});

const list = (): DevicesResponse => ({
  devices: [DEVICE],
  bridges: [
    {
      id: "adb-demo",
      name: "This computer",
      kind: "desktop",
      version: "0.8.7",
      online: true,
      lastSeenAt: new Date().toISOString(),
      devices: 1,
      revokedAt: null,
    },
  ],
  adb: { found: true, path: "/usr/bin/adb", version: "35.0.2", source: "path" },
});

describe("list and info", () => {
  it("list --json prints the server's answer and asks the project's devices", async () => {
    const body = list();
    server.devices = ({ method, path: route }) =>
      method === "GET" && route === "" ? { body } : { status: 404, body: {} };
    expect(await cli(["device", "list", "--json"])).toBe(0);
    expect(JSON.parse(out())).toEqual(body);
    expect(deviceRequests()[0]?.path).toBe("/api/projects/default_project/devices");
  });

  it("list prints one row per phone, and the adb hint when no adb was found", async () => {
    server.devices = () => ({
      body: {
        devices: [
          DEVICE,
          { ...DEVICE, id: "mi-14", name: "Xiaomi 14", state: "offline", bridgeOnline: false },
        ],
        bridges: list().bridges,
        adb: {
          found: false,
          path: null,
          version: null,
          source: "missing",
          message: "no adb on PATH.",
        },
      },
    });
    expect(await cli(["device", "list"])).toBe(0);
    expect(out()).toContain("Google Pixel 8");
    expect(out()).toContain("Xiaomi 14");
    expect(err()).toContain("no adb on PATH.");
  });

  it("info --json asks one device and prints its detail", async () => {
    const detail = { device: DEVICE, events: [] };
    server.devices = ({ path: route }) =>
      route === "/pixel-8" ? { body: detail } : { status: 404, body: {} };
    expect(await cli(["device", "info", "pixel-8", "--json"])).toBe(0);
    expect(JSON.parse(out())).toEqual(detail);
    expect(deviceRequests()[0]?.path).toBe("/api/projects/default_project/devices/pixel-8");
  });
});

describe("commands", () => {
  it("screenshot writes the decoded bytes and sends no approval (a read)", async () => {
    server.devices = ({ method, path: route }) =>
      method === "POST" && route === "/pixel-8/commands"
        ? { body: { ok: true, data: { base64: PNG_BASE64, mimeType: "image/png", bytes: 5 } } }
        : { status: 404, body: {} };
    const target = path.join(scratch, "shot.png");
    expect(await cli(["device", "screenshot", "pixel-8", "-o", target])).toBe(0);
    expect(fs.readFileSync(target).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]))).toBe(true);
    expect(lastBody()).toEqual({ op: "screenshot" });
    expect(out()).toContain(target);
  });

  it("shell carries approve:true and prints stdout, passing a non-zero exit code through", async () => {
    server.devices = () => ({
      body: { ok: true, data: { code: 3, stdout: "a\n", stderr: "b\n" } },
    });
    expect(await cli(["device", "shell", "pixel-8", "false"])).toBe(3);
    expect(lastBody()).toEqual({ op: "shell.exec", args: { command: "false" }, approve: true });
    expect(out()).toBe("a\n");
    expect(err()).toBe("b\n");
  });

  it("a refused command prints one error line and exits 1", async () => {
    server.devices = () => ({
      body: {
        ok: false,
        error: { code: "capability_denied", message: "This device does not allow screen:view." },
      },
    });
    expect(await cli(["device", "screenshot", "pixel-8", "-o", path.join(scratch, "x.png")])).toBe(
      1,
    );
    expect(err()).toBe("error: capability_denied: This device does not allow screen:view.\n");
  });

  it("with no device bridge the list fails in one line, not a stack trace", async () => {
    expect(await cli(["device", "list"])).toBe(1);
    expect(err()).toBe("error: bridge_offline: No device bridge is running.\n");
  });
});
