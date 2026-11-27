import { describe, expect, it } from "vitest";
import {
  buildPairingQr,
  dynamicFrom,
  parseBattery,
  parseBrightness,
  parseDevices,
  parseDf,
  parseForegroundPackage,
  parseGetprop,
  parseIpAddresses,
  parseListing,
  parseMdnsServices,
  parseMeminfo,
  parseNotifications,
  parsePackages,
  parseRefreshRate,
  parseWifi,
  parseWindowState,
  parseWmDensity,
  parseWmSize,
  staticFrom,
} from "../src/parse.js";

/**
 * Every fixture below is a shape a real adb/Android prints, copied from dumps seen in the
 * wild (Android 10–15, stock and vendor ROMs). A parser that survives these is worth running
 * against a phone; the tests are the only place this machine can check that.
 */

const DEVICES_L = `List of devices attached
R58M12ABC	device usb:1-1 product:shiba model:Pixel_8 device:shiba transport_id:1
192.168.1.23:5555	device product:shiba model:Pixel_8 device:shiba transport_id:2
R58M99XYZ	unauthorized usb:1-2 transport_id:3
`;

describe("parseDevices", () => {
  it("reads serial, state and the -l attributes", () => {
    const devices = parseDevices(DEVICES_L);
    expect(devices).toHaveLength(3);
    expect(devices[0]).toMatchObject({
      serial: "R58M12ABC",
      state: "device",
      model: "Pixel_8",
      device: "shiba",
      transport: "usb",
    });
    expect(devices[1]).toMatchObject({ serial: "192.168.1.23:5555", transport: "wifi" });
    expect(devices[2]).toMatchObject({ state: "unauthorized" });
  });

  it("ignores the header and blank lines", () => {
    expect(parseDevices("List of devices attached\r\n\r\n")).toEqual([]);
  });
});

describe("parseGetprop / staticFrom", () => {
  const getprop = `[ro.product.brand]: [Google]
[ro.product.model]: [Pixel 8]
[ro.product.device]: [shiba]
[ro.serialno]: [R58M12ABC]
[ro.build.version.release]: [15]
[ro.build.version.sdk]: [35]
[ro.build.version.security_patch]: [2026-10-05]
[ro.build.id]: [AP4A.260105.001]
[ro.build.fingerprint]: [google/shiba/shiba:15/AP4A/1:user/release-keys]
[ro.product.cpu.abi]: [arm64-v8a]
[ro.boot.flash.locked]: [1]
[ro.boot.verifiedbootstate]: [green]
[ro.kernel.qemu]: []`;

  it("splits the bracket dump", () => {
    const props = parseGetprop(getprop);
    expect(props["ro.product.model"]).toBe("Pixel 8");
    expect(props["ro.kernel.qemu"]).toBe("");
  });

  it("builds the static layer, with emulator and lock state", () => {
    const info = staticFrom(parseGetprop(getprop), {
      serial: "R58M12ABC",
      state: "device",
      transport: "usb",
    });
    expect(info).toMatchObject({
      brand: "Google",
      model: "Pixel 8",
      device: "shiba",
      serial: "R58M12ABC",
      androidVersion: "15",
      apiLevel: 35,
      securityPatch: "2026-10-05",
      abi: "arm64-v8a",
      bootloaderLocked: true,
      verifiedBoot: "green",
      isEmulator: false,
    });
  });
});

describe("dynamic parsers", () => {
  it("reads dumpsys battery, including tenths of a degree", () => {
    const battery = parseBattery(`Current Battery Service state:
  AC powered: false
  USB powered: true
  Wireless powered: false
  status: 2
  health: 2
  present: true
  level: 78
  voltage: 4201
  temperature: 310
`);
    expect(battery).toEqual({
      level: 78,
      charging: true,
      status: "charging",
      temperatureC: 31,
      voltageMv: 4201,
      health: "good",
    });
  });

  it("reads meminfo in kB into bytes", () => {
    const memory = parseMeminfo("MemTotal:        7871564 kB\nMemAvailable:    3456789 kB\n");
    expect(memory.totalBytes).toBe(7871564 * 1024);
    expect(memory.availableBytes).toBe(3456789 * 1024);
    expect(memory.usedBytes).toBe((7871564 - 3456789) * 1024);
  });

  it("reads df -k /data", () => {
    const storage = parseDf(
      "Filesystem     1K-blocks     Used Available Use% Mounted on\n/dev/block/dm-5 116330240 52345678  63984562  45% /data\n",
    );
    expect(storage).toEqual({
      totalBytes: 116330240 * 1024,
      usedBytes: 52345678 * 1024,
      availableBytes: 63984562 * 1024,
    });
  });

  it("prefers a wm override over the physical size and density", () => {
    expect(parseWmSize("Physical size: 1080x2400\nOverride size: 720x1600\n")).toEqual({
      widthPx: 720,
      heightPx: 1600,
    });
    expect(parseWmSize("Physical size: 1440x3120")).toEqual({ widthPx: 1440, heightPx: 3120 });
    expect(parseWmDensity("Physical density: 420\nOverride density: 480\n")).toBe(480);
    expect(parseWmDensity("Physical density: 420")).toBe(420);
  });

  it("reads the refresh rate and the window rotation/keyguard", () => {
    expect(parseRefreshRate("mRefreshRate=120.000004 fps=120.0")).toBe(120.000004);
    expect(parseWindowState("mCurrentRotation=ROTATION_90 mShowingLockscreen=true")).toEqual({
      orientation: "landscape",
      locked: true,
    });
    expect(parseWindowState("mCurrentRotation=ROTATION_0 isStatusBarKeyguard=false")).toEqual({
      orientation: "portrait",
      locked: false,
    });
  });

  it("reads brightness only inside the 0–255 scale", () => {
    expect(parseBrightness("128\n")).toBe(128);
    expect(parseBrightness("255")).toBe(255);
    expect(parseBrightness("automatic")).toBeUndefined();
  });

  it("collects non-loopback IPv4 addresses once each", () => {
    const stdout = `2: wlan0: <BROADCAST> mtu 1500
    inet 192.168.1.23/24 brd 192.168.1.255 scope global wlan0
3: wlan1: <BROADCAST> mtu 1500
    inet 10.0.0.5/24 scope global wlan1
    inet 192.168.1.23/24 scope global secondary wlan0
1: lo: <LOOPBACK> mtu 65536
    inet 127.0.0.1/8 scope host lo
`;
    expect(parseIpAddresses(stdout)).toEqual(["192.168.1.23", "10.0.0.5"]);
  });

  it("reads wifi SSID, signal and link speed", () => {
    const wifi = parseWifi(`Wifi is enabled
WifiInfo: SSID: "HomeNet", BSSID: aa:bb, RSSI: -52, Link speed: 433Mbps, Frequency: 5180
`);
    expect(wifi).toMatchObject({ ssid: "HomeNet", rssi: -52, linkMbps: 433 });
  });

  it("reads the foreground package from dumpsys activity", () => {
    const stdout = `  mResumedActivity: ActivityRecord{2f1a u0 com.android.chrome/com.google.android.apps.chrome.Main t42}`;
    expect(parseForegroundPackage(stdout)).toBe("com.android.chrome");
  });

  it("builds the dynamic layer and keeps empty groups out", () => {
    const dynamic = dynamicFrom({
      battery: "level: 55\nstatus: 3\n",
      meminfo: "MemTotal: 1000 kB\nMemAvailable: 400 kB\n",
      df: "Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/x 2000 500 1500 25% /data\n",
      wmSize: "Physical size: 1080x2400\n",
      wmDensity: "Physical density: 420\n",
      brightness: "77\n",
      ip: "inet 192.168.1.23/24 brd 192.168.1.255 scope global wlan0\n",
      wifi: 'SSID: "HomeNet", RSSI: -52',
      foreground: "mResumedActivity: ActivityRecord{1 u0 com.example.app/.Main t1}",
    });
    expect(dynamic.power).toMatchObject({ level: 55, charging: false, status: "discharging" });
    expect(dynamic.storage).toEqual({
      totalBytes: 2000 * 1024,
      usedBytes: 500 * 1024,
      availableBytes: 1500 * 1024,
    });
    expect(dynamic.screen).toMatchObject({
      widthPx: 1080,
      heightPx: 2400,
      densityDpi: 420,
      brightness: 77,
    });
    expect(dynamic.network).toMatchObject({
      wifi: { ssid: "HomeNet", ip: "192.168.1.23" },
      addresses: ["192.168.1.23"],
    });
    expect(dynamic.foreground).toBe("com.example.app");
    expect(dynamicFrom({})).toEqual({
      power: undefined,
      memory: undefined,
      storage: undefined,
      screen: undefined,
      network: undefined,
      foreground: undefined,
    });
  });
});

describe("parsePackages / parseListing", () => {
  it("reads package names", () => {
    expect(
      parsePackages("package:com.b.app\npackage:com.a.app\n").map((a) => a.packageName),
    ).toEqual(["com.a.app", "com.b.app"]);
  });

  it("reads an Android ls -la, links included", () => {
    const listing = parseListing(`total 8
drwxrwx--x 4 root sdcard_rw 4096 2026-11-27 10:11 DCIM
-rw-rw---- 1 u0_a123 media_rw 1234567 2026-11-27 10:12 photo.jpg
lrwxrwxrwx 1 root root 21 2026-11-27 10:11 sdcard -> /storage/self/primary
`);
    expect(listing).toEqual([
      { name: "DCIM", dir: true, link: false, sizeBytes: 4096, modifiedAt: "2026-11-27T10:11" },
      {
        name: "photo.jpg",
        dir: false,
        link: false,
        sizeBytes: 1234567,
        modifiedAt: "2026-11-27T10:12",
      },
      { name: "sdcard", dir: false, link: true, sizeBytes: 21, modifiedAt: "2026-11-27T10:11" },
    ]);
  });
});

describe("parseNotifications", () => {
  it("keeps titles and packages, drops blocks without a title", () => {
    const stdout = `NotificationRecord(0x1: pkg=com.tencent.mm user=0)
    extras={
      android.title=String (微信)
      android.text=String (secret body)
    }
    when=1700000000000
NotificationRecord(0x2: pkg=com.android.systemui user=0)
    extras={
      android.title=String (正在充电)
    }
NotificationRecord(0x3: pkg=com.example.empty user=0)
    extras={
    }
`;
    expect(parseNotifications(stdout)).toEqual([
      { packageName: "com.tencent.mm", title: "微信", postedAt: "2023-11-14T22:13:20.000Z" },
      { packageName: "com.android.systemui", title: "正在充电" },
    ]);
  });
});

describe("pairing helpers", () => {
  it("escapes the QR fields and names both codes", () => {
    expect(buildPairingQr("adb-1", "123456")).toBe("WIFI:T:ADB;S:adb-1;P:123456;;");
    expect(buildPairingQr("a;b", "12:34")).toBe("WIFI:T:ADB;S:a\\;b;P:12\\:34;;");
  });

  it("reads mdns services", () => {
    expect(
      parseMdnsServices(`List of discovered mdns services
adb-R58M12ABC-abc	_adb-tls-connect._tcp	192.168.1.23:5555
adb-R58M12ABC-pair	_adb-tls-pairing._tcp	192.168.1.23:37201
`),
    ).toEqual([
      { name: "adb-R58M12ABC-abc", type: "_adb-tls-connect._tcp", address: "192.168.1.23:5555" },
      { name: "adb-R58M12ABC-pair", type: "_adb-tls-pairing._tcp", address: "192.168.1.23:37201" },
    ]);
  });
});
