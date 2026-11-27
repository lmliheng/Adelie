/**
 * Turning a phone's answers into the three layers the host stores (design §4.4): identity once,
 * readings on a timer, lists when somebody asks.
 *
 * Each collector runs its own handful of shell commands and hands them to `parse.ts`. Nothing
 * here decides WHEN to collect — `bridge.ts` owns that — so this file has no timers and no
 * state, which is what lets the tests run it against a scripted adb.
 */
import type { AppInfo, DynamicInfo, NotificationInfo, StaticInfo } from "@adelie/device";
import type { AdbClient } from "./adb-client.js";
import {
  dynamicFrom,
  parseGetprop,
  parseNotifications,
  parsePackages,
  staticFrom,
  type AdbDeviceLine,
} from "./parse.js";

/**
 * Identity: one `getprop` dump carries nearly all of it, and three small probes cover what it
 * does not. Rooted means `su` resolves, not that we can use it — nothing here runs as root.
 */
export async function collectStatic(
  client: AdbClient,
  device: AdbDeviceLine,
  firstSeenAt: string,
): Promise<StaticInfo> {
  const [props, su, kernel, cpuinfo] = await Promise.all([
    client.shell("getprop", 20_000),
    client.shell("which su", 8_000),
    client.shell("uname -r", 8_000),
    client.shell("cat /proc/cpuinfo", 12_000),
  ]);
  const getprops = parseGetprop(props);
  const info = staticFrom(getprops, device);
  const kernelName = kernel.trim().split(/\r?\n/)[0]?.trim();
  const hardware = /^Hardware\s*:\s*(.+)$/m.exec(cpuinfo)?.[1]?.trim();
  info.kernel = kernelName !== undefined && kernelName !== "" ? kernelName : info.kernel;
  info.cpu = hardware;
  // `which su` prints the path when it exists and nothing (or "su: not found") when it does not.
  info.rooted = su.trim() !== "" && !/not found|inaccessible|no su/i.test(su);
  info.firstSeenAt = firstSeenAt;
  return info;
}

/**
 * Readings: eleven round trips, about a second on USB. The caller decides the cadence (15 s
 * while the bridge runs), because a phone sitting idle should not pay for a page nobody has
 * open.
 */
export async function collectDynamic(client: AdbClient): Promise<DynamicInfo> {
  const battery = await client.shell("dumpsys battery", 20_000);
  const meminfo = await client.shell("cat /proc/meminfo", 10_000);
  const df = await client.shell("df -k /data", 10_000);
  const wmSize = await client.shell("wm size", 8_000);
  const wmDensity = await client.shell("wm density", 8_000);
  const display = await client.shell("dumpsys display", 20_000);
  const window = await client.shell("dumpsys window", 20_000);
  const brightness = await client.shell("settings get system screen_brightness", 8_000);
  const ip = await client.shell("ip -4 addr show", 10_000);
  // `cmd wifi` exists from Android 10; older versions answer with an error line, which parses
  // to an empty group rather than a wrong one.
  const wifi = await client.shell("cmd wifi status", 10_000);
  const foreground = await client.shell("dumpsys activity activities", 20_000);
  return dynamicFrom({
    battery,
    meminfo,
    df,
    wmSize,
    wmDensity,
    display,
    window,
    brightness,
    ip,
    wifi,
    foreground,
  });
}

/**
 * The installed apps. Default is third-party only (one call); `all` costs a second call to
 * tell the two apart, and the panel's search is what needs it.
 */
export async function collectApps(client: AdbClient, all = false): Promise<AppInfo[]> {
  if (!all) return parsePackages(await client.shell("pm list packages -3", 20_000));
  const [everything, thirdParty] = await Promise.all([
    client.shell("pm list packages", 30_000),
    client.shell("pm list packages -3", 20_000),
  ]);
  const third = new Set(parsePackages(thirdParty).map((app) => app.packageName));
  return parsePackages(everything)
    .map((app) => ({ ...app, thirdParty: third.has(app.packageName) }))
    .sort((a, b) => a.packageName.localeCompare(b.packageName));
}

/**
 * Notification titles. `--noredact` is the only flag that carries them; where a ROM refuses
 * it the answer is the redacted dump, whose blocks have no title — an empty list, not an
 * invented one. Bodies are never read (design §9).
 */
export async function collectNotifications(client: AdbClient): Promise<NotificationInfo[]> {
  const stdout = await client.shell("dumpsys notification --noredact", 30_000);
  const parsed = parseNotifications(stdout);
  if (parsed.length > 0) return parsed;
  return parseNotifications(await client.shell("dumpsys notification", 30_000));
}
