/**
 * What the shell tells the device bridge to do: the bundled entry, where its log lives, the adb
 * an installer may carry (Windows only), the argv its own parser documents, and the restart
 * ladder. The fork itself is Electron's and is exercised only in the app, so this file keeps to
 * the pure half — the same split main-window-open and pet-window use.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bridgeRestartDelayMs,
  bundledAdbPath,
  deviceBridgeArguments,
  deviceBridgeEntryPath,
  deviceBridgeLogFile,
} from "../src/device-bridge.js";

describe("deviceBridgeEntryPath", () => {
  it("is the tsup bundle inside this package's dist", () => {
    expect(deviceBridgeEntryPath("/app")).toBe(path.join("/app", "dist", "device-bridge.js"));
  });
});

describe("deviceBridgeLogFile", () => {
  it("sits with the other logs, under its own name", () => {
    expect(deviceBridgeLogFile("/ud")).toBe(path.join("/ud", "logs", "device-bridge.log"));
  });
});

describe("bundledAdbPath", () => {
  it("is platform-tools' adb.exe where Windows packages carry one, nothing elsewhere", () => {
    expect(bundledAdbPath(path.join("/res"), "win32")).toBe(
      path.join("/res", "platform-tools", "adb.exe"),
    );
    expect(bundledAdbPath("/res", "darwin")).toBeNull();
    expect(bundledAdbPath("/res", "linux")).toBeNull();
  });
});

describe("deviceBridgeArguments", () => {
  it("gives the bridge the data root, this computer's name and its own log", () => {
    expect(
      deviceBridgeArguments({
        dataRoot: "/d",
        logFile: "/d/logs/device-bridge.log",
        name: "workstation",
        bundledAdb: null,
      }),
    ).toEqual([
      "--data-root",
      "/d",
      "--kind",
      "desktop",
      "--name",
      "workstation",
      "--log",
      "/d/logs/device-bridge.log",
    ]);
  });

  it("adds --bundled-adb only when the build carries an adb", () => {
    const args = deviceBridgeArguments({
      dataRoot: "/d",
      logFile: "/l",
      name: "pc",
      bundledAdb: "/res/platform-tools/adb.exe",
    });
    expect(args.slice(-2)).toEqual(["--bundled-adb", "/res/platform-tools/adb.exe"]);
  });
});

describe("bridgeRestartDelayMs", () => {
  it("walks 1s…30s and then repeats the last rung", () => {
    expect([0, 1, 2, 3, 4, 5, 99].map(bridgeRestartDelayMs)).toEqual([
      1000, 2000, 5000, 10000, 30000, 30000, 30000,
    ]);
    expect(bridgeRestartDelayMs(-1)).toBe(1000);
  });
});
