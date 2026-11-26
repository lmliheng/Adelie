/**
 * The network panel's rows (pure — unit-tested in test/net-rows.test.ts): which of the recorded
 * requests belong in the panel for the Session on screen, how they group by turn, and the
 * summary the toolbar shows.
 *
 * Grouping is by turn, newest turn first (the reader is looking at the one they just typed); a
 * request made before any turn was opened on this page (a listing fetch, the stream connection)
 * sits in its own group at the end. Within a turn the rows keep their order of arrival.
 */
import type { NetKind, NetRequest } from "../../api/net-log";
import { NET_SLOW_MS } from "../../api/net-log";

/** Which turns the list shows. */
export type NetScope = "turn" | "recent" | "all";

/** The toolbar's type filter. */
export type NetTypeFilter = "all" | NetKind;

/** Turns "最近 5 回合" covers. */
export const RECENT_TURNS = 5;

export interface NetFilter {
  sessionId: string | null;
  scope: NetScope;
  /** The Session's current turn (the "本次回复" anchor). */
  currentTurn: number;
  type: NetTypeFilter;
  query: string;
}

function matchesType(entry: NetRequest, type: NetTypeFilter): boolean {
  return type === "all" || entry.kind === type;
}

function matchesQuery(entry: NetRequest, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const haystack = [
    entry.path,
    entry.method,
    entry.kind,
    entry.resolution ?? "",
    String(entry.status ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * The recorded requests to draw, newest first, for one Session and one set of toolbar choices.
 * "本次回复" keeps the current turn (and the pre-turn group, so the stream connection is still
 * visible); "最近 5 回合" keeps the newest five turns; "全部" keeps everything recorded for the
 * Session.
 */
export function filterNetEntries(entries: readonly NetRequest[], filter: NetFilter): NetRequest[] {
  const { sessionId, scope, currentTurn, type } = filter;
  const scoped = entries.filter((e) => e.sessionId === sessionId);
  const turnsInScope = (): Set<number> | null => {
    if (scope === "all") return null;
    if (scope === "turn") return new Set([currentTurn, 0]);
    const turns = [...new Set(scoped.map((e) => e.turn))].sort((a, b) => b - a);
    const kept = turns.slice(0, RECENT_TURNS);
    if (!kept.includes(0)) kept.push(0);
    return new Set(kept);
  };
  const limit = turnsInScope();
  return scoped
    .filter((e) => (limit === null ? true : limit.has(e.turn)))
    .filter((e) => matchesType(e, type))
    .filter((e) => matchesQuery(e, filter.query))
    .slice()
    .reverse();
}

export interface NetTurnGroup {
  /** The turn these rows belong to (0 = before any turn opened on this page). */
  turn: number;
  items: NetRequest[];
}

/** The rows grouped by turn, newest turn first; a group's rows keep their arrival order. */
export function groupByTurn(rows: readonly NetRequest[]): NetTurnGroup[] {
  const byTurn = new Map<number, NetRequest[]>();
  for (const row of rows) {
    const list = byTurn.get(row.turn);
    if (list === undefined) byTurn.set(row.turn, [row]);
    else list.push(row);
  }
  return [...byTurn.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([turn, items]) => ({ turn, items }));
}

export interface NetSummary {
  requests: number;
  modelCalls: number;
  durationMs: number;
  failures: number;
  bytes: number;
  frames: number;
}

/** The summary line's numbers over the rows on screen. */
export function summarizeNet(rows: readonly NetRequest[]): NetSummary {
  let modelCalls = 0;
  let durationMs = 0;
  let failures = 0;
  let bytes = 0;
  let frames = 0;
  for (const row of rows) {
    if (row.kind === "model") modelCalls += 1;
    durationMs += row.durationMs ?? 0;
    if (isNetFailure(row)) failures += 1;
    bytes += row.responseBytes;
    frames += row.frameCount ?? 0;
  }
  return { requests: rows.length, modelCalls, durationMs, failures, bytes, frames };
}

/** Whether a row is a failure: a transport error, or a non-2xx / non-3xx status. */
export function isNetFailure(entry: NetRequest): boolean {
  if (entry.error !== null) return true;
  return entry.status !== null && entry.status >= 400;
}

/** Whether a row is still in flight (started, not finished). */
export function isNetPending(entry: NetRequest): boolean {
  return entry.endedAt === null;
}

/** Whether a row wears the "慢" tag. */
export function isNetSlow(entry: NetRequest): boolean {
  return entry.durationMs !== null && entry.durationMs >= NET_SLOW_MS;
}

/**
 * A row's status cell: the HTTP code, the model call's own mark (`◆`, its code rides the detail),
 * or `···` while it is still going.
 */
export function netStatusLabel(entry: NetRequest): string {
  if (isNetPending(entry)) return "···";
  if (entry.status === null) return entry.resolution ?? "—";
  return String(entry.status);
}
