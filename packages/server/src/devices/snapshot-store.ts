/**
 * Where a device's layered snapshot lives: one JSON file per device under
 * `<root>/devices/snapshots/`, written atomically and cached in memory.
 *
 * Not in the database on purpose — a snapshot is a derived cache of what the phone answered
 * a minute ago, not a record anybody owns. Deleting the directory loses no history: the next
 * refresh rewrites it. The row in `devices` stays the source of truth for identity, grants
 * and prefs.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { mergeSnapshot, snapshotAt, type DeviceSnapshot } from "@adelie/device";

/** How old the newest section may be before the panel says "stale". */
export const SNAPSHOT_STALE_MS = 60_000;

export class SnapshotStore {
  private readonly dir: string;
  private readonly cache = new Map<string, DeviceSnapshot | null>();

  constructor(root: string) {
    this.dir = path.join(root, "devices", "snapshots");
  }

  /** A file name that neither the id's punctuation nor its length can break. */
  private fileFor(deviceId: string): string {
    const digest = createHash("sha256").update(deviceId).digest("hex").slice(0, 32);
    return path.join(this.dir, `${digest}.json`);
  }

  read(deviceId: string): DeviceSnapshot | null {
    if (this.cache.has(deviceId)) return this.cache.get(deviceId)!;
    let snapshot: DeviceSnapshot | null = null;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.fileFor(deviceId), "utf8"));
      snapshot = typeof parsed === "object" && parsed !== null ? (parsed as DeviceSnapshot) : null;
    } catch {
      snapshot = null;
    }
    this.cache.set(deviceId, snapshot);
    return snapshot;
  }

  /** Folds a reading in and returns the merged snapshot; tmp + rename so a reader never sees half. */
  merge(deviceId: string, incoming: DeviceSnapshot): DeviceSnapshot {
    const merged = mergeSnapshot(this.read(deviceId) ?? undefined, incoming);
    this.cache.set(deviceId, merged);
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const target = this.fileFor(deviceId);
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(merged));
      fs.renameSync(tmp, target);
    } catch {
      // A read-only data root still has the in-memory copy; the panel is not worth crashing for.
    }
    return merged;
  }

  remove(deviceId: string): void {
    this.cache.delete(deviceId);
    try {
      fs.rmSync(this.fileFor(deviceId), { force: true });
    } catch {
      // Nothing to remove, or the root is read-only.
    }
  }

  /** Milliseconds since the newest section was read, or null when nothing has been. */
  ageMs(deviceId: string, now: Date): number | null {
    const at = snapshotAt(this.read(deviceId) ?? undefined);
    if (at === null) return null;
    const stamp = Date.parse(at);
    return Number.isNaN(stamp) ? null : Math.max(0, now.getTime() - stamp);
  }
}
