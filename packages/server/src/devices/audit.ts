/**
 * The device audit trail: every state change, every action, every alert, one row in
 * `device_events`. What is NOT here is as deliberate as what is — no notification bodies, no
 * file contents, no shell output — so the table can be read months later without becoming a
 * copy of somebody's phone.
 *
 * The table is capped per device (oldest first). An audit that grows forever is a backup
 * problem disguised as a feature; the cap is high enough that "what happened yesterday" is
 * always answerable.
 */
import type { DeviceEvent, DeviceEventKind } from "@adelie/device";
import type { DevicesRepo } from "../db/repos/devices.js";

/** Rows kept per device; beyond this the oldest go. */
export const DEVICE_EVENT_CAP = 2000;

/** Pruning runs every Nth insert — a DELETE on every event is wasted work (cf. notifications). */
const PRUNE_EVERY = 100;

export interface AuditInput {
  deviceId: string;
  kind: DeviceEventKind;
  actor?: string | null;
  action?: string | null;
  detail?: Record<string, unknown> | null;
  at?: string;
}

export class DeviceAudit {
  private inserts = 0;

  constructor(
    private readonly repo: DevicesRepo,
    private readonly now: () => Date = () => new Date(),
  ) {}

  record(input: AuditInput): void {
    this.repo.appendEvent({
      deviceId: input.deviceId,
      at: input.at ?? this.now().toISOString(),
      kind: input.kind,
      actor: input.actor ?? null,
      action: input.action ?? null,
      detail: input.detail ?? null,
    });
    this.inserts += 1;
    if (this.inserts % PRUNE_EVERY === 0) this.repo.pruneEvents(input.deviceId, DEVICE_EVENT_CAP);
  }

  list(deviceId: string, limit = 50): DeviceEvent[] {
    return this.repo.listEvents(deviceId, Math.min(Math.max(limit, 1), 200)).map((row) => ({
      id: row.id,
      deviceId: row.deviceId,
      at: row.at,
      kind: row.kind,
      actor: row.actor,
      action: row.action,
      detail: row.detail,
    }));
  }
}
