/**
 * The ADB device bridge as this shell tells it to run: a utilityProcess on the
 * `adelie-device-bridge` entry (`--help` in @adelie/device-adb documents every flag), given this
 * app's data root, a log file of its own, and — on Windows packages that carry one — the
 * platform-tools adb shipped inside the installer. The bridge finds adb, samples the phones and
 * connects to the server's socket by itself; the shell only forks it and restarts it on death
 * (device-bridge-process.ts), so everything here is pure and testable without Electron.
 */
import path from "node:path";

export const DEVICE_BRIDGE_ENTRY = "device-bridge.js";
export const DEVICE_BRIDGE_LOG = "device-bridge.log";

/**
 * The restart ladder, in milliseconds: 1s, 2s, 5s, 10s, then 30s for every attempt after. A
 * bridge that keeps dying is a broken adb or a broken machine, and neither is worth an error
 * dialog — the phone page already explains a bridge that is not connected. The app itself stays.
 */
const BRIDGE_RESTART_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

/** The forked entry: tsup bundles @adelie/device-adb's bridge-bin into this package's dist. */
export function deviceBridgeEntryPath(appPath: string): string {
  return path.join(appPath, "dist", DEVICE_BRIDGE_ENTRY);
}

/** The bridge appends its own lines here, in addition to the ones desktop.log keeps. */
export function deviceBridgeLogFile(userDataDir: string): string {
  return path.join(userDataDir, "logs", DEVICE_BRIDGE_LOG);
}

/**
 * Where a packaged build would carry platform-tools' adb (Windows only — macOS and Linux
 * desktop builds use the adb on PATH like anyone else). Null on other platforms; the caller
 * still checks that the file exists, because a directory in the build is not a promise.
 */
export function bundledAdbPath(resourcesPath: string, platform: string): string | null {
  if (platform !== "win32") return null;
  return path.join(resourcesPath, "platform-tools", "adb.exe");
}

/** The bridge's argv, in the order its own parser documents them. */
export function deviceBridgeArguments(opts: {
  dataRoot: string;
  logFile: string;
  /** The name the device page shows for this computer. */
  name: string;
  /** The bundled adb to fall back to; null leaves the search to PATH and well-known installs. */
  bundledAdb: string | null;
}): string[] {
  return [
    "--data-root",
    opts.dataRoot,
    "--kind",
    "desktop",
    "--name",
    opts.name,
    "--log",
    opts.logFile,
    ...(opts.bundledAdb === null ? [] : ["--bundled-adb", opts.bundledAdb]),
  ];
}

/** How long to wait before the next fork; the last rung repeats for every attempt after it. */
export function bridgeRestartDelayMs(attempt: number): number {
  const index = Math.min(Math.max(Math.trunc(attempt), 0), BRIDGE_RESTART_MS.length - 1);
  return BRIDGE_RESTART_MS[index] ?? BRIDGE_RESTART_MS[BRIDGE_RESTART_MS.length - 1]!;
}
