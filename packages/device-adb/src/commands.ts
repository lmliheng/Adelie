/**
 * The fifteen command ops, one `switch` — this is where "a person asked the phone to do
 * something" becomes an adb call. Everything validated here is validated badly elsewhere, so
 * it is validated here: a missing path, a text that cannot be typed, a file larger than the
 * local channel carries.
 *
 * Results are plain JSON (`data`) and the host stores/returns them verbatim. A screenshot or
 * a pulled file travels inline as base64: the local pipe is the only channel P0 has, and the
 * size ceiling below is what keeps one big photo from killing the bridge connection.
 */
import path from "node:path";
import { DeviceProtocolError, type DeviceCommand } from "@adelie/device";
import type { AdbClient } from "./adb-client.js";
import { shellQuote } from "./adb-client.js";
import { collectApps, collectNotifications } from "./collect.js";

/**
 * Inline payload ceiling. The protocol's frame limit is 12 MiB; base64 inflates by 4/3 and a
 * frame carries the JSON around it, so 6 MiB of bytes is the honest limit for one command.
 * Above it the answer is a sentence a person can act on, not a silently dropped frame.
 */
export const MAX_PAYLOAD_BYTES = 6 * 1024 * 1024;
/** Shell output is read by an agent through a terminal; 256 KiB is already a lot of lines. */
export const MAX_SHELL_OUTPUT = 256 * 1024;

export interface CommandContext {
  /** Re-read identity and readings, and send the snapshot frame the host stores. */
  refresh: () => Promise<string>;
}

function fail(
  code: "bad_request" | "unsupported" | "not_found" | "command_failed",
  message: string,
): never {
  throw new DeviceProtocolError(code, message);
}

function stringArg(args: Record<string, unknown> | undefined, key: string, what: string): string {
  const value = args?.[key];
  if (typeof value !== "string" || value.trim() === "") fail("bad_request", `${what} is required.`);
  return value;
}

function intArg(args: Record<string, unknown> | undefined, key: string): number {
  const value = args?.[key];
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) fail("bad_request", `${key} must be a number.`);
  return Math.round(parsed);
}

function payload(
  bytes: Buffer,
  mimeType: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  if (bytes.byteLength > MAX_PAYLOAD_BYTES) {
    fail(
      "unsupported",
      `The file is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB; one command carries at most ${MAX_PAYLOAD_BYTES / 1024 / 1024} MB.`,
    );
  }
  return { mimeType, bytes: bytes.byteLength, base64: bytes.toString("base64"), ...extra };
}

function decodeBase64(value: unknown, what: string): Buffer {
  if (typeof value !== "string" || value === "") fail("bad_request", `${what} is required.`);
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength === 0) fail("bad_request", `${what} is not base64 data.`);
  return bytes;
}

/** Enough for the panel to render an image and for the CLI to name the file. */
function guessMime(name: string, fallback = "application/octet-stream"): string {
  switch (path.posix.extname(name).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".txt":
    case ".log":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".mp4":
      return "video/mp4";
    case ".apk":
      return "application/vnd.android.package-archive";
    default:
      return fallback;
  }
}

/**
 * Runs one command and returns what the host should hand back. Throws `DeviceProtocolError`
 * for anything a caller should see as a typed refusal.
 */
export async function executeCommand(
  client: AdbClient,
  command: DeviceCommand,
  ctx: CommandContext,
): Promise<unknown> {
  const args = command.args;
  switch (command.op) {
    case "screenshot": {
      // `exec-out` keeps the PNG bytes intact; `shell` would translate CRLF and break them.
      const png = await client.screencap();
      if (png === null || png.byteLength === 0)
        fail("command_failed", "The device did not return a screenshot.");
      return payload(png, "image/png");
    }
    case "files.list": {
      const remotePath = typeof args?.path === "string" && args.path !== "" ? args.path : "/sdcard";
      const entries = await client.ls(remotePath);
      return { path: remotePath, entries };
    }
    case "files.pull": {
      const remotePath = stringArg(args, "path", "path");
      const bytes = await client.pull(remotePath);
      if (bytes === null) fail("command_failed", `Could not read ${remotePath} on the device.`);
      return payload(bytes, guessMime(remotePath), {
        name: path.posix.basename(remotePath),
        path: remotePath,
      });
    }
    case "files.push": {
      const remotePath = stringArg(args, "path", "path");
      const bytes = decodeBase64(args?.data, "data");
      const { code, stdout } = await client.push(bytes, remotePath);
      if (code !== 0 || /error|failed/i.test(stdout))
        fail("command_failed", `adb push failed: ${stdout.trim()}`);
      return { path: remotePath, bytes: bytes.byteLength };
    }
    case "apps.list": {
      const all = args?.all === true;
      return { apps: await collectApps(client, all), all };
    }
    case "apps.install": {
      const apk = decodeBase64(args?.apk, "apk");
      const { code, stdout } = await client.installApk(apk);
      if (code !== 0 || !/success/i.test(stdout))
        fail("command_failed", `adb install failed: ${stdout.trim()}`);
      return { bytes: apk.byteLength, output: stdout.trim() };
    }
    case "apps.uninstall": {
      const packageName = stringArg(args, "packageName", "packageName");
      const { code, stdout } = await client.uninstall(packageName);
      if (code !== 0 || !/success/i.test(stdout))
        fail("command_failed", `adb uninstall failed: ${stdout.trim()}`);
      return { packageName, output: stdout.trim() };
    }
    case "shell.exec": {
      const shellCommand = stringArg(args, "command", "command");
      const { code, stdout, stderr } = await client.run0(["shell", shellCommand], 60_000);
      const cut = (text: string) =>
        text.length > MAX_SHELL_OUTPUT ? `${text.slice(0, MAX_SHELL_OUTPUT)}\n…(truncated)` : text;
      return { command: shellCommand, code, stdout: cut(stdout), stderr: cut(stderr) };
    }
    case "input.tap": {
      const x = intArg(args, "x");
      const y = intArg(args, "y");
      await client.shell(`input tap ${x} ${y}`, 20_000);
      return { x, y };
    }
    case "input.swipe": {
      const from = { x: intArg(args, "x1"), y: intArg(args, "y1") };
      const to = { x: intArg(args, "x2"), y: intArg(args, "y2") };
      const duration = args?.durationMs === undefined ? undefined : intArg(args, "durationMs");
      const tail = duration === undefined ? "" : ` ${Math.max(0, duration)}`;
      await client.shell(`input swipe ${from.x} ${from.y} ${to.x} ${to.y}${tail}`, 30_000);
      return { from, to, durationMs: duration ?? null };
    }
    case "input.text": {
      const text = stringArg(args, "text", "text");
      // `input text` is ASCII only (design §4.4): Chinese needs a companion keyboard, so say
      // that instead of typing a row of question marks.
      if (/[^\x20-\x7e]/.test(text)) {
        fail(
          "unsupported",
          "adb's `input text` types ASCII only. Install the ADBKeyboard IME on the phone (or use the companion app) for non-ASCII input.",
        );
      }
      // The device's `input` treats `%s` as a space; quoting keeps shell metacharacters literal
      // (`%` is only special when followed by `s`, so a literal percent survives).
      await client.shell(`input text ${shellQuote(text.replace(/ /g, "%s"))}`, 30_000);
      return { length: text.length };
    }
    case "input.key": {
      const key = args?.key;
      const name =
        typeof key === "number" ? String(key) : typeof key === "string" ? key.trim() : "";
      if (!/^(?:[A-Za-z0-9_]+)$/.test(name))
        fail("bad_request", "key must be a key name (HOME) or a key code (3).");
      await client.shell(`input keyevent ${name}`, 20_000);
      return { key: name };
    }
    case "notify.list": {
      const limit =
        args?.limit === undefined ? 20 : Math.max(1, Math.min(50, intArg(args, "limit")));
      const notifications = (await collectNotifications(client)).slice(0, limit);
      return { notifications, count: notifications.length };
    }
    case "snapshot.refresh":
      return { at: await ctx.refresh() };
    case "pair.wifi.start":
      // Handled by the bridge itself: pairing needs the adb client, not a device.
      fail("unsupported", "Pairing is started by the bridge, not executed on a device.");
  }
}
