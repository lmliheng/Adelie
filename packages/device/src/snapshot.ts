/**
 * Layered snapshots merge in one direction: the newest layer wins, and a group inside a layer
 * that the newest reading did not touch survives it. That is what makes "static once, dynamic
 * every 15 s, lists on demand" cheap — a dynamic refresh that only read `dumpsys battery`
 * must not blank the storage figures somebody is looking at.
 */
import type {
  AppInfo,
  AudioInfo,
  DeviceSnapshot,
  DynamicInfo,
  NotificationInfo,
  StaticInfo,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Right-hand group wins, key by key; `undefined` on the right keeps the left value. A nested
 * plain object (a `power` reading inside `dynamic`, say) merges one level further, so a battery
 * reading that omits the voltage does not blank it either.
 */
function mergeGroup<T extends object>(left: T | undefined, right: T | undefined): T | undefined {
  if (right === undefined) return left;
  if (left === undefined) return right;
  const out = { ...left } as Record<string, unknown>;
  for (const [key, value] of Object.entries(right as Record<string, unknown>)) {
    if (value === undefined) continue;
    const previous = out[key];
    out[key] = isRecord(previous) && isRecord(value) ? { ...previous, ...value } : value;
  }
  return out as T;
}

function mergeLayer<T extends object>(
  left: { at: string; data: T } | undefined,
  right: { at: string; data: T } | undefined,
): { at: string; data: T } | undefined {
  if (right === undefined) return left;
  const data = mergeGroup(left?.data, right.data);
  return data === undefined ? right : { at: right.at, data };
}

/**
 * Folds an incoming snapshot into the one on record.
 *
 * - `static` and `dynamic` merge group by group (identity survives a battery-only refresh).
 * - `apps`, `notifications` and `media` are replaced as a whole: they are point readings,
 *   and a partial app list would read as "the rest were uninstalled".
 */
export function mergeSnapshot(
  previous: DeviceSnapshot | undefined,
  incoming: DeviceSnapshot,
): DeviceSnapshot {
  const out: DeviceSnapshot = { ...previous };
  const stat = mergeLayer<StaticInfo>(previous?.static, incoming.static);
  if (stat !== undefined) out.static = stat;
  const dyn = mergeLayer<DynamicInfo>(previous?.dynamic, incoming.dynamic);
  if (dyn !== undefined) out.dynamic = dyn;
  if (incoming.apps !== undefined) out.apps = incoming.apps as { at: string; data: AppInfo[] };
  if (incoming.notifications !== undefined)
    out.notifications = incoming.notifications as {
      at: string;
      data: NotificationInfo[];
    };
  if (incoming.media !== undefined) out.media = incoming.media as { at: string; data: AudioInfo };
  return out;
}

/** The newest moment anything in the snapshot was read. */
export function snapshotAt(snapshot: DeviceSnapshot | undefined): string | null {
  if (snapshot === undefined) return null;
  let newest: string | null = null;
  for (const section of Object.values(snapshot)) {
    if (section === undefined) continue;
    if (newest === null || section.at > newest) newest = section.at;
  }
  return newest;
}

/** Whether anything this snapshot carries is older than `maxAgeMs` relative to `now`. */
export function snapshotStale(
  snapshot: DeviceSnapshot | undefined,
  now: Date,
  maxAgeMs: number,
): boolean {
  const at = snapshotAt(snapshot);
  if (at === null) return true;
  const stamp = Date.parse(at);
  if (Number.isNaN(stamp)) return true;
  return now.getTime() - stamp > maxAgeMs;
}

/**
 * A snapshot arriving over the wire is untrusted: accept the layers it names and drop
 * anything else rather than letting a bridge write arbitrary keys into a record the panel
 * renders. Section shapes are checked shallowly; the host stores what it is given.
 */
export function isDeviceSnapshot(value: unknown): value is DeviceSnapshot {
  if (typeof value !== "object" || value === null) return false;
  for (const [key, section] of Object.entries(value as Record<string, unknown>)) {
    if (!["static", "dynamic", "apps", "notifications", "media"].includes(key)) return false;
    if (typeof section !== "object" || section === null) return false;
    const s = section as Record<string, unknown>;
    if (typeof s.at !== "string" || Number.isNaN(Date.parse(s.at))) return false;
    if (!("data" in s)) return false;
  }
  return true;
}
