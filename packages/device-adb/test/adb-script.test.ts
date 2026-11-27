import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AdbClient } from "../src/adb-client.js";
import { findAdb } from "../src/adb-discovery.js";

/**
 * The one thing this machine CAN do without a phone: run a real executable as `adb` and check
 * that the process layer (discovery's runner, the retry after a dead server, binary output)
 * behaves. Everything above it is tested against scripts.
 */
function fakeAdb(): { file: string; state: string; dir: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "adelie-fake-adb-"));
  const state = path.join(dir, "server-started");
  const file = path.join(dir, "adb");
  writeFileSync(
    file,
    `#!/bin/sh
case "$1" in
  version) echo "Android Debug Bridge version 1.0.41"; exit 0 ;;
  devices)
    if [ ! -f "${state}" ]; then
      echo 1 > "${state}"
      echo "error: cannot connect to daemon" >&2
      exit 1
    fi
    printf 'List of devices attached\\nR58M12ABC\\tdevice model:Pixel_8 transport_id:1\\n'
    exit 0 ;;
  start-server) echo "starting server"; exit 0 ;;
  shell) echo "shell:$2"; exit 0 ;;
  exec-out) printf 'PNGDATA'; exit 0 ;;
esac
exit 0
`,
    { mode: 0o755 },
  );
  chmodSync(file, 0o755);
  return { file, state, dir };
}

const { file, state } = fakeAdb();

afterAll(() => {
  // The tmp directory is inside the machine's tmp; the test runner owns it.
});

// A fake adb has to be a real executable, and on a stock Windows runner the only way to make
// one is a .cmd/.bat — which Node refuses to spawn without a shell (the fix for CVE-2024-27980)
// while `nodeAdbRunner` deliberately spawns without one, so that nothing from a phone's shell
// can reach the host's. Real adb is adb.exe and spawns fine there; this fixture cannot, so the
// process layer is pinned on Linux/macOS only.
const describeRealExecutable = describe.skipIf(process.platform === "win32");

describeRealExecutable("AdbClient over a real executable", () => {
  it("reads the version", async () => {
    expect(await new AdbClient(file).version()).toBe("1.0.41");
  });

  it("starts the server once after a dead daemon, then lists the device", async () => {
    const client = new AdbClient(file);
    expect(existsSync(state)).toBe(false);
    const devices = await client.devices();
    expect(existsSync(state)).toBe(true);
    expect(devices).toEqual([
      {
        serial: "R58M12ABC",
        state: "device",
        model: "Pixel_8",
        transport: "usb",
        device: undefined,
      },
    ]);
  });

  it("runs a shell command and keeps exec-out bytes", async () => {
    const client = new AdbClient(file);
    expect(await client.shell("echo hi")).toBe("shell:echo hi\n");
    expect(await client.screencap()).toEqual(Buffer.from("PNGDATA"));
  });
});

describe("findAdb", () => {
  const base = {
    platform: "win32" as const,
    env: {} as Record<string, string | undefined>,
    home: "C:\\Users\\ada",
    which: () => null as string | null,
    exists: () => false,
  };

  it("takes ADELIE_ADB_PATH first and says when it is wrong", () => {
    expect(
      findAdb({
        ...base,
        env: { ADELIE_ADB_PATH: "C:\\tools\\adb.exe" },
        exists: (f) => f === "C:\\tools\\adb.exe",
      }),
    ).toEqual({ found: true, path: "C:\\tools\\adb.exe", source: "setting" });
    const missing = findAdb({ ...base, env: { ADELIE_ADB_PATH: "C:\\nope\\adb.exe" } });
    expect(missing.found).toBe(false);
    expect(missing.message).toMatch(/does not exist/);
  });

  it("prefers PATH over well-known installs", () => {
    expect(findAdb({ ...base, which: () => "C:\\bin\\adb.exe" })).toEqual({
      found: true,
      path: "C:\\bin\\adb.exe",
      source: "path",
    });
  });

  it("finds Android Studio's platform-tools", () => {
    const studio = "C:\\Users\\ada\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe";
    expect(
      findAdb({
        ...base,
        env: { LOCALAPPDATA: "C:\\Users\\ada\\AppData\\Local" },
        exists: (f) => f === studio,
      }),
    ).toEqual({ found: true, path: studio, source: "android-studio" });
  });

  it("falls back to bundled platform-tools last", () => {
    const bundled = "C:\\app\\resources\\platform-tools\\adb.exe";
    expect(findAdb({ ...base, exists: (f) => f === bundled }, bundled)).toEqual({
      found: true,
      path: bundled,
      source: "bundled",
    });
  });

  it("explains the absence", () => {
    const none = findAdb(base);
    expect(none).toMatchObject({ found: false, path: null, source: "missing" });
    expect(none.message).toMatch(/platform-tools/);
  });
});
