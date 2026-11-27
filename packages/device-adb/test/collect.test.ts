import { describe, expect, it } from "vitest";
import { AdbClient } from "../src/adb-client.js";
import {
  collectApps,
  collectDynamic,
  collectNotifications,
  collectStatic,
} from "../src/collect.js";
import { GETPROP, scriptedRunner } from "./helpers.js";

const STATIC_SCRIPT = {
  "shell getprop": GETPROP,
  "shell which su": "/system/bin/su\n",
  "shell uname -r": "6.1.75-android14-11-g4d5b0e8e1a2b\n",
  "shell cat /proc/cpuinfo": "processor\t: 0\nHardware\t: Tensor G3\n",
};

const DYNAMIC_SCRIPT = {
  "shell dumpsys battery":
    "level: 78\nstatus: 2\nUSB powered: true\ntemperature: 310\nvoltage: 4201\nhealth: 2\n",
  "shell cat /proc/meminfo": "MemTotal: 7871564 kB\nMemAvailable: 3456789 kB\n",
  "shell df -k /data":
    "Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/block/dm-5 116330240 52345678 63984562 45% /data\n",
  "shell wm size": "Physical size: 1080x2400\n",
  "shell wm density": "Physical density: 420\n",
  "shell dumpsys display": "mRefreshRate=120.000004\n",
  "shell dumpsys window": "mCurrentRotation=ROTATION_0 mShowingLockscreen=false\n",
  "shell settings get system screen_brightness": "128\n",
  "shell ip -4 addr show": "inet 192.168.1.23/24 brd 192.168.1.255 scope global wlan0\n",
  "shell cmd wifi status": 'WifiInfo: SSID: "HomeNet", RSSI: -52, Link speed: 433Mbps\n',
  "shell dumpsys activity activities":
    "mResumedActivity: ActivityRecord{1 u0 com.android.chrome/.Main t1}\n",
};

describe("collectStatic", () => {
  it("merges getprop with the probes and stamps first-seen", async () => {
    const calls: string[] = [];
    const client = new AdbClient("adb", scriptedRunner(STATIC_SCRIPT, calls));
    const info = await collectStatic(
      client,
      { serial: "R58M12ABC", state: "device", transport: "usb" },
      "2026-11-27T00:00:00.000Z",
    );
    expect(info).toMatchObject({
      brand: "Google",
      model: "Pixel 8",
      androidVersion: "15",
      apiLevel: 35,
      kernel: "6.1.75-android14-11-g4d5b0e8e1a2b",
      cpu: "Tensor G3",
      rooted: true,
      firstSeenAt: "2026-11-27T00:00:00.000Z",
    });
    expect(calls).toContain("shell getprop");
    expect(calls).toContain("shell which su");
  });

  it("does not call an unrooted phone rooted", async () => {
    const client = new AdbClient(
      "adb",
      scriptedRunner({ ...STATIC_SCRIPT, "shell which su": "su: not found\n" }),
    );
    const info = await collectStatic(
      client,
      { serial: "R58M12ABC", state: "device", transport: "usb" },
      "2026-11-27T00:00:00.000Z",
    );
    expect(info.rooted).toBe(false);
  });
});

describe("collectDynamic", () => {
  it("runs the eleven probes and builds the dynamic layer", async () => {
    const calls: string[] = [];
    const client = new AdbClient("adb", scriptedRunner(DYNAMIC_SCRIPT, calls));
    const dynamic = await collectDynamic(client);
    expect(dynamic.power).toMatchObject({ level: 78, charging: true, temperatureC: 31 });
    expect(dynamic.memory?.totalBytes).toBe(7871564 * 1024);
    expect(dynamic.storage?.availableBytes).toBe(63984562 * 1024);
    expect(dynamic.screen).toMatchObject({
      widthPx: 1080,
      heightPx: 2400,
      densityDpi: 420,
      refreshHz: 120.000004,
      orientation: "portrait",
      locked: false,
      brightness: 128,
    });
    expect(dynamic.network).toMatchObject({ wifi: { ssid: "HomeNet", rssi: -52, linkMbps: 433 } });
    expect(dynamic.foreground).toBe("com.android.chrome");
    expect(calls).toHaveLength(11);
  });

  it("returns only what the ROM answered", async () => {
    const client = new AdbClient("adb", scriptedRunner({ "shell dumpsys battery": "level: 50\n" }));
    const dynamic = await collectDynamic(client);
    expect(dynamic.power).toEqual({ level: 50, charging: false });
    expect(dynamic.network).toBeUndefined();
    expect(dynamic.screen).toBeUndefined();
  });
});

describe("collectApps", () => {
  it("lists third-party apps with one call", async () => {
    const calls: string[] = [];
    const client = new AdbClient(
      "adb",
      scriptedRunner(
        { "shell pm list packages -3": "package:com.b.app\npackage:com.a.app\n" },
        calls,
      ),
    );
    const apps = await collectApps(client);
    expect(apps.map((app) => app.packageName)).toEqual(["com.a.app", "com.b.app"]);
    expect(calls).toEqual(["shell pm list packages -3"]);
  });

  it("separates third-party from system with two calls", async () => {
    const calls: string[] = [];
    const client = new AdbClient(
      "adb",
      scriptedRunner(
        {
          "shell pm list packages": "package:com.android.settings\npackage:com.a.app\n",
          "shell pm list packages -3": "package:com.a.app\n",
        },
        calls,
      ),
    );
    const apps = await collectApps(client, true);
    expect(apps).toEqual([
      { packageName: "com.a.app", thirdParty: true },
      { packageName: "com.android.settings", thirdParty: false },
    ]);
    expect(calls).toHaveLength(2);
  });
});

describe("collectNotifications", () => {
  it("asks for the unredacted dump first", async () => {
    const calls: string[] = [];
    const client = new AdbClient(
      "adb",
      scriptedRunner(
        {
          "shell dumpsys notification --noredact":
            "NotificationRecord(0x1: pkg=com.tencent.mm user=0)\n  android.title=String (微信)\n",
        },
        calls,
      ),
    );
    expect(await collectNotifications(client)).toEqual([
      { packageName: "com.tencent.mm", title: "微信" },
    ]);
    expect(calls).toEqual(["shell dumpsys notification --noredact"]);
  });

  it("falls back to the redacted dump when the first answers nothing", async () => {
    const calls: string[] = [];
    const client = new AdbClient(
      "adb",
      scriptedRunner(
        {
          "shell dumpsys notification --noredact": "",
          "shell dumpsys notification":
            "NotificationRecord(0x1: pkg=com.a user=0)\n  android.title=String (hi)\n",
        },
        calls,
      ),
    );
    expect(await collectNotifications(client)).toEqual([{ packageName: "com.a", title: "hi" }]);
    expect(calls).toHaveLength(2);
  });
});
