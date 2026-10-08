/**
 * usage_records table repo:
 * one row per token_usage (per-request bucket), with the Request's cost fixed when the row is
 * written (see usage-recorder) — no aggregation re-prices anything, it sums what was recorded.
 * Every aggregation is still broken down by the `(provider, model_id)` pair (a model_id shared
 * across providers is aggregated separately; never concatenated).
 */
import type { UsageGroupBy } from "../../api/types.js";
import { Component, Use } from "@lmliheng/penguin-core/kernel";
import type { Db } from "../../hmr/capabilities.js";
import type { UsageStore } from "../../mechanisms/observability.js";

export interface UsageRecordInsert {
  ts: string;
  date: string;
  projectId: string;
  agentId: string;
  sessionId: string;
  originSessionId: string | null;
  /** Provider group (pairs with modelId to form the attribution key). */
  provider: string;
  /** Upstream model id (pairs with provider). */
  modelId: string;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  total: number;
  /** Request outcome; defaults to completed (success, carries tokens). Failed requests are stored with 0 tokens + status, for success-rate calculations. */
  status?: string;
  /** The Request's cost in USD, fixed now and never re-derived; null = the model had no price. */
  cost: number | null;
}

/** Generic filter: date range + agent / model dimensions (cost center top bar switches by agent/model). */
export interface UsageFilter {
  from?: string;
  to?: string;
  /** Timestamp window bounds (ISO UTC, compared as strings against the row's `ts`): refine the date range down to instants for the trailing minute/hour windows. */
  fromTs?: string;
  toTs?: string;
  agentId?: string;
  /** Provider filter paired with modelId (the frontend dropdown always sends them together). */
  provider?: string;
  modelId?: string;
  /** Restrict to these sessions (company mode attributes cost by the sessions an organization owns); an empty list matches nothing. */
  sessionIds?: readonly string[];
}

/** Raw Token sums for a single Model (paired reference) — the smallest unit for cost conversion. */
export interface UsageModelSums {
  provider: string;
  modelId: string;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  total: number;
  requests: number;
  /** Sum of the recorded costs (USD); null when no row in the group has one. */
  cost: number | null;
  /** Rows in the group with no recorded cost — the model had no price — which makes `cost` a lower bound. */
  uncosted: number;
}

/** One usage row still waiting for its cost (see UsageRepo.unsettledRows). */
export interface UnsettledUsageRow {
  id: number;
  ts: string;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

/** Raw Token sums by group key x Model. */
export interface UsageGroupModelSums extends UsageModelSums {
  key: string;
}

/** Time-series bucket x Model sums, with the success-rate counts folded in. */
export interface UsageSeriesModelSums extends UsageGroupModelSums {
  /** Successful requests in the bucket. */
  completed: number;
  /**
   * Success-rate denominator: all requests in the bucket minus aborted. The user
   * clicking "stop" is not a model failure, and counting it would drop the success
   * rate every time stop is pressed. Every success-rate denominator in this repo
   * follows this rule.
   */
  denominator: number;
}

/** Per-Agent counts per time bucket (the requests chart's series data). */
export interface UsageAgentBucketCount {
  key: string;
  agentId: string;
  requests: number;
  /** Successful requests in the bucket. */
  completed: number;
  /** Success-rate denominator: all requests minus aborted, same rule as UsageSeriesModelSums. */
  denominator: number;
}

/** Time-series precision (mirrors the API's UsageGranularity). */
export type UsageSeriesGranularity = "minute" | "hour" | "day" | "week" | "month";

/**
 * Bucket-key SQL per granularity. Keys must agree byte-for-byte with
 * internal/dates.ts's enumerateBuckets / enumerateTsBuckets, which zero-fill
 * the same series: minute/hour buckets come from `ts` converted to the
 * server's local clock (the same timezone `date` was recorded in), the rest
 * derive from the `date` column — `date(date, '-6 days', 'weekday 1')` is the
 * ISO week's Monday.
 */
const BUCKET_EXPRS: Record<UsageSeriesGranularity, string> = {
  minute: `strftime('%Y-%m-%dT%H:%M', ts, 'localtime')`,
  hour: `strftime('%Y-%m-%dT%H:00', ts, 'localtime')`,
  day: "date",
  week: `date(date, '-6 days', 'weekday 1')`,
  month: "substr(date, 1, 7)",
};

/** groupBy dimension -> column name allowlist (prevents injection; only these four columns can be group keys). */
const GROUP_COLUMNS: Record<UsageGroupBy, string> = {
  date: "date",
  agent: "agent_id",
  model: "model_id",
  session: "session_id",
};

const SUM_COLUMNS = `COALESCE(SUM(cache_read), 0) AS cache_read,
                COALESCE(SUM(cache_write), 0) AS cache_write,
                COALESCE(SUM(output), 0) AS output,
                COALESCE(SUM(total), 0) AS total,
                COUNT(*) AS requests,
                SUM(cost) AS cost,
                COUNT(*) - COUNT(cost) AS uncosted`;

function toSums(r: Record<string, unknown>): UsageModelSums {
  return {
    provider: r.provider as string,
    modelId: r.model_id as string,
    cacheRead: r.cache_read as number,
    cacheWrite: r.cache_write as number,
    output: r.output as number,
    total: r.total as number,
    requests: r.requests as number,
    cost: r.cost === null || r.cost === undefined ? null : (r.cost as number),
    uncosted: r.uncosted as number,
  };
}

@Component()
export class UsageRepo implements UsageStore {
  @Use() private readonly db!: Db;

  insert(r: UsageRecordInsert): void {
    this.db
      .prepare(
        `INSERT INTO usage_records
           (ts, date, project_id, agent_id, session_id, origin_session_id, provider, model_id,
            cache_read, cache_write, output, total, status, cost, cost_settled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        r.ts,
        r.date,
        r.projectId,
        r.agentId,
        r.sessionId,
        r.originSessionId,
        r.provider,
        r.modelId,
        r.cacheRead,
        r.cacheWrite,
        r.output,
        r.total,
        r.status ?? "completed",
        r.cost,
      );
  }

  /**
   * The paired references (per Project) that still have rows without a fixed cost: rows written
   * before costs were fixed at record time, or by an older build a hot update rolled back to.
   */
  unsettledRefs(): Array<{ projectId: string; provider: string; modelId: string }> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT project_id, provider, model_id FROM usage_records WHERE cost_settled = 0`,
      )
      .all();
    return rows.map((r) => ({
      projectId: r.project_id as string,
      provider: r.provider as string,
      modelId: r.model_id as string,
    }));
  }

  /** One reference's rows still without a fixed cost, with what pricing them needs. */
  unsettledRows(projectId: string, provider: string, modelId: string): UnsettledUsageRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, ts, cache_read, cache_write, output FROM usage_records
         WHERE cost_settled = 0 AND project_id = ? AND provider = ? AND model_id = ?`,
      )
      .all(projectId, provider, modelId);
    return rows.map((r) => ({
      id: r.id as number,
      ts: r.ts as string,
      cacheRead: r.cache_read as number,
      cacheWrite: r.cache_write as number,
      output: r.output as number,
    }));
  }

  /** Fixes the given rows' costs in one transaction; a row settled in the meantime is left alone. */
  settle(rows: ReadonlyArray<{ id: number; cost: number | null }>): void {
    if (rows.length === 0) return;
    const stmt = this.db.prepare(
      "UPDATE usage_records SET cost = ?, cost_settled = 1 WHERE id = ? AND cost_settled = 0",
    );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const r of rows) stmt.run(r.cost, r.id);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /** WHERE fragment (project + optional date/agent/model) plus named params. */
  private conds(
    projectId: string,
    f: UsageFilter,
  ): { where: string; params: Record<string, string> } {
    const conds = ["project_id = :pid"];
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
    if (f.agentId !== undefined) {
      conds.push("agent_id = :agentId");
      params.agentId = f.agentId;
    }
    if (f.provider !== undefined) {
      conds.push("provider = :provider");
      params.provider = f.provider;
    }
    if (f.modelId !== undefined) {
      conds.push("model_id = :modelId");
      params.modelId = f.modelId;
    }
    if (f.sessionIds !== undefined) {
      if (f.sessionIds.length === 0) {
        conds.push("0");
      } else {
        const keys = f.sessionIds.map((id, i) => {
          params[`s${i}`] = id;
          return `:s${i}`;
        });
        conds.push(`session_id IN (${keys.join(", ")})`);
      }
    }
    return { where: conds.join(" AND "), params };
  }

  /** Sums (broken down by paired reference): date range + optional agent/model filter. */
  bucketByModel(projectId: string, f: UsageFilter = {}): UsageModelSums[] {
    const { where, params } = this.conds(projectId, f);
    const rows = this.db
      .prepare(
        `SELECT provider, model_id, ${SUM_COLUMNS}
         FROM usage_records WHERE ${where}
         GROUP BY provider, model_id`,
      )
      .all(params);
    return rows.map(toSums);
  }

  /** Grouped aggregation (group key x paired reference breakdown): date range + optional agent/model filter. */
  groupsByModel(
    projectId: string,
    groupBy: UsageGroupBy,
    f: UsageFilter = {},
  ): UsageGroupModelSums[] {
    const col = GROUP_COLUMNS[groupBy];
    const { where, params } = this.conds(projectId, f);
    const rows = this.db
      .prepare(
        `SELECT ${col} AS key, provider, model_id, ${SUM_COLUMNS}
         FROM usage_records WHERE ${where}
         GROUP BY ${col}, provider, model_id`,
      )
      .all(params);
    return rows.map((r) => ({ key: r.key as string, ...toSums(r) }));
  }

  /**
   * Time-series sums (bucket key x paired reference breakdown) with per-bucket
   * success-rate counts riding along: powers the cost center's time-series charts
   * (requests / success rate / Token / cost) at the requested precision. The
   * denominator excludes aborted.
   */
  seriesByModel(
    projectId: string,
    granularity: UsageSeriesGranularity,
    f: UsageFilter = {},
  ): UsageSeriesModelSums[] {
    const expr = BUCKET_EXPRS[granularity];
    const { where, params } = this.conds(projectId, f);
    const rows = this.db
      .prepare(
        `SELECT ${expr} AS key, provider, model_id, ${SUM_COLUMNS},
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
                COALESCE(SUM(CASE WHEN status <> 'aborted' THEN 1 ELSE 0 END), 0) AS denominator
         FROM usage_records WHERE ${where}
         GROUP BY key, provider, model_id`,
      )
      .all(params);
    return rows.map((r) => ({
      key: r.key as string,
      ...toSums(r),
      completed: r.completed as number,
      denominator: r.denominator as number,
    }));
  }

  /** Per-Agent counts per time bucket (the by-Agent requests chart's series; the denominator excludes aborted). */
  agentSeries(
    projectId: string,
    granularity: UsageSeriesGranularity,
    f: UsageFilter = {},
  ): UsageAgentBucketCount[] {
    const expr = BUCKET_EXPRS[granularity];
    const { where, params } = this.conds(projectId, f);
    const rows = this.db
      .prepare(
        `SELECT ${expr} AS key, agent_id, COUNT(*) AS requests,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
                COALESCE(SUM(CASE WHEN status <> 'aborted' THEN 1 ELSE 0 END), 0) AS denominator
         FROM usage_records WHERE ${where}
         GROUP BY key, agent_id`,
      )
      .all(params);
    return rows.map((r) => ({
      key: r.key as string,
      agentId: r.agent_id as string,
      requests: r.requests as number,
      completed: r.completed as number,
      denominator: r.denominator as number,
    }));
  }

  /** Distinct agent_id values seen for this Project (for filter dropdowns). */
  distinctAgentIds(projectId: string): string[] {
    const rows = this.db
      .prepare(
        "SELECT DISTINCT agent_id AS v FROM usage_records WHERE project_id = ? ORDER BY agent_id",
      )
      .all(projectId);
    return rows.map((r) => r.v as string);
  }

  /** Distinct Model paired references seen for this Project (for filter dropdowns). */
  distinctModels(projectId: string): Array<{ provider: string; modelId: string }> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT provider, model_id FROM usage_records
         WHERE project_id = ? ORDER BY provider, model_id`,
      )
      .all(projectId);
    return rows.map((r) => ({ provider: r.provider as string, modelId: r.model_id as string }));
  }

  deleteByProject(projectId: string): void {
    this.db.prepare("DELETE FROM usage_records WHERE project_id = ?").run(projectId);
  }
}
