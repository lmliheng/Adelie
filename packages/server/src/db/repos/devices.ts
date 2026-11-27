/**
 * The six device tables, as SQL and nothing else — no permission rules, no bridge traffic:
 * those live in `devices/service.ts` and `devices/bridges.ts`.
 *
 * The shape worth knowing before reading the queries:
 *
 * - `devices` is instance-level. A phone plugged into this computer is one row, and
 *   `device_grants` is the separate answer to "which Projects may use it" — no row means
 *   admins only, so the same phone is never three copies in three Projects.
 * - `capabilities` and `permissions` are JSON columns rather than tables of their own: they
 *   are read whole, every time, and a phone has a dozen of each. `normalizePermissions` is
 *   what keeps a hand-edited row from widening a grant.
 * - `device_events` is append-only and deliberately has no foreign key: the audit outlives
 *   the device row, which is the whole point of an audit.
 */
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  defaultPermissions,
  normalizePermissions,
  type Capability,
  type DeviceEvent,
  type DeviceEventKind,
  type DeviceKind,
  type DevicePrefs,
  type DeviceState,
  type DeviceTransport,
  type Permissions,
} from "@adelie/device";

export interface DeviceRow {
  id: string;
  bridgeId: string;
  kind: DeviceKind;
  name: string;
  serial: string | null;
  transport: DeviceTransport;
  platform: string | null;
  state: DeviceState;
  capabilities: Capability[];
  permissions: Permissions;
  pairedAt: string | null;
  lastSeenAt: string | null;
  prefs: DevicePrefs;
}

export interface DeviceBridgeRow {
  id: string;
  name: string;
  kind: "desktop" | "cli" | "companion" | "adapter";
  /** Empty for a local socket, which the filesystem's 0600 already authorizes. */
  tokenHash: string;
  version: string | null;
  capabilities: Capability[];
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export interface DeviceEventRow {
  id: number;
  deviceId: string;
  at: string;
  kind: DeviceEventKind;
  actor: string | null;
  action: string | null;
  detail: Record<string, unknown> | null;
}

export interface DeviceGrantRow {
  deviceId: string;
  projectId: string;
  grantedBy: string;
  grantedAt: string;
}

export interface DeviceAdapterRow {
  id: string;
  version: string;
  dir: string;
  manifest: string;
  enabled: boolean;
  installedAt: string;
  installedBy: string | null;
}

/** A fresh row id: 12 bytes, base64url — the shape every id in this database has. */
function freshId(): string {
  return randomBytes(12).toString("base64url");
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapDevice(r: Record<string, unknown>): DeviceRow {
  return {
    id: r.id as string,
    bridgeId: r.bridge_id as string,
    kind: r.kind as DeviceKind,
    name: r.name as string,
    serial: (r.serial as string | null) ?? null,
    transport: r.transport as DeviceTransport,
    platform: (r.platform as string | null) ?? null,
    state: r.state as DeviceState,
    capabilities: parseJson<Capability[]>(r.capabilities, []),
    permissions: normalizePermissions(parseJson<unknown>(r.permissions, null)),
    pairedAt: (r.paired_at as string | null) ?? null,
    lastSeenAt: (r.last_seen_at as string | null) ?? null,
    prefs: parseJson<DevicePrefs>(r.prefs, {}),
  };
}

function mapEvent(r: Record<string, unknown>): DeviceEventRow {
  return {
    id: r.id as number,
    deviceId: r.device_id as string,
    at: r.at as string,
    kind: r.kind as DeviceEventKind,
    actor: (r.actor as string | null) ?? null,
    action: (r.action as string | null) ?? null,
    detail: parseJson<Record<string, unknown> | null>(r.detail, null),
  };
}

export class DevicesRepo {
  constructor(private readonly db: DatabaseSync) {}

  /* ------------------------------- devices ------------------------------- */

  listDevices(): DeviceRow[] {
    const rows = this.db
      .prepare("SELECT * FROM devices ORDER BY last_seen_at DESC, name")
      .all() as Array<Record<string, unknown>>;
    return rows.map(mapDevice);
  }

  getDevice(id: string): DeviceRow | null {
    const row = this.db.prepare("SELECT * FROM devices WHERE id = ?").get(id);
    return row ? mapDevice(row as Record<string, unknown>) : null;
  }

  /**
   * Creates the row the first time a bridge reports a device, and refreshes what the bridge
   * owns (name, state, transport, capabilities) afterwards. Permissions and prefs are the
   * host's, never the bridge's, so they are untouched here — that is what keeps a reconnecting
   * phone from resetting the grants a person made.
   */
  upsertDevice(row: {
    id: string;
    bridgeId: string;
    kind: DeviceKind;
    name: string;
    serial: string | null;
    transport: DeviceTransport;
    platform: string | null;
    state: DeviceState;
    capabilities: Capability[];
    now: string;
  }): DeviceRow {
    const existing = this.getDevice(row.id);
    if (existing === null) {
      this.db
        .prepare(
          `INSERT INTO devices
             (id, bridge_id, kind, name, serial, transport, platform, state,
              capabilities, permissions, paired_at, last_seen_at, prefs)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          row.bridgeId,
          row.kind,
          row.name,
          row.serial,
          row.transport,
          row.platform,
          row.state,
          JSON.stringify(row.capabilities),
          JSON.stringify(defaultPermissions()),
          row.now,
          row.now,
          JSON.stringify({}),
        );
    } else {
      this.db
        .prepare(
          `UPDATE devices
              SET bridge_id = ?, kind = ?, name = ?, serial = ?, transport = ?, platform = ?,
                  state = ?, capabilities = ?, last_seen_at = ?
            WHERE id = ?`,
        )
        .run(
          row.bridgeId,
          row.kind,
          row.name,
          row.serial,
          row.transport,
          row.platform,
          row.state,
          JSON.stringify(row.capabilities),
          row.now,
          row.id,
        );
    }
    return this.getDevice(row.id)!;
  }

  setState(id: string, state: DeviceState, now: string): void {
    this.db
      .prepare("UPDATE devices SET state = ?, last_seen_at = ? WHERE id = ?")
      .run(state, now, id);
  }

  setPermissions(id: string, permissions: Permissions): void {
    this.db
      .prepare("UPDATE devices SET permissions = ? WHERE id = ?")
      .run(JSON.stringify(permissions), id);
  }

  setPrefs(id: string, prefs: DevicePrefs): void {
    this.db.prepare("UPDATE devices SET prefs = ? WHERE id = ?").run(JSON.stringify(prefs), id);
  }

  deleteDevice(id: string): void {
    this.db.prepare("DELETE FROM devices WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM device_grants WHERE device_id = ?").run(id);
  }

  /* ------------------------------ sessions ------------------------------- */

  startSession(deviceId: string, transport: DeviceTransport, now: string): string {
    const id = freshId();
    this.db
      .prepare(
        "INSERT INTO device_sessions (id, device_id, transport, started_at) VALUES (?, ?, ?, ?)",
      )
      .run(id, deviceId, transport, now);
    return id;
  }

  endSession(deviceId: string, now: string, reason: string): void {
    this.db
      .prepare(
        `UPDATE device_sessions SET ended_at = ?, reason = ?
          WHERE device_id = ? AND ended_at IS NULL`,
      )
      .run(now, reason, deviceId);
  }

  /** Whether this device already has an open connection episode. */
  hasOpenSession(deviceId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 AS one FROM device_sessions WHERE device_id = ? AND ended_at IS NULL")
      .get(deviceId);
    return row !== undefined;
  }

  /* ------------------------------- events -------------------------------- */

  appendEvent(event: DeviceEvent): number {
    const result = this.db
      .prepare(
        `INSERT INTO device_events (device_id, at, kind, actor, action, detail)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.deviceId,
        event.at,
        event.kind,
        event.actor ?? null,
        event.action ?? null,
        event.detail === undefined || event.detail === null ? null : JSON.stringify(event.detail),
      );
    return Number(result.lastInsertRowid);
  }

  listEvents(deviceId: string, limit: number): DeviceEventRow[] {
    const rows = this.db
      .prepare("SELECT * FROM device_events WHERE device_id = ? ORDER BY id DESC LIMIT ?")
      .all(deviceId, limit) as Array<Record<string, unknown>>;
    return rows.map(mapEvent);
  }

  /** Drops everything past the newest `keep` rows of one device — the table is an audit, but not a leak. */
  pruneEvents(deviceId: string, keep: number): void {
    this.db
      .prepare(
        `DELETE FROM device_events
          WHERE device_id = ?
            AND id NOT IN (
              SELECT id FROM device_events WHERE device_id = ? ORDER BY id DESC LIMIT ?
            )`,
      )
      .run(deviceId, deviceId, keep);
  }

  /* ------------------------------- grants -------------------------------- */

  listGrants(deviceId: string): DeviceGrantRow[] {
    const rows = this.db
      .prepare("SELECT * FROM device_grants WHERE device_id = ? ORDER BY granted_at")
      .all(deviceId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      deviceId: r.device_id as string,
      projectId: r.project_id as string,
      grantedBy: r.granted_by as string,
      grantedAt: r.granted_at as string,
    }));
  }

  projectsOf(deviceId: string): string[] {
    return this.listGrants(deviceId).map((g) => g.projectId);
  }

  addGrant(deviceId: string, projectId: string, grantedBy: string, now: string): void {
    this.db
      .prepare(
        `INSERT INTO device_grants (device_id, project_id, granted_by, granted_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (device_id, project_id) DO NOTHING`,
      )
      .run(deviceId, projectId, grantedBy, now);
  }

  removeGrant(deviceId: string, projectId: string): void {
    this.db
      .prepare("DELETE FROM device_grants WHERE device_id = ? AND project_id = ?")
      .run(deviceId, projectId);
  }

  /* ------------------------------ bridges -------------------------------- */

  listBridges(): DeviceBridgeRow[] {
    const rows = this.db
      .prepare("SELECT * FROM device_bridges ORDER BY last_seen_at DESC, name")
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      kind: r.kind as DeviceBridgeRow["kind"],
      tokenHash: (r.token_hash as string) ?? "",
      version: (r.version as string | null) ?? null,
      capabilities: parseJson<Capability[]>(r.capabilities, []),
      lastSeenAt: (r.last_seen_at as string | null) ?? null,
      revokedAt: (r.revoked_at as string | null) ?? null,
    }));
  }

  getBridge(id: string): DeviceBridgeRow | null {
    return this.listBridges().find((b) => b.id === id) ?? null;
  }

  /** First connection writes the row; every later one refreshes what the bridge reports. */
  upsertBridge(row: {
    id: string;
    name: string;
    kind: DeviceBridgeRow["kind"];
    tokenHash: string;
    version: string | null;
    capabilities: Capability[];
    now: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO device_bridges (id, name, kind, token_hash, version, capabilities, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name,
           kind = excluded.kind,
           version = excluded.version,
           capabilities = excluded.capabilities,
           last_seen_at = excluded.last_seen_at,
           revoked_at = NULL`,
      )
      .run(
        row.id,
        row.name,
        row.kind,
        row.tokenHash,
        row.version,
        JSON.stringify(row.capabilities),
        row.now,
      );
  }

  touchBridge(id: string, now: string): void {
    this.db.prepare("UPDATE device_bridges SET last_seen_at = ? WHERE id = ?").run(now, id);
  }

  revokeBridge(id: string, now: string): void {
    this.db.prepare("UPDATE device_bridges SET revoked_at = ? WHERE id = ?").run(now, id);
  }

  /* ------------------------------ adapters ------------------------------- */

  listAdapters(): DeviceAdapterRow[] {
    const rows = this.db
      .prepare("SELECT * FROM device_adapters ORDER BY id, installed_at DESC")
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      version: r.version as string,
      dir: r.dir as string,
      manifest: r.manifest as string,
      enabled: r.enabled === 1,
      installedAt: r.installed_at as string,
      installedBy: (r.installed_by as string | null) ?? null,
    }));
  }

  upsertAdapter(row: DeviceAdapterRow): void {
    this.db
      .prepare(
        `INSERT INTO device_adapters (id, version, dir, manifest, enabled, installed_at, installed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id, version) DO UPDATE SET
           dir = excluded.dir,
           manifest = excluded.manifest,
           installed_by = excluded.installed_by`,
      )
      .run(
        row.id,
        row.version,
        row.dir,
        row.manifest,
        row.enabled ? 1 : 0,
        row.installedAt,
        row.installedBy,
      );
  }

  setAdapterEnabled(id: string, version: string, enabled: boolean): void {
    this.db
      .prepare("UPDATE device_adapters SET enabled = ? WHERE id = ? AND version = ?")
      .run(enabled ? 1 : 0, id, version);
  }
}
