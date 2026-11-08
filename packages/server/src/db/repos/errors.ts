/**
 * error_records table repo: one row per error the server catches.
 *
 * Key difference from usage_records: **all attribution columns are nullable** — errors
 * from the login/register endpoints have no Project, and process-level catch-alls
 * (uncaughtException) don't even have a request. These **unattributed errors are visible
 * only to admins** (`ErrorFilter.includeGlobal`, defaults to false): they represent other
 * users' login failures, misdirected Session access, and process crashes (the message may
 * contain internal paths and variable values), so surfacing them in any regular member's
 * statistics center would be a cross-tenant information leak — regular members see only
 * their own Project's errors. Admins still see the category that most needs visibility.
 *
 * **Row cap** (MAX_ROWS): errors often come in storms (an API scan producing a wall of
 * 404s, a tool failing repeatedly in a loop), and an uncapped table would blow up disk
 * usage. So the insert path enforces the cap: check capacity every PRUNE_EVERY inserts
 * (insertion sits on the error-handling path, so we avoid COUNT on every call), and when
 * over the limit, evict the oldest rows in ascending id order. The excess is computed via
 * an **exact COUNT**, not an approximation like `id <= MAX(id) - :max` — after
 * deleteByProject removes rows, id and row count diverge, and the approximation would
 * wrongly delete still-valid data within the cap. The first line of defense is
 * ErrorRecorder's short-window deduplication.
 *
 * **Ignoring** (error_ignore_rules) keeps recurring-by-design noise — an engine that
 * reconnects, a tool that reports a missing file — off the panel without losing it: a rule
 * says which records are covered, and `ErrorFilter.ignored` picks one side of it. The
 * filtering happens **on read, never on insert**: the recorder sits on the error-handling
 * path and must not grow a table lookup that can fail, the records stay answerable ("has
 * this stopped?"), and the engine's own dedup and the row cap already bound the storm. The
 * axis narrows every read and the clear together, exactly as `kind` does, so a clear still
 * takes exactly what its caller was looking at — including, from the ignored view, the
 * covered rows themselves.
 */
import { Component, Use } from "@adelie/core/kernel";
import type { Db } from "../../hmr/capabilities.js";
import type { ErrorLog } from "../../mechanisms/observability.js";

/** Row cap: once exceeded, oldest rows are evicted in ascending id order (see file header). */
export const MAX_ROWS = 20000;

/** Check capacity every N inserts (see file header: insertion sits on the error-handling path, so we avoid COUNT on every call). */
export const PRUNE_EVERY = 200;

/** Capacity parameters (default to the two constants above; tests inject small values to exercise the eviction path). */
export interface ErrorsRepoLimits {
  maxRows?: number;
  pruneEvery?: number;
}

export interface ErrorRecordInsert {
  ts: string;
  date: string;
  projectId: string | null;
  agentId: string | null;
  sessionId: string | null;
  source: string;
  /** expected (HttpError, business 4xx) | unexpected (500 / unforeseen runtime error). */
  kind: string;
  code: string;
  status: number | null;
  message: string;
}

/** Generic filter: date range + agent (errors have no Model dimension, so no model filter). */
export interface ErrorFilter {
  from?: string;
  to?: string;
  /**
   * Instant bounds (UTC ISO strings, the spelling `ts` is written in) narrowing the date
   * range to a trailing window — the last hour, the last 24 hours. Both or neither.
   */
  fromTs?: string;
  toTs?: string;
  /**
   * Inclusive upper instant bound (`ts <= until`): the newest record a clear's confirmation
   * counted. A clear carries it so it removes exactly the set the sentence named, even though
   * a record can land between the read that produced the count and the delete — the cost
   * center records one of its own requests on every load.
   */
  until?: string;
  agentId?: string;
  /** One error category (`unexpected` / `expected`); absent counts both, which is what the panel shows. */
  kind?: string;
  /**
   * Which side of the ignore rules to read: `true` = only the records a rule covers (the panel's
   * "ignored" view), absent or `false` = only the records no rule covers (its default view). One
   * axis among the others — it narrows `summary` / `topCode` / `recent` / `rowCount` and
   * `deleteFiltered` alike, so what a clear takes stays exactly what its caller read.
   */
  ignored?: boolean;
  /** Whether to include unattributed errors (`project_id IS NULL`): admins only, defaults to false (see file header). */
  includeGlobal?: boolean;
}

/** Total error count and how many are unexpected (stats for the statistics center's error panel). */
export interface ErrorSummary {
  total: number;
  unexpected: number;
}

/** Occurrence count for one source · code pair (the error panel's "most common" metric). */
export interface ErrorCodeCount {
  source: string;
  code: string;
  kind: string;
  count: number;
}

/**
 * One row of the error panel's table: the records of one calendar day that share a source,
 * code, kind and message (see ErrorsRepo.recent).
 */
export interface ErrorItem {
  /** The latest of the records this row stands for. */
  ts: string;
  source: string;
  code: string;
  kind: string;
  message: string;
  /** How many records this row stands for. */
  count: number;
  /** The earliest of them (equal to `ts` for a single record). */
  firstTs: string;
}

/**
 * One rule that keeps a class of errors out of the panel's default view. A record is covered
 * when its source and code equal the rule's, and — when the rule carries a fragment — its
 * message contains it. The record itself is untouched: only the reads stop selecting it.
 */
export interface ErrorIgnoreRule {
  id: number;
  source: string;
  code: string;
  /** NULL = the whole source · code class; otherwise only messages containing this substring. Never an empty string (see the schema). */
  messageLike: string | null;
  /** Why it was silenced, in the owner's words; NULL when they wrote none. */
  note: string | null;
  /** The Project owner who made it. */
  createdBy: string;
  createdAt: string;
  /** How many of this Project's records the rule covers, all time — the rule list's figure. */
  hidden: number;
  /** The newest one it covers; NULL while it covers none (a rule made ahead of the noise). */
  lastTs: string | null;
}

/** What `addIgnoreRule` writes (the id and the two derived figures come from the table). */
export interface ErrorIgnoreRuleInsert {
  source: string;
  code: string;
  /**
   * The message fragment, or null/absent for the whole class. An empty or blank string is read
   * as the whole class: `instr(x, '')` is > 0 for every row, so keeping the empty string would
   * mean a rule that covers everything.
   */
  messageLike?: string | null;
  note?: string | null;
  createdBy: string;
  createdAt: string;
}

/** The part of a rule that decides which records it covers — a saved rule's own two columns, or one a caller is only counting. */
export interface ErrorIgnoreRuleMatch {
  source: string;
  code: string;
  messageLike: string | null;
}

/**
 * The calendar day a record falls on in the table: the viewer's, from their offset east of UTC
 * applied to `ts`, or — with no offset given — the `date` column, which is the server's own.
 * The offset is bound rather than spliced in, as the modifier `date()` takes.
 */
function dayOf(utcOffsetMinutes: number | undefined): {
  sql: string;
  params: Record<string, string>;
} {
  if (utcOffsetMinutes === undefined) return { sql: "date", params: {} };
  const sign = utcOffsetMinutes >= 0 ? "+" : "-";
  return {
    sql: "date(ts, :dayShift)",
    params: { dayShift: `${sign}${Math.abs(utcOffsetMinutes)} minutes` },
  };
}

/**
 * The predicate a record must satisfy to be covered by one of its Project's rules: an EXISTS over
 * the rules, correlated on the OUTER `error_records` row. The inner `r.source` / `r.code` are the
 * rule's own columns, so they have to be qualified — written as `r.source = source` the right-hand
 * name would resolve to `r` and the comparison would be the rule against itself, covering every
 * record in sight. The fragment test is `instr`, not LIKE: a fragment is literal text, and a LIKE
 * would first have to escape whatever `%` and `_` it happens to contain.
 */
const COVERED_BY_A_RULE = `EXISTS (
       SELECT 1 FROM error_ignore_rules r
        WHERE r.project_id = error_records.project_id
          AND r.source = error_records.source
          AND r.code = error_records.code
          AND (r.message_like IS NULL OR instr(error_records.message, r.message_like) > 0)
     )`;

@Component()
export class ErrorsRepo implements ErrorLog {
  private readonly maxRows: number = MAX_ROWS;
  private readonly pruneEvery: number = PRUNE_EVERY;
  /** Insert count since the last capacity check (see file header: avoids COUNT on every call). */
  private sinceCheck = 0;

  @Use() private readonly db!: Db;

  insert(r: ErrorRecordInsert): void {
    this.db
      .prepare(
        `INSERT INTO error_records
           (ts, date, project_id, agent_id, session_id, source, kind, code, status, message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        r.ts,
        r.date,
        r.projectId,
        r.agentId,
        r.sessionId,
        r.source,
        r.kind,
        r.code,
        r.status,
        r.message,
      );
    if (++this.sinceCheck >= this.pruneEvery) {
      this.sinceCheck = 0;
      this.pruneOverflow();
    }
  }

  /** Capacity enforcement (see file header): compute the exact excess via COUNT, then delete the oldest rows in ascending id order. */
  private pruneOverflow(): void {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM error_records").get()!;
    const excess = (row.n as number) - this.maxRows;
    if (excess <= 0) return;
    this.db
      .prepare(
        `DELETE FROM error_records WHERE id IN (
           SELECT id FROM error_records ORDER BY id ASC LIMIT :excess
         )`,
      )
      .run({ excess });
  }

  /**
   * WHERE fragment and named params: everything the caller filtered by — this Project (admins
   * additionally get unattributed errors), the dates, the window, the Agent, the category — and
   * then the one axis that is not a column on the table, `ignored`, resolved against the rules.
   */
  private conds(
    projectId: string,
    f: ErrorFilter,
  ): { where: string; params: Record<string, string> } {
    const { conds, params } = this.scopeConds(projectId, f);
    // The default view is what no rule covers; the ignored view is what one does. Both sides are
    // the same predicate, so neither can drift from the other or from `ignoreRuleMatches`.
    conds.push(f.ignored === true ? COVERED_BY_A_RULE : `NOT ${COVERED_BY_A_RULE}`);
    return { where: conds.join(" AND "), params };
  }

  /**
   * `conds` without the ignore axis: the Project, the dates, the window, the Agent and the
   * category. Kept apart for the two callers that must NOT be narrowed by a rule — counting what
   * one rule covers, and matching a rule against the rows it will cover from now on.
   */
  private scopeConds(
    projectId: string,
    f: ErrorFilter,
  ): { conds: string[]; params: Record<string, string> } {
    // Unattributed errors (login failures, process crashes, ...) are visible only to admins; otherwise it's a cross-tenant leak — see file header.
    const conds = [
      f.includeGlobal === true ? "(project_id = :pid OR project_id IS NULL)" : "project_id = :pid",
    ];
    const params: Record<string, string> = { pid: projectId };
    if (f.from !== undefined) {
      conds.push("date >= :from");
      params.from = f.from;
    }
    if (f.to !== undefined) {
      conds.push("date <= :to");
      params.to = f.to;
    }
    if (f.fromTs !== undefined) {
      conds.push("ts >= :fromTs");
      params.fromTs = f.fromTs;
    }
    if (f.toTs !== undefined) {
      conds.push("ts <= :toTs");
      params.toTs = f.toTs;
    }
    if (f.until !== undefined) {
      conds.push("ts <= :until");
      params.until = f.until;
    }
    if (f.agentId !== undefined) {
      // Filtering by Agent naturally leaves only that Agent's errors (HTTP / process-level errors have no agent_id).
      conds.push("agent_id = :agentId");
      params.agentId = f.agentId;
    }
    if (f.kind !== undefined) {
      conds.push("kind = :kind");
      params.kind = f.kind;
    }
    return { conds, params };
  }

  /** Total count + how many are unexpected. */
  summary(projectId: string, f: ErrorFilter = {}): ErrorSummary {
    const { where, params } = this.conds(projectId, f);
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN kind = 'unexpected' THEN 1 ELSE 0 END), 0) AS unexpected
         FROM error_records WHERE ${where}`,
      )
      .get(params)!;
    return { total: row.total as number, unexpected: row.unexpected as number };
  }

  /** The most frequent source · code (ties broken by code's lexicographic order); null if there are no errors. */
  topCode(projectId: string, f: ErrorFilter = {}): ErrorCodeCount | null {
    const { where, params } = this.conds(projectId, f);
    const row = this.db
      .prepare(
        `SELECT source, code, kind, COUNT(*) AS count
         FROM error_records WHERE ${where}
         GROUP BY source, code, kind
         ORDER BY count DESC, code ASC
         LIMIT 1`,
      )
      .get(params);
    if (!row) return null;
    return {
      source: row.source as string,
      code: row.code as string,
      kind: row.kind as string,
      count: row.count as number,
    };
  }

  /**
   * One page of the table, newest first: the records of one calendar day that share a source,
   * code, kind and message fold into a single row, with how many there were and the first and
   * last time among them.
   *
   * A failure that comes back all day — a connection that drops and recovers every few
   * minutes, a send that fails whenever it is asked — reads as one line saying how often,
   * rather than a page of the same line; `summary` and `topCode` still count records, which is
   * what measures how often. The day is `utcOffsetMinutes`'s (see dayOf), so the boundary falls
   * at the viewer's midnight. Rows are ordered by their newest record, and a page is `limit`
   * rows, not records.
   */
  recent(
    projectId: string,
    f: ErrorFilter = {},
    limit = 20,
    offset = 0,
    utcOffsetMinutes?: number,
  ): ErrorItem[] {
    const { where, params } = this.conds(projectId, f);
    const day = dayOf(utcOffsetMinutes);
    const rows = this.db
      .prepare(
        `SELECT MAX(ts) AS ts, MIN(ts) AS first_ts, COUNT(*) AS count, source, code, kind, message
         FROM error_records WHERE ${where}
         GROUP BY ${day.sql}, source, code, kind, message
         ORDER BY MAX(id) DESC LIMIT :limit OFFSET :offset`,
      )
      .all({ ...params, ...day.params, limit, offset });
    return rows.map((r) => ({
      ts: r.ts as string,
      source: r.source as string,
      code: r.code as string,
      kind: r.kind as string,
      message: r.message as string,
      count: r.count as number,
      firstTs: r.first_ts as string,
    }));
  }

  /** How many rows `recent` pages through for the same filter and day — what a pager counts. */
  rowCount(projectId: string, f: ErrorFilter = {}, utcOffsetMinutes?: number): number {
    const { where, params } = this.conds(projectId, f);
    const day = dayOf(utcOffsetMinutes);
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT 1 FROM error_records WHERE ${where}
           GROUP BY ${day.sql}, source, code, kind, message
         )`,
      )
      .get({ ...params, ...day.params })!;
    return row.n as number;
  }

  /**
   * Deletes the rows a matching read would have returned, and answers how many went.
   *
   * The WHERE comes from the same `conds` the SELECTs use, `includeGlobal` included, so the
   * delete reaches exactly the rows the caller's own reads reach and never one more: narrowing
   * a filter narrows both halves together, and there is no second expression to drift. The
   * caller passes the `includeGlobal` it reads with — an admin's clear takes the unattributed
   * rows an admin's panel shows, and a member's clear, like a member's read, never sees them.
   * Unattributed rows sit in every Project's admin view, so clearing them from one Project's
   * panel clears them from every other's too: that is the one person who can see them anywhere
   * emptying instance-wide noise, not one tenant reaching into another. deleteByProject and
   * deleteByAgent keep leaving them alone — a cascade is not a person deciding to clear.
   */
  deleteFiltered(projectId: string, f: ErrorFilter = {}): number {
    const { where, params } = this.conds(projectId, f);
    const res = this.db.prepare(`DELETE FROM error_records WHERE ${where}`).run(params);
    return Number(res.changes);
  }

  /** Cascading cleanup on Agent deletion (unattributed errors carry no agent_id and are unaffected). */
  deleteByAgent(projectId: string, agentId: string): void {
    this.db
      .prepare("DELETE FROM error_records WHERE project_id = ? AND agent_id = ?")
      .run(projectId, agentId);
  }

  /**
   * Cascading cleanup on Project deletion (unattributed errors belong to no Project and are
   * unaffected). The Project's ignore rules go with it: they name its errors and mean nothing
   * once those are gone.
   */
  deleteByProject(projectId: string): void {
    this.db.prepare("DELETE FROM error_records WHERE project_id = ?").run(projectId);
    this.db.prepare("DELETE FROM error_ignore_rules WHERE project_id = ?").run(projectId);
  }

  /**
   * The rules keeping this Project's errors out of its default view, oldest first, each with what
   * it covers right now. The two figures are correlated subqueries rather than a join: a rule that
   * covers nothing yet still belongs in the list ("I silenced this before it came back"), and a
   * rule list is a handful of rows that the panel draws whole.
   */
  ignoreRules(projectId: string): ErrorIgnoreRule[] {
    const rows = this.db
      .prepare(
        `SELECT r.id, r.source, r.code, r.message_like, r.note, r.created_by, r.created_at,
                (SELECT COUNT(*) FROM error_records e
                  WHERE e.project_id = r.project_id AND e.source = r.source AND e.code = r.code
                    AND (r.message_like IS NULL OR instr(e.message, r.message_like) > 0)) AS hidden,
                (SELECT MAX(e.ts) FROM error_records e
                  WHERE e.project_id = r.project_id AND e.source = r.source AND e.code = r.code
                    AND (r.message_like IS NULL OR instr(e.message, r.message_like) > 0)) AS last_ts
           FROM error_ignore_rules r
          WHERE r.project_id = ? ORDER BY r.id`,
      )
      .all(projectId);
    return rows.map((r) => ({
      id: r.id as number,
      source: r.source as string,
      code: r.code as string,
      messageLike: (r.message_like ?? null) as string | null,
      note: (r.note ?? null) as string | null,
      createdBy: r.created_by as string,
      createdAt: r.created_at as string,
      hidden: r.hidden as number,
      lastTs: (r.last_ts ?? null) as string | null,
    }));
  }

  /**
   * Adds one rule, or answers null when the Project already has a rule for that class — the same
   * (source, code, fragment) is one rule, not two, and the answer is the caller's to turn into a
   * refusal. Checked here rather than left to the unique index so the ordinary case is a value
   * and not a caught constraint error; the index remains the backstop.
   */
  addIgnoreRule(projectId: string, r: ErrorIgnoreRuleInsert): ErrorIgnoreRule | null {
    const fragment = blankToNull(r.messageLike);
    const duplicate = this.db
      .prepare(
        `SELECT 1 FROM error_ignore_rules
          WHERE project_id = ? AND source = ? AND code = ? AND ifnull(message_like, '') = ifnull(?, '')`,
      )
      .get(projectId, r.source, r.code, fragment);
    if (duplicate) return null;
    const res = this.db
      .prepare(
        `INSERT INTO error_ignore_rules
           (project_id, source, code, message_like, note, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(projectId, r.source, r.code, fragment, blankToNull(r.note), r.createdBy, r.createdAt);
    return this.ignoreRules(projectId).find((rule) => rule.id === Number(res.lastInsertRowid))!;
  }

  /** Removes one rule from this Project; false when there was no such rule in it. */
  removeIgnoreRule(projectId: string, id: number): boolean {
    const res = this.db
      .prepare("DELETE FROM error_ignore_rules WHERE project_id = ? AND id = ?")
      .run(projectId, id);
    return Number(res.changes) > 0;
  }

  /**
   * How many of this Project's records one class covers — `ignoreRules`' own figure, but read
   * against a caller's range instead of all time, and against a class that need not be saved yet.
   * Deliberately not narrowed by the ignore axis: what it counts is exactly the records the rule
   * will take off a panel showing that range.
   */
  ignoreRuleMatches(
    projectId: string,
    rule: ErrorIgnoreRuleMatch,
    f: Omit<ErrorFilter, "ignored"> = {},
  ): number {
    const { conds, params } = this.scopeConds(projectId, f);
    const scoped: Record<string, string> = { ...params, rSource: rule.source, rCode: rule.code };
    conds.push("source = :rSource", "code = :rCode");
    if (rule.messageLike !== null) {
      conds.push("instr(message, :rMessage) > 0");
      scoped.rMessage = rule.messageLike;
    }
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM error_records WHERE ${conds.join(" AND ")}`)
      .get(scoped)!;
    return row.n as number;
  }
}

/** An absent, empty or whitespace-only string is no string at all — the two columns where that distinction is the whole meaning. */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
