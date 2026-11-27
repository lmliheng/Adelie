/**
 * Every parser here takes exactly what adb printed and returns a value or `undefined`. They
 * are pure on purpose: the shapes adb produces differ by Android version and vendor ROM, and
 * this is the layer where that variation has to be absorbed and TESTED — a parser is far
 * cheaper to test than a device, and this machine has no phone.
 *
 * One rule throughout: an unknown line is skipped, never guessed. A blank field is better than
 * a wrong one somebody trusts.
 */
import type {
  AppInfo,
  DynamicInfo,
  MemoryInfo,
  NotificationInfo,
  PowerInfo,
  ScreenInfo,
  StaticInfo,
  StorageInfo,
} from "@adelie/device";

export interface AdbDeviceLine {
  serial: string;
  /** `device | unauthorized | offline | bootloader | recovery | …` as adb spells it. */
  state: string;
  model?: string;
  device?: string;
  transport: "usb" | "wifi" | "unknown";
}

/** `adb devices -l` — a header line, then one row per device. */
export function parseDevices(stdout: string): AdbDeviceLine[] {
  const out: AdbDeviceLine[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("List of devices")) continue;
    const [serial, state, ...rest] = line.split(/\s+/);
    if (serial === undefined || state === undefined) continue;
    const fields: Record<string, string> = {};
    for (const part of rest) {
      const at = part.indexOf(":");
      if (at > 0) fields[part.slice(0, at)] = part.slice(at + 1);
    }
    // `adb devices` reports a Wi-Fi connection as `192.168.1.5:5555`; USB serials never carry
    // a colon. That is the only reliable transport signal without another round trip.
    const transport = serial.includes(":") ? "wifi" : "usb";
    out.push({ serial, state, model: fields.model, device: fields.device, transport });
  }
  return out;
}

/**
 * `adb shell getprop` with no argument prints `[key]: [value]` for every property — one round
 * trip for the whole static layer, instead of a dozen.
 */
export function parseGetprop(stdout: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^\[([^\]]+)\]:\s*\[(.*)\]$/.exec(line.trim());
    if (m !== null) props[m[1]!] = m[2]!;
  }
  return props;
}

function int(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isNaN(n) ? undefined : n;
}

/** `dumpsys battery`: `level: 78`, `USB powered: true`, `temperature: 310`, `health: 2`. */
export function parseBattery(stdout: string): PowerInfo {
  const fields: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^\s{0,8}([A-Za-z ]+):\s*(.*)$/.exec(line);
    if (m !== null) fields[m[1]!.trim().toLowerCase()] = m[2]!.trim();
  }
  const powered =
    fields["usb powered"] === "true" ||
    fields["ac powered"] === "true" ||
    fields["wireless powered"] === "true";
  const status = int(fields["status"]);
  // BatteryManager: 2 charging, 5 full, 3 discharging, 4 not charging.
  const statusName =
    status === 2
      ? "charging"
      : status === 5
        ? "full"
        : status === 3
          ? "discharging"
          : status === 4
            ? "not-charging"
            : undefined;
  const health = int(fields["health"]);
  const healthName =
    health === 2
      ? "good"
      : health === 3
        ? "overheat"
        : health === 4
          ? "dead"
          : health === 5
            ? "over-voltage"
            : health === 6
              ? "failure"
              : health === 7
                ? "cold"
                : undefined;
  return {
    level: int(fields["level"]),
    charging: powered || statusName === "charging" || statusName === "full",
    status: statusName,
    // dumpsys reports tenths of a degree Celsius (310 = 31.0 °C).
    temperatureC:
      int(fields["temperature"]) !== undefined ? int(fields["temperature"])! / 10 : undefined,
    voltageMv: int(fields["voltage"]),
    health: healthName,
  };
}

/** `/proc/meminfo`: every line is `<name>: <kB> kB`. */
export function parseMeminfo(stdout: string): MemoryInfo {
  const total = /^MemTotal:\s+(\d+)\s+kB/m.exec(stdout);
  const available = /^MemAvailable:\s+(\d+)\s+kB/m.exec(stdout);
  const kib = (m: RegExpExecArray | null) => (m === null ? undefined : Number(m[1]) * 1024);
  const totalBytes = kib(total);
  const availableBytes = kib(available);
  return {
    totalBytes,
    availableBytes,
    usedBytes:
      totalBytes !== undefined && availableBytes !== undefined
        ? totalBytes - availableBytes
        : undefined,
  };
}

/** `df -k /data`: `Filesystem 1K-blocks Used Available Use% Mounted on`. */
export function parseDf(stdout: string): StorageInfo {
  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const blocks = int(parts[1]);
    const used = int(parts[2]);
    const available = int(parts[3]);
    if (blocks === undefined || used === undefined || available === undefined) continue;
    return { totalBytes: blocks * 1024, usedBytes: used * 1024, availableBytes: available * 1024 };
  }
  return {};
}

/** `wm size`: `Physical size: 1080x2400`, optionally an `Override size:` line. */
export function parseWmSize(stdout: string): { widthPx?: number; heightPx?: number } {
  const physical = /Physical size:\s*(\d+)x(\d+)/.exec(stdout);
  const override = /Override size:\s*(\d+)x(\d+)/.exec(stdout);
  const m = override ?? physical;
  return m === null ? {} : { widthPx: Number(m[1]), heightPx: Number(m[2]) };
}

/** `wm density`: `Physical density: 420`, optionally an override. */
export function parseWmDensity(stdout: string): number | undefined {
  const override = /Override density:\s*(\d+)/.exec(stdout);
  const physical = /Physical density:\s*(\d+)/.exec(stdout);
  return int((override ?? physical)?.[1]);
}

/** `dumpsys display` carries `mRefreshRate=120.0` / `fps=60.0` depending on the version. */
export function parseRefreshRate(stdout: string): number | undefined {
  const m = /(?:mRefreshRate|refreshRate|fps)=([\d.]+)/.exec(stdout);
  if (m === null) return undefined;
  const rate = Number.parseFloat(m[1]!);
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

/**
 * `dumpsys window` says which way the screen is and whether the keyguard is up:
 * `mCurrentRotation=ROTATION_0`, `mShowingLockscreen=false`, `isStatusBarKeyguard=false`.
 */
export function parseWindowState(stdout: string): { orientation?: string; locked?: boolean } {
  const rotation = /mCurrentRotation=(ROTATION_\d+|ROTATION_UNKNOWN)/.exec(stdout)?.[1];
  const orientation =
    rotation === "ROTATION_0"
      ? "portrait"
      : rotation === "ROTATION_90"
        ? "landscape"
        : rotation === "ROTATION_180"
          ? "portrait-reverse"
          : rotation === "ROTATION_270"
            ? "landscape-reverse"
            : undefined;
  const keyguard = /(?:mShowingLockscreen|isStatusBarKeyguard)=(true|false)/.exec(stdout)?.[1];
  return { orientation, locked: keyguard === undefined ? undefined : keyguard === "true" };
}

/** `settings get system screen_brightness`. */
export function parseBrightness(stdout: string): number | undefined {
  const n = int(stdout.trim());
  return n !== undefined && n >= 0 && n <= 255 ? n : undefined;
}

/** `ip -4 addr show wlan0`: `inet 192.168.1.23/24 brd …`. */
export function parseIpAddresses(stdout: string): string[] {
  const out: string[] = [];
  for (const m of stdout.matchAll(/inet\s+(\d+\.\d+\.\d+\.\d+)/g)) {
    if (m[1] !== undefined && m[1] !== "127.0.0.1") out.push(m[1]);
  }
  return [...new Set(out)];
}

/** `cmd wifi status` / `dumpsys wifi`: the SSID line varies by version; take the first hit. */
export function parseWifi(stdout: string): {
  ssid?: string;
  ip?: string;
  rssi?: number;
  linkMbps?: number;
} {
  const ssid =
    /SSID:\s*"?([^",\n]+)"?/.exec(stdout)?.[1] ??
    /mWifiInfo\s+SSID:\s*"?([^",\n]+)"?/.exec(stdout)?.[1];
  const rssi = /(?:RSSI|rssi)[:=]\s*(-?\d+)/.exec(stdout)?.[1];
  const link = /(?:Link speed|linkSpeed|mLinkSpeed)[:=]\s*(\d+)\s*Mbps/.exec(stdout)?.[1];
  return {
    ssid: ssid === undefined ? undefined : ssid.trim(),
    ip: parseIpAddresses(stdout)[0],
    rssi: int(rssi),
    linkMbps: int(link),
  };
}

/** `dumpsys activity activities`: `mResumedActivity: ActivityRecord{… com.example/.Main …}`. */
export function parseForegroundPackage(stdout: string): string | undefined {
  const resumed = /mResumedActivity.*?\s([a-zA-Z][\w.]+)\/[\w.$]+/.exec(stdout);
  if (resumed?.[1] !== undefined) return resumed[1];
  const top = /topResumedActivity.*?\s([a-zA-Z][\w.]+)\/[\w.$]+/.exec(stdout);
  return top?.[1];
}

/** `pm list packages -3` prints `package:com.example.app`. */
export function parsePackages(stdout: string): AppInfo[] {
  const out: AppInfo[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^package:(.+)$/.exec(line.trim());
    if (m !== null) out.push({ packageName: m[1]!, thirdParty: true });
  }
  return out.sort((a, b) => a.packageName.localeCompare(b.packageName));
}

export interface RemoteFile {
  name: string;
  dir: boolean;
  sizeBytes?: number;
  modifiedAt?: string;
  link?: boolean;
}

/**
 * `adb shell ls -la <dir>`: `-rw-rw---- 1 u0_a123 media_rw 1234567 2026-11-27 10:11 name`.
 * Android's toolbox `ls` prints exactly this; busybox variants add a `-> target` for links.
 */
export function parseListing(stdout: string): RemoteFile[] {
  const out: RemoteFile[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || /^total\s/.test(line)) continue;
    const m =
      /^([-dl])([rwxsStT-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/.exec(
        line,
      );
    if (m === null) continue;
    const name = m[6]!.replace(/\s+->\s+.*$/, "");
    if (name === "." || name === "..") continue;
    out.push({
      name,
      dir: m[1] === "d",
      link: m[1] === "l",
      sizeBytes: Number(m[3]),
      modifiedAt: `${m[4]}T${m[5]}`,
    });
  }
  return out;
}

/**
 * `dumpsys notification --noredact`, best effort: a notification is a block with `pkg=` and an
 * `android.title=` line. Bodies are never parsed — design §9 stores titles only.
 */
export function parseNotifications(stdout: string): NotificationInfo[] {
  const out: NotificationInfo[] = [];
  let current: NotificationInfo | null = null;
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    const pkg = /pkg=([\w.]+)/.exec(line);
    if (pkg !== null) {
      if (current !== null && current.packageName !== "") out.push(current);
      current = { packageName: pkg[1]! };
      continue;
    }
    if (current === null) continue;
    const title = /android\.title=(?:String\s*\()?(.*?)(?:\)?$)/.exec(line);
    if (title !== null && title[1] !== undefined && title[1].trim() !== "") {
      current.title = title[1].trim();
      continue;
    }
    if (/android\.text=/.test(line)) current.ongoing = current.ongoing ?? undefined;
    const when = /when=(\d{10,})/.exec(line);
    if (when !== null) {
      const stamp = Number(when[1]);
      current.postedAt = new Date(stamp).toISOString();
    }
  }
  if (current !== null && current.packageName !== "") out.push(current);
  // Only blocks that actually carried a title are worth showing; `--noredact` prints the whole
  // history and most of it is empty chrome.
  return out.filter((n) => n.title !== undefined).slice(0, 50);
}

export interface MdnsService {
  name: string;
  /** `_adb-tls-pairing._tcp` or `_adb-tls-connect._tcp`. */
  type: string;
  /** `host:port`. */
  address: string;
}

/** `adb mdns services`: one row per announced service. */
export function parseMdnsServices(stdout: string): MdnsService[] {
  const out: MdnsService[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || /^List of discovered/.test(line)) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const address = parts[parts.length - 1]!;
    if (!/:\d+$/.test(address)) continue;
    out.push({ name: parts[0]!, type: parts[1]!, address });
  }
  return out;
}

/**
 * The Android 11 pair-with-QR-code payload. The phone's pairing screen scans it, then
 * announces `_adb-tls-pairing._tcp`; `adb pair <address> <code>` finishes the handshake.
 */
export function buildPairingQr(serviceName: string, code: string): string {
  const escape = (value: string) => value.replace(/([\\;,:"])/g, "\\$1");
  return `WIFI:T:ADB;S:${escape(serviceName)};P:${escape(code)};;`;
}

/** Everything the static layer needs, from one `getprop` dump plus the device line. */
export function staticFrom(getprops: Record<string, string>, device: AdbDeviceLine): StaticInfo {
  const model = getprops["ro.product.model"] ?? device.model;
  const brand = getprops["ro.product.brand"];
  const version = getprops["ro.build.version.release"];
  return {
    brand,
    model,
    device: getprops["ro.product.device"] ?? device.device,
    serial: getprops["ro.serialno"] ?? device.serial,
    androidVersion: version,
    apiLevel: int(getprops["ro.build.version.sdk"]),
    securityPatch: getprops["ro.build.version.security_patch"],
    buildId: getprops["ro.build.id"],
    fingerprint: getprops["ro.build.fingerprint"],
    abi: getprops["ro.product.cpu.abi"],
    kernel: getprops["ro.kernel.version"],
    bootloaderLocked:
      getprops["ro.boot.flash.locked"] === undefined
        ? undefined
        : getprops["ro.boot.flash.locked"] === "1",
    verifiedBoot: getprops["ro.boot.verifiedbootstate"],
    isEmulator:
      getprops["ro.kernel.qemu"] === "1" ||
      getprops["ro.hardware"] === "goldfish" ||
      (model !== undefined && /sdk|emulator|google_sdk/i.test(model)),
  };
}

/** The dynamic layer, from the commands `dumpsys` answered. Empty groups stay empty. */
export function dynamicFrom(parts: {
  battery?: string;
  meminfo?: string;
  df?: string;
  wmSize?: string;
  wmDensity?: string;
  display?: string;
  window?: string;
  brightness?: string;
  ip?: string;
  wifi?: string;
  foreground?: string;
}): DynamicInfo {
  const screen: ScreenInfo = {
    ...parseWmSize(parts.wmSize ?? ""),
    densityDpi: parseWmDensity(parts.wmDensity ?? ""),
    refreshHz: parseRefreshRate(parts.display ?? ""),
    ...parseWindowState(parts.window ?? ""),
    brightness: parseBrightness(parts.brightness ?? ""),
  };
  const wifi = parseWifi(parts.wifi ?? "");
  const addresses = parseIpAddresses(parts.ip ?? "");
  return {
    power: parts.battery === undefined ? undefined : parseBattery(parts.battery),
    memory: parts.meminfo === undefined ? undefined : parseMeminfo(parts.meminfo),
    storage: parts.df === undefined ? undefined : parseDf(parts.df),
    screen: Object.values(screen).some((v) => v !== undefined) ? screen : undefined,
    network:
      wifi.ssid === undefined && addresses.length === 0
        ? undefined
        : { wifi: { ...wifi, ip: wifi.ip ?? addresses[0] }, addresses },
    foreground:
      parts.foreground === undefined ? undefined : parseForegroundPackage(parts.foreground),
  };
}
