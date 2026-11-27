/**
 * Finding an adb — the one decision every ADB tool gets wrong by guessing. Four sources in
 * order (design §5.2):
 *
 * 1. **Explicit**: `--adb <path>`, `ADELIE_ADB_PATH`, or the desktop's setting. A person who
 *    names a binary gets that one, even if it is not executable (the error then says so).
 * 2. **PATH**: whatever `adb` resolves to. This is the one that shares a server with Android
 *    Studio and scrcpy, which is the normal case on a developer's machine.
 * 3. **Well-known installs**: Android Studio's platform-tools, and a scrcpy folder beside it.
 * 4. **Bundled**: the platform-tools the installer carries (`resources/platform-tools`).
 *    Last on purpose: a bundled adb starting its own server while the user's own one runs is
 *    exactly the version war §11 warns about.
 *
 * Trusting the user's server is the point: when a server is already running on 5037, we do NOT
 * start another one — `adb devices` simply talks to it. `start-server` is only called when
 * `adb devices` reports it could not connect.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type AdbSource = "setting" | "env" | "path" | "android-studio" | "scrcpy" | "bundled";

export interface AdbLocation {
  found: boolean;
  /** Absolute path (or the bare command found on PATH). */
  path: string | null;
  source: AdbSource | "missing";
  /** One line for the log and for the panel when the answer is "no adb". */
  message?: string;
}

export interface DiscoveryInput {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  home: string;
  /** Defaults to `which`/`where` through PATH. */
  which: (command: string) => string | null;
  exists: (file: string) => boolean;
}

/** `platform-tools` folders Android Studio and friends install into, per platform. */
function studioCandidates(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  home: string,
): string[] {
  const exe = platform === "win32" ? "adb.exe" : "adb";
  if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? path.win32.join(home, "AppData", "Local");
    return [
      path.win32.join(local, "Android", "Sdk", "platform-tools", exe),
      path.win32.join(home, "AppData", "Local", "Android", "Sdk", "platform-tools", exe),
    ];
  }
  if (platform === "darwin") {
    return [
      path.posix.join(home, "Library", "Android", "sdk", "platform-tools", exe),
      "/opt/homebrew/share/android-commandlinetools/platform-tools/adb",
    ];
  }
  return [
    path.posix.join(home, "Android", "Sdk", "platform-tools", exe),
    path.posix.join(home, "Android", "sdk", "platform-tools", exe),
    "/usr/lib/android-sdk/platform-tools/adb",
  ];
}

/** scrcpy does not carry adb, but people often drop it next to adb or point here. */
function scrcpyCandidates(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  home: string,
): string[] {
  const exe = platform === "win32" ? "adb.exe" : "adb";
  const dirs: string[] = [];
  if (env.SCRCPY_DIR) dirs.push(env.SCRCPY_DIR);
  if (platform === "win32") {
    dirs.push(
      path.win32.join(env.LOCALAPPDATA ?? path.win32.join(home, "AppData", "Local"), "scrcpy"),
    );
    dirs.push("C:\\scrcpy");
  } else {
    dirs.push(path.posix.join(home, "scrcpy"));
    dirs.push("/opt/scrcpy");
  }
  return dirs.map((dir) =>
    platform === "win32" ? path.win32.join(dir, exe) : path.posix.join(dir, exe),
  );
}

/**
 * Picks one adb. `bundled` is the installer's platform-tools; pass it only when the desktop
 * app found that folder (a plain `penguin device-bridge` has none).
 */
export function findAdb(input: DiscoveryInput, bundled?: string | null): AdbLocation {
  const explicit = input.env.ADELIE_ADB_PATH;
  if (typeof explicit === "string" && explicit.trim() !== "") {
    return input.exists(explicit)
      ? { found: true, path: explicit, source: "setting" }
      : {
          found: false,
          path: null,
          source: "missing",
          message: `ADELIE_ADB_PATH points at ${explicit}, which does not exist.`,
        };
  }
  const fromPath = input.which("adb");
  if (fromPath !== null) return { found: true, path: fromPath, source: "path" };

  for (const candidate of studioCandidates(input.platform, input.env, input.home)) {
    if (input.exists(candidate)) return { found: true, path: candidate, source: "android-studio" };
  }
  for (const candidate of scrcpyCandidates(input.platform, input.env, input.home)) {
    if (input.exists(candidate)) return { found: true, path: candidate, source: "scrcpy" };
  }
  if (typeof bundled === "string" && bundled !== "" && input.exists(bundled)) {
    return { found: true, path: bundled, source: "bundled" };
  }
  return {
    found: false,
    path: null,
    source: "missing",
    message:
      "No adb found. Install Android platform-tools (or Android Studio), put adb on PATH, " +
      "or set ADELIE_ADB_PATH.",
  };
}

/** The real `which`/`where`: the first executable `adb` on PATH, expanded to an absolute path. */
export function whichOnPath(command: string): string | null {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter((d) => d !== "");
  const names =
    process.platform === "win32" ? [`${command}.exe`, `${command}.bat`, command] : [command];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Next candidate.
      }
    }
  }
  return null;
}

export function defaultDiscoveryInput(
  env: Record<string, string | undefined> = process.env,
  home = env.HOME ?? env.USERPROFILE ?? os.homedir(),
): DiscoveryInput {
  return {
    platform: process.platform,
    env,
    home,
    which: whichOnPath,
    exists: (file) => fs.existsSync(file),
  };
}

/* ------------------------------------------------------------------------- */
/* Running adb                                                                */
/* ------------------------------------------------------------------------- */

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * The one seam every adb call goes through. Tests replace it with a script or a fake; nothing
 * else in this package spawns a process. Kept deliberately small: file, args, a deadline.
 */
export type AdbRunner = (
  file: string,
  args: string[],
  options: { timeoutMs: number },
) => Promise<RunResult>;

export const nodeAdbRunner: AdbRunner = (file, args, { timeoutMs }) =>
  new Promise<RunResult>((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const code =
          error === null
            ? 0
            : typeof (error as { code?: unknown }).code === "number"
              ? ((error as { code: number }).code as number)
              : 1;
        resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? error ?? "") });
      },
    );
  });

/** Binary output (`exec-out screencap -p`) needs bytes, not a decoded string. */
export type AdbBinaryRunner = (
  file: string,
  args: string[],
  options: { timeoutMs: number },
) => Promise<{
  code: number;
  stdout: Buffer;
  stderr: string;
}>;

export const nodeAdbBinaryRunner: AdbBinaryRunner = (file, args, { timeoutMs }) =>
  new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true, encoding: "buffer" },
      (error, stdout, stderr) => {
        const code =
          error === null
            ? 0
            : typeof (error as { code?: unknown }).code === "number"
              ? ((error as { code: number }).code as number)
              : 1;
        resolve({
          code,
          stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? ""),
          stderr: String(stderr ?? ""),
        });
      },
    );
  });
