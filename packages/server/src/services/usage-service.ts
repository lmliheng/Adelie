/**
 * Usage statistics query.
 *
 * Cost is **fixed when a Request completes**: every usage_records row carries the cost the
 * recorder computed from the rates in force at that moment, and nothing here re-prices it — a
 * price edited, synced or discounted later only changes what later Requests cost. The repo
 * returns sums broken down by `(provider, model_id)` paired reference, and this service folds
 * them into cost / hasUncosted (a row whose model had no price is excluded from cost and flags
 * hasUncosted).
 * Summary cards (today / last 7 days / cumulative), grouped aggregation (date /
 * agent / model / session, with the session dimension supporting agentId drill-down
 * filtering), and the zero-filled time series the cost center's charts draw.
 * Server-side error statistics (error_records) ride along on the same response:
 * the statistics center fetches everything in one request, and filters are
 * naturally shared; unattributed errors (login failures, process crashes, and other
 * errors with no Project context) are visible only to admins, see the ErrorsRepo
 * file header.
 */
import type {
  UsageAgentSeries,
  UsageBucket,
  UsageErrors,
  UsageErrorsPage,
  UsageGranularity,
  UsageGroupBy,
  UsageGroupRow,
  UsageModelSeries,
  UsageModelTotals,
  UsageResponse,
  UsageSeriesPoint,
} from "../api/types.js";
import type { ErrorFilter } from "../db/repos/errors.js";
import type {
  UsageModelSums,
  UsageGroupModelSums,
  UsageSeriesModelSums,
  UsageAgentBucketCount,
  UsageFilter,
} from "../db/repos/usage.js";
import {
  enumerateBuckets,
  enumerateTsBuckets,
  formatLocalDate,
  localDateMinusDays,
} from "../internal/dates.js";
import { badRequest } from "../http/validate.js";
import { Component, Use } from "@lmliheng/penguin-core/kernel";
import type { Clock } from "../hmr/capabilities.js";
import type { ErrorLog, UsageQueries, UsageStore } from "../mechanisms/observability.js";
import type { ProjectConfigStore } from "../mechanisms/projects.js";

/**
 * Number of most-recent rows kept in the error detail table. Also the page size the whole
 * feature runs on, but nothing needs to hard-code it: `errors.recent` is exactly this many rows
 * whenever a second page exists, so the client derives its page size from the response instead
 * of holding a constant that could drift out of step with this one.
 */
const ERROR_RECENT_N = 10;

/** The three pricing buckets (usd_per_mtok convention), returned by the pricing lookup callback. */
export interface PricingRates {
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

/**
 * The price a Project stores for a paired reference — what a Request on it is billed at when
 * it completes at `at` (the Project's list price for the row, less its promotion, at the tier
 * in force then); undefined = the Project stores no price for it.
 */
export type PricingLookup = (
  projectId: string,
  provider: string,
  modelId: string,
  at: Date,
) => Promise<PricingRates | undefined>;

export interface UsageQuery {
  from?: string;
  to?: string;
  groupBy: UsageGroupBy;
  /** Top-level filter: view by Agent (also used for groupBy=session drill-down). */
  agentId?: string;
  /** Top-level filter: view by Model (paired with modelId; the dropdown always sends them as a pair). */
  provider?: string;
  modelId?: string;
  /** Whether to include unattributed errors: admin only (the route passes user.isAdmin), defaults to false. */
  includeGlobalErrors?: boolean;
  /** Time-series precision for `series` / `byAgentSeries` / `byModelSeries`; defaults to day. The route validates the value; the bucket count is capped here. */
  granularity?: UsageGranularity;
  /**
   * Timestamp window bounds (ISO UTC), for the trailing "last hour" / "last 24
   * hours" ranges whose edges are instants rather than calendar dates: they
   * refine every range-scoped aggregate down to the window, and minute/hour
   * series buckets are enumerated between them. `minute` requires them.
   */
  fromTs?: string;
  toTs?: string;
  /**
   * The viewer's offset east of UTC, in minutes: the calendar day the error table folds a
   * day's repeats by (see ErrorsRepo.recent). Nothing else in the response reads it; absent,
   * the day is the server's own.
   */
  utcOffsetMinutes?: number;
}

/** One page of the error detail table (see {@link UsageService.queryErrors}). */
export interface UsageErrorsQuery {
  offset: number;
  limit: number;
  from?: string;
  to?: string;
  /** The trailing window narrowing those dates (see {@link UsageQuery}); both or neither. */
  fromTs?: string;
  toTs?: string;
  agentId?: string;
  /** Narrow to one category — `unexpected` (500s / runtime exceptions) or `expected`; absent counts both. */
  kind?: string;
  /** Admin only: include errors with no Project attribution (see the ErrorsRepo file header). */
  includeGlobalErrors?: boolean;
  /** The viewer's offset east of UTC, in minutes (see {@link UsageQuery}). */
  utcOffsetMinutes?: number;
}

/**
 * What a clear removes (see {@link UsageService.clearErrors}): the panel's own range — dates,
 * and the trailing window when one is on — and Agent, read with the same admin visibility the
 * panel has. No `kind`: the panel offers no such control, so a clear has no narrowing the
 * reader could have seen.
 */
export interface UsageErrorsClearQuery {
  from?: string;
  to?: string;
  fromTs?: string;
  toTs?: string;
  agentId?: string;
  /** Admin only, the value the caller's reads carry: an admin's clear takes the unattributed rows an admin's panel shows. */
  includeGlobalErrors?: boolean;
}

/** The "model price" formula: the three buckets at the given rates (USD per million Tokens), in USD. */
export function requestCostUsd(
  counts: { cacheRead: number; cacheWrite: number; output: number },
  rates: PricingRates,
): number {
  return (
    (counts.cacheRead * rates.cacheRead +
      counts.cacheWrite * rates.cacheWrite +
      counts.output * rates.output) /
    1e6
  );
}

/** In-process Map key for a paired reference (\0-separated, the same style as session-manager's agentKey; never persisted). */
function refKey(provider: string, modelId: string): string {
  return `${provider}\0${modelId}`;
}

@Component()
export class UsageService implements UsageQueries {
  @Use() private readonly usage!: UsageStore;
  @Use() private readonly errors!: ErrorLog;
  @Use() private readonly projectConfig!: ProjectConfigStore;
  @Use() private readonly clock!: Clock;
  private lookupPricing: PricingLookup = (projectId, provider, modelId, at) =>
    this.projectConfig.getPricing(projectId, provider, modelId, at);

  /**
   * COMPATIBILITY — remove two releases after the one that fixes costs at record time, together
   * with the `cost_settled` column. Fixes the cost of every usage record that has none yet: rows
   * written before costs were fixed at record time, and rows an older build wrote after a hot
   * update rolled back to it. Each is priced at the price its Project stores now, at the tier the
   * record's own timestamp fell in — the read-time cost center's promotion, with the tier pinned
   * to the row rather than to the hour the page happened to be opened. That is the one figure
   * which moves at the upgrade (a row the old page showed in the other tier corrects itself) and
   * never again after it. Idempotent — a settled row is never touched again — and safe beside the
   * recorder, whose rows are settled when written. Returns how many rows it settled.
   */
  async settleUnsettledCosts(): Promise<number> {
    let settled = 0;
    for (const ref of this.usage.unsettledRefs()) {
      const rows = this.usage.unsettledRows(ref.projectId, ref.provider, ref.modelId);
      const costs: Array<{ id: number; cost: number | null }> = [];
      for (const r of rows) {
        const rates = await this.lookupPricing(
          ref.projectId,
          ref.provider,
          ref.modelId,
          new Date(r.ts),
        );
        costs.push({ id: r.id, cost: rates === undefined ? null : requestCostUsd(r, rates) });
      }
      this.usage.settle(costs);
      settled += rows.length;
    }
    return settled;
  }

  /**
   * Period cost per session, for company mode's attribution by the sessions an organization
   * owns: the recorded costs summed per session. `unpriced` says some usage ran on a model
   * without pricing, so the numbers are a lower bound.
   */
  async costBySession(
    projectId: string,
    sessionIds: readonly string[],
    fromTs: string,
    toTs: string,
  ): Promise<{ bySession: Map<string, number>; unpriced: boolean }> {
    const bySession = new Map<string, number>();
    if (sessionIds.length === 0) return { bySession, unpriced: false };
    const rows = this.usage.groupsByModel(projectId, "session", { sessionIds, fromTs, toTs });
    let unpriced = false;
    for (const r of rows) {
      if (r.uncosted > 0) unpriced = true;
      if (r.cost !== null) bySession.set(r.key, (bySession.get(r.key) ?? 0) + r.cost);
    }
    return { bySession, unpriced };
  }

  /** Daily cost of a set of sessions over a window (the organization finance trend). */
  async dailyCostForSessions(
    projectId: string,
    sessionIds: readonly string[],
    fromTs: string,
    toTs: string,
  ): Promise<Array<{ date: string; cost: number }>> {
    if (sessionIds.length === 0) return [];
    const rows = this.usage.seriesByModel(projectId, "day", { sessionIds, fromTs, toTs });
    const byDate = new Map<string, number>();
    for (const r of rows) {
      if (r.cost !== null) byDate.set(r.key, (byDate.get(r.key) ?? 0) + r.cost);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cost]) => ({ date, cost }));
  }

  async query(projectId: string, q: UsageQuery): Promise<UsageResponse> {
    const today = formatLocalDate(this.clock.now());
    // Top-level filter: agent + model (the cost center switches views by agent/model; the model filter is always sent as a pair).
    const base: UsageFilter = {};
    if (q.agentId !== undefined) base.agentId = q.agentId;
    if (q.provider !== undefined) base.provider = q.provider;
    if (q.modelId !== undefined) base.modelId = q.modelId;

    const win = (from?: string, to?: string): UsageFilter => ({
      ...base,
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
    });

    // Timestamp window bounds ride alongside the date range wherever the
    // selected range applies; the calendar-fixed today / last-7-days cards
    // deliberately stay date-only.
    const ts: UsageFilter = {
      ...(q.fromTs !== undefined ? { fromTs: q.fromTs } : {}),
      ...(q.toTs !== undefined ? { toTs: q.toTs } : {}),
    };
    const todayRows = this.usage.bucketByModel(projectId, win(today, today));
    const last7dRows = this.usage.bucketByModel(
      projectId,
      win(localDateMinusDays(this.clock.now(), 6)),
    );
    const totalRows = this.usage.bucketByModel(projectId, { ...win(q.from, q.to), ...ts });
    const groupRows = this.usage.groupsByModel(projectId, q.groupBy, {
      ...win(q.from, q.to),
      ...ts,
    });
    // Time series at the requested precision, zero-filled over the requested
    // range, defaulting to the last 30 days when no range is given.
    const granularity = q.granularity ?? "day";
    const seriesFrom = q.from ?? localDateMinusDays(this.clock.now(), 29);
    const seriesTo = q.to ?? today;
    // The series is zero-filled over the whole effective range: cap the bucket
    // count so an arbitrary range × precision combination cannot materialize an
    // unbounded response. 500 comfortably covers every range the Web App offers
    // (90 days daily = 90, 14 days hourly = 336, a trailing hour by minute = 61).
    // Minute buckets only make sense inside a timestamp window — the trailing
    // ranges — and hour buckets switch to the window when one is given.
    let bucketKeys: string[];
    if (granularity === "minute" || (granularity === "hour" && ts.fromTs !== undefined)) {
      if (ts.fromTs === undefined || ts.toTs === undefined) {
        throw badRequest(
          "fromTs and toTs must be given together, and minute granularity requires them.",
        );
      }
      bucketKeys = enumerateTsBuckets(new Date(ts.fromTs), new Date(ts.toTs), granularity, 500);
    } else {
      bucketKeys = enumerateBuckets(seriesFrom, seriesTo, granularity, 500);
    }
    if (bucketKeys.length > 500) {
      throw badRequest(
        "Date range too wide for this granularity; narrow the range or coarsen the granularity.",
      );
    }
    const seriesRows = this.usage.seriesByModel(projectId, granularity, {
      ...win(seriesFrom, seriesTo),
      ...ts,
    });
    // Per-Agent and per-Model series: each drops its own dimension's filter (its
    // chart draws that dimension's whole breakdown) but honors the other
    // dimension plus the selected range.
    const agentFree: UsageFilter = {
      ...(q.provider !== undefined ? { provider: q.provider } : {}),
      ...(q.modelId !== undefined ? { modelId: q.modelId } : {}),
      ...(q.from !== undefined ? { from: q.from } : {}),
      ...(q.to !== undefined ? { to: q.to } : {}),
      ...ts,
    };
    const agentBucketRows = this.usage.agentSeries(projectId, granularity, {
      ...agentFree,
      from: seriesFrom,
      to: seriesTo,
    });
    // With no model filter set, dropping the model filter leaves exactly the
    // query `seriesRows` already ran: reuse its rows instead of running the
    // heaviest query on this route (bucket x model) a second time.
    const modelFiltered = q.provider !== undefined || q.modelId !== undefined;
    const modelBucketRows = modelFiltered
      ? this.usage.seriesByModel(projectId, granularity, {
          ...(q.agentId !== undefined ? { agentId: q.agentId } : {}),
          from: seriesFrom,
          to: seriesTo,
          ...ts,
        })
      : seriesRows;
    // Error statistics: likewise not affected by the model filter (HTTP / process errors have no Model dimension), but still affected by the date + agent filter — and by the trailing window, like every other range-scoped aggregate.
    const errorFilter: ErrorFilter = {
      ...(q.agentId !== undefined ? { agentId: q.agentId } : {}),
      ...(q.from !== undefined ? { from: q.from } : {}),
      ...(q.to !== undefined ? { to: q.to } : {}),
      ...(q.fromTs !== undefined ? { fromTs: q.fromTs } : {}),
      ...(q.toTs !== undefined ? { toTs: q.toTs } : {}),
      // Unattributed errors are visible only to admins (regular members only see errors within their own Project, see the ErrorsRepo file header).
      ...(q.includeGlobalErrors === true ? { includeGlobal: true } : {}),
    };

    return {
      summary: {
        today: this.foldBucket(todayRows),
        last7d: this.foldBucket(last7dRows),
        total: this.foldBucket(totalRows),
      },
      groupBy: q.groupBy,
      groups: this.foldGroups(groupRows, q.groupBy),
      granularity,
      series: this.foldSeries(bucketKeys, seriesRows),
      byAgentSeries: foldAgentSeries(bucketKeys, agentBucketRows),
      byModelSeries: foldModelSeries(bucketKeys, modelBucketRows),
      errors: this.foldErrors(projectId, errorFilter, q.utcOffsetMinutes),
      agentIds: this.usage.distinctAgentIds(projectId),
      models: this.usage.distinctModels(projectId),
    };
  }

  /**
   * One page of the error detail table, newest first. The dashboard's own response already
   * carries the first page (`errors.recent`); this serves the "show me earlier ones" paging,
   * where refetching the whole aggregate to move one page would be wasteful. `rows` is the
   * filtered row count, so the caller knows when it has reached the end; `total` counts the
   * records behind those rows, the occurrences the badge reports.
   *
   * Takes the same filter the dashboard applies — date + agent, and admin-only visibility of
   * unattributed errors — so a page never widens what the summary above it counted.
   *
   * Paging is by offset into a newest-first table that grows at its head, so errors recorded
   * between two page requests shift every row down and a page can re-show rows already seen.
   * Accepted deliberately: this is a diagnostic table read at a moment in time, not a feed to
   * be walked exhaustively, and keying off the newest row's id would cost a cursor the caller
   * has no other use for.
   */
  queryErrors(projectId: string, q: UsageErrorsQuery): UsageErrorsPage {
    const f: ErrorFilter = {
      ...(q.agentId !== undefined ? { agentId: q.agentId } : {}),
      ...(q.from !== undefined ? { from: q.from } : {}),
      ...(q.to !== undefined ? { to: q.to } : {}),
      ...(q.fromTs !== undefined ? { fromTs: q.fromTs } : {}),
      ...(q.toTs !== undefined ? { toTs: q.toTs } : {}),
      ...(q.kind !== undefined ? { kind: q.kind } : {}),
      ...(q.includeGlobalErrors === true ? { includeGlobal: true } : {}),
    };
    return {
      items: this.errors.recent(projectId, f, q.limit, q.offset, q.utcOffsetMinutes),
      total: this.errors.summary(projectId, f).total,
      rows: this.errors.rowCount(projectId, f, q.utcOffsetMinutes),
    };
  }

  /**
   * Empties the error table for the filter the panel is showing, and answers how many rows went.
   *
   * The filter is the same range (dates, and the trailing window when one is on) and Agent
   * the dashboard and the paged route take, read with the same admin visibility, so a clear
   * removes exactly the set the caller was looking at and never a row outside it: a reader
   * who has narrowed to one Agent and one week does not lose the rest of the year to a button
   * that said "clear", and an admin whose panel showed unattributed rows is not left holding
   * them after clearing it (see ErrorsRepo.deleteFiltered).
   */
  clearErrors(projectId: string, q: UsageErrorsClearQuery): number {
    return this.errors.deleteFiltered(projectId, {
      ...(q.agentId !== undefined ? { agentId: q.agentId } : {}),
      ...(q.from !== undefined ? { from: q.from } : {}),
      ...(q.to !== undefined ? { to: q.to } : {}),
      ...(q.fromTs !== undefined ? { fromTs: q.fromTs } : {}),
      ...(q.toTs !== undefined ? { toTs: q.toTs } : {}),
      ...(q.includeGlobalErrors === true ? { includeGlobal: true } : {}),
    });
  }

  /** Error statistics: summary info (total / unexpected / most common error code) + the table's first N rows and its row count, all filtered by the selected range. */
  private foldErrors(projectId: string, f: ErrorFilter, utcOffsetMinutes?: number): UsageErrors {
    const { total, unexpected } = this.errors.summary(projectId, f);
    return {
      total,
      unexpected,
      topCode: this.errors.topCode(projectId, f),
      recent: this.errors.recent(projectId, f, ERROR_RECENT_N, 0, utcOffsetMinutes),
      rows: this.errors.rowCount(projectId, f, utcOffsetMinutes),
    };
  }

  /**
   * Lifetime Token totals per Model — one grouped scan of `usage_records`, no filters. The
   * models page shows each configured model what it has actually spent, and that figure is not
   * scoped to a range the way the cost center's is; a model with no records is simply absent,
   * so the caller renders nothing rather than a zero.
   */
  modelTotals(projectId: string): UsageModelTotals {
    return {
      totals: this.usage.bucketByModel(projectId).map((r) => ({
        provider: r.provider,
        modelId: r.modelId,
        tokens: r.total,
        requests: r.requests,
      })),
    };
  }

  /**
   * The Project's lifetime cost — one unfiltered grouped scan, the same one `modelTotals` runs,
   * summing the costs fixed when the rows were written. Its consumer is a per-account figure
   * (the admin user backend's cost column), so there is exactly one number: `cost` stays null
   * while nothing could be priced rather than reporting a zero the caller cannot tell from "ran
   * for free", and `unpriced` marks a lower bound.
   */
  async lifetimeCost(projectId: string): Promise<{ cost: number | null; unpriced: boolean }> {
    const { cost, hasUncosted } = this.foldBucket(this.usage.bucketByModel(projectId));
    return { cost, unpriced: hasUncosted };
  }

  private foldBucket(rows: UsageModelSums[]): UsageBucket {
    let total = 0;
    let requests = 0;
    let cost: number | null = null;
    let hasUncosted = false;
    for (const r of rows) {
      total += r.total;
      requests += r.requests;
      if (r.cost !== null) cost = (cost ?? 0) + r.cost;
      if (r.uncosted > 0) hasUncosted = true;
    }
    return { total, requests, cost, hasUncosted };
  }

  private foldGroups(rows: UsageGroupModelSums[], groupBy: UsageGroupBy): UsageGroupRow[] {
    // The model dimension folds by paired reference (a shared model_id name across providers is split into separate rows); other dimensions fold by their group key.
    const keyOf = (r: UsageGroupModelSums): string =>
      groupBy === "model" ? refKey(r.provider, r.key) : r.key;
    const byKey = new Map<string, UsageGroupRow>();
    for (const r of rows) {
      const acc = byKey.get(keyOf(r)) ?? {
        key: r.key,
        ...(groupBy === "model" ? { provider: r.provider } : {}),
        cacheRead: 0,
        cacheWrite: 0,
        output: 0,
        total: 0,
        requests: 0,
        cost: null as number | null,
        hasUncosted: false,
      };
      acc.cacheRead += r.cacheRead;
      acc.cacheWrite += r.cacheWrite;
      acc.output += r.output;
      acc.total += r.total;
      acc.requests += r.requests;
      if (r.cost !== null) acc.cost = (acc.cost ?? 0) + r.cost;
      if (r.uncosted > 0) acc.hasUncosted = true;
      byKey.set(keyOf(r), acc);
    }
    const out = [...byKey.values()];
    // The date dimension sorts by key descending (most recent first); other dimensions sort by total Token count descending.
    if (groupBy === "date") out.sort((a, b) => b.key.localeCompare(a.key));
    else out.sort((a, b) => b.total - a.total);
    return out;
  }

  /**
   * Fold the per-Model series rows onto the zero-filled bucket skeleton: every
   * enumerated bucket appears exactly once, in order, so line charts never
   * connect across a silent gap. A row whose key falls outside the skeleton
   * cannot happen for day/week/month (keys derive from the filtered date
   * column) and is dropped defensively for minute/hour, whose keys come from
   * `ts` and can therefore fall outside a skeleton built from `date` if a row
   * was recorded under a different clock.
   */
  private foldSeries(keys: string[], rows: UsageSeriesModelSums[]): UsageSeriesPoint[] {
    const byKey = new Map<string, UsageSeriesPoint>(
      keys.map((bucket) => [
        bucket,
        {
          bucket,
          cacheRead: 0,
          cacheWrite: 0,
          output: 0,
          total: 0,
          cost: null,
          requests: 0,
          completed: 0,
          denominator: 0,
        },
      ]),
    );
    for (const r of rows) {
      const acc = byKey.get(r.key);
      if (!acc) continue;
      acc.cacheRead += r.cacheRead;
      acc.cacheWrite += r.cacheWrite;
      acc.output += r.output;
      acc.total += r.total;
      acc.requests += r.requests;
      acc.completed += r.completed;
      acc.denominator += r.denominator;
      if (r.cost !== null) acc.cost = (acc.cost ?? 0) + r.cost;
    }
    return keys.map((k) => byKey.get(k)!);
  }
}

const sumOf = (a: number[]) => a.reduce((s, v) => s + v, 0);

const zeros = (n: number) => new Array<number>(n).fill(0);

/**
 * Per-Agent counts aligned index-for-index with the bucket skeleton, sorted by
 * total requests descending (the requests chart takes the head and folds the
 * tail into an "other" series client-side).
 */
function foldAgentSeries(keys: string[], rows: UsageAgentBucketCount[]): UsageAgentSeries[] {
  const idx = new Map(keys.map((k, i) => [k, i]));
  const byAgent = new Map<string, UsageAgentSeries>();
  for (const r of rows) {
    const i = idx.get(r.key);
    if (i === undefined) continue;
    let s = byAgent.get(r.agentId);
    if (!s) {
      s = {
        agentId: r.agentId,
        requests: zeros(keys.length),
        completed: zeros(keys.length),
        denominator: zeros(keys.length),
      };
      byAgent.set(r.agentId, s);
    }
    s.requests[i]! += r.requests;
    s.completed[i]! += r.completed;
    s.denominator[i]! += r.denominator;
  }
  return [...byAgent.values()].sort((a, b) => sumOf(b.requests) - sumOf(a.requests));
}

/** Per-Model counts aligned with the bucket skeleton (entity identity is the (provider, modelId) pair), sorted by total requests descending. */
function foldModelSeries(keys: string[], rows: UsageSeriesModelSums[]): UsageModelSeries[] {
  const idx = new Map(keys.map((k, i) => [k, i]));
  const byModel = new Map<string, UsageModelSeries>();
  for (const r of rows) {
    const i = idx.get(r.key);
    if (i === undefined) continue;
    const key = refKey(r.provider, r.modelId);
    let s = byModel.get(key);
    if (!s) {
      s = {
        provider: r.provider,
        modelId: r.modelId,
        requests: zeros(keys.length),
        completed: zeros(keys.length),
        denominator: zeros(keys.length),
      };
      byModel.set(key, s);
    }
    s.requests[i]! += r.requests;
    s.completed[i]! += r.completed;
    s.denominator[i]! += r.denominator;
  }
  return [...byModel.values()].sort((a, b) => sumOf(b.requests) - sumOf(a.requests));
}
