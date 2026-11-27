/**
 * The shell's own half of the device bridge: forking it as a utilityProcess (the same Node
 * runtime the embedded server uses, isolated from the main process), forwarding its output into
 * desktop.log, and handing back the child so main.ts can restart it. The bridge is optional —
 * a machine with no adb, no phone or a user who closed the panel simply has nothing to show —
 * so nothing here raises an error the user would see.
 */
import { utilityProcess } from "electron";
import type { UtilityProcess } from "electron";
import {
  deviceBridgeArguments,
  deviceBridgeEntryPath,
  deviceBridgeLogFile,
} from "./device-bridge.js";

export interface RunningDeviceBridge {
  child: UtilityProcess;
}

export function forkDeviceBridge(opts: {
  /** The app directory (Electron's appPath), which holds this package's dist. */
  appPath: string;
  /** The data root the embedded server runs on — the bridge connects to that server's socket. */
  dataRoot: string;
  /** The profile's userData directory; the bridge's log file goes under its logs/. */
  userDataDir: string;
  /** Shown on the devices page as the name of this computer. */
  name: string;
  /** A platform-tools adb from the installer, or null. */
  bundledAdb: string | null;
  log: (chunk: string, stream: "stdout" | "stderr") => void;
}): RunningDeviceBridge {
  const child = utilityProcess.fork(
    deviceBridgeEntryPath(opts.appPath),
    deviceBridgeArguments({
      dataRoot: opts.dataRoot,
      logFile: deviceBridgeLogFile(opts.userDataDir),
      name: opts.name,
      bundledAdb: opts.bundledAdb,
    }),
    { serviceName: "adelie-device-bridge", stdio: "pipe" },
  );
  child.stdout?.on("data", (chunk: Buffer) => opts.log(String(chunk), "stdout"));
  child.stderr?.on("data", (chunk: Buffer) => opts.log(String(chunk), "stderr"));
  return { child };
}
