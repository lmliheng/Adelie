/**
 * Usage persistence and statistics behind the cost center. Each record's cost is fixed when the
 * row is written, from the price its Project stores for the paired reference at that instant: a
 * later price edit, preset sync or promotion only changes what later Requests cost.
 *
 * Recording:
 * - A token_usage message is one row, with its cost fixed by the recorder here; a request_end
 *   that is not `completed` writes 0 tokens + status, priced the same way (0 for a priced model).
 * - A sub-session's usage is attributed to its own model through its session_meta, and falls
 *   back to the main Session's model when that mapping is missing or was evicted past its cap.
 *
 * Querying:
 * - Nothing is re-priced: every figure sums the costs recorded, so a finished period's total
 *   never moves with the clock.
 * - The summary cards cover today, the last 7 days and everything; a Model with no price is
 *   flagged, a price added later never re-prices the rows already written, and no query looks a
 *   price up at all.
 * - Groups aggregate by date (newest first), Agent, model and Session, folded across models and
 *   narrowed by Agent and range.
 * - Success counts completed requests over every non-aborted one: a user's Stop is not a model
 *   failure.
 * - Model totals sum every record a model ever wrote, per paired reference, per Project.
 * - Lifetime cost is that same whole history summed from the recorded costs, one number per
 *   Project: null while nothing was priced, and flagged when a Model has no price.
 * - Series are zero-filled buckets by minute, hour (local clock), day, ISO week or month, with
 *   per-Agent and per-model series aligned to them; a minute series needs a timestamp window,
 *   the range defaults to 30 days, and an oversized series is refused.
 * - Bucket enumeration stays unique and ascending across DST transitions.
 * - The error table filters before it pages, so a later page never slides onto excluded rows,
 *   and pages through rows rather than records once a day's repeats fold (paging itself is
 *   covered through its route in errors.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  catalogEntryFor,
  offPeakAt,
  requestEnd,
  sessionMeta,
  tokenUsage,
  withOrigin,
} from "@lmliheng/penguin-core";
import type { SessionMetaPayload, TokenCounts } from "@lmliheng/penguin-core";
import { ORIGIN_MODELS_MAX, UsageRecorder } from "../src/runtime/usage-recorder.js";
import { ErrorsRepo } from "../src/db/repos/errors.js";
import { UsageRepo } from "../src/db/repos/usage.js";
import { UsageService, requestCostUsd } from "../src/services/usage-service.js";
import type { PricingLookup, PricingRates } from "../src/services/usage-service.js";
import { openDatabase } from "../src/db/database.js";
import { enumerateBuckets, enumerateTsBuckets, formatLocalDate } from "../src/internal/dates.js";
import type { DatabaseSync } from "node:sqlite";
import { wire } from "@lmliheng/penguin-core/kernel";

const CTX = {
  projectId: "project-x",
  agentId: "agent-x",
  sessionId: "session-main",
  modelId: "main-model",
  provider: "custom",
};

function counts(total: number): TokenCounts {
  return { cache_read: 100, cache_write: 10, output: 5, total };
}

function meta(sessionId: string, modelId: string, provider = "custom"): SessionMetaPayload {
  return {
    session_id: sessionId,
    provider,
    model_id: modelId,
    model_context_window: 100000,
    system_prompt: "",
    agent_state: "/tmp/x",
    workspace: "/tmp/w",
    source: "user",
  };
}

describe("usage-recorder", () => {
  let db: DatabaseSync;
  let repo: UsageRepo;
  /** A recorder whose price lookup answers `stored` (default: no price anywhere). */
  const recorder = (lookupPricing: PricingLookup = async () => undefined, now = new Date()) =>
    wire(UsageRecorder, { usage: repo, clock: { now: () => now }, lookupPricing });

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = wire(UsageRepo, { db: db });
  });
  afterEach(() => db.close());

  it("token_usage → one row (the request bucket), its cost fixed from the price the Project stores", async () => {
    // The lookup stands in for getPricing: the one price the Project bills for a reference. What
    // core stamps on the event is not consulted at all — a promotion lives in web.db beside the
    // file's list price, so only this side can state what a Request cost.
    await recorder(async () => ({ cacheRead: 1, cacheWrite: 2, output: 4 })).record(
      CTX,
      tokenUsage(counts(1000), counts(115)),
    );
    const rows = db.prepare("SELECT * FROM usage_records").all();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.session_id).toBe("session-main");
    expect(row.origin_session_id).toBeNull();
    expect(row.model_id).toBe("main-model");
    expect(row.total).toBe(115); // taken from request.total
    expect(row.cache_read).toBe(100);
    expect(row.cost).toBeCloseTo((100 * 1 + 10 * 2 + 5 * 4) / 1e6, 15);
    expect(row.cost_settled).toBe(1);
  });

  it("a model with no price: the row is written uncosted, and settled", async () => {
    await recorder(async () => undefined).record(CTX, tokenUsage(counts(10), counts(10)));
    const row = db.prepare("SELECT cost, cost_settled FROM usage_records").get()!;
    expect(row.cost).toBeNull();
    expect(row.cost_settled).toBe(1);
  });

  it("the price is asked at the instant the row is written: the same stored peak price bills half off-peak", async () => {
    // A DeepSeek row still storing the catalog's peak price, written at 20:00 Beijing on a Monday
    // (2026-08-31), is billed the off-peak tier — the tier is a fact about when the row was
    // written, never about when someone opens the page (the defect this change fixes).
    //
    // The lookup stands in for getPricing, which folds the stored price, the row's promotion and
    // that instant's tier: what this test pins is that the recorder asks it at its OWN clock's
    // instant and takes the answer as the bill.
    const entry = catalogEntryFor("deepseek", "deepseek-flash")!;
    const peak = entry.pricing!;
    const schedule = entry.offPeakDiscount!;
    const off = (v: number): number => Math.round(v * (1 - schedule.rate) * 1e6) / 1e6;
    const stored = {
      cacheRead: peak.cache_read,
      cacheWrite: peak.cache_write,
      output: peak.output,
    };
    const asked: string[] = [];
    const ctx = { ...CTX, provider: "deepseek", modelId: "deepseek-flash" };
    const recorderAt = (at: Date) =>
      recorder(async (_p, provider, modelId, when) => {
        asked.push(`${provider}/${modelId}@${when.toISOString()}`);
        return offPeakAt(schedule, when)
          ? {
              cacheRead: off(stored.cacheRead),
              cacheWrite: off(stored.cacheWrite),
              output: off(stored.output),
            }
          : stored;
      }, at);

    await recorderAt(new Date("2026-08-31T01:30:00Z")).record(
      ctx,
      tokenUsage(counts(115), counts(115)),
    );
    const peakRow = db.prepare("SELECT cost FROM usage_records").get()!;
    db.prepare("DELETE FROM usage_records").run();
    await recorderAt(new Date("2026-08-31T12:00:00Z")).record(
      ctx,
      tokenUsage(counts(115), counts(115)),
    );
    const offRow = db.prepare("SELECT cost FROM usage_records").get()!;

    expect(asked).toEqual([
      "deepseek/deepseek-flash@2026-08-31T01:30:00.000Z",
      "deepseek/deepseek-flash@2026-08-31T12:00:00.000Z",
    ]);
    expect(peakRow.cost).toBeCloseTo(
      requestCostUsd({ cacheRead: 100, cacheWrite: 10, output: 5 }, stored),
      15,
    );
    // The off-peak rates are the stored ones rounded to six decimals, so the half-price figure
    // agrees with the peak one to a few parts in 1e12 rather than exactly.
    expect(offRow.cost).toBeCloseTo((peakRow.cost as number) * (1 - schedule.rate), 10);
  });

  it("a failed Request costs 0 on a priced model and nothing on an unpriced one; a failing lookup still writes the row", async () => {
    await recorder(async () => ({ cacheRead: 1, cacheWrite: 1, output: 1 })).record(
      CTX,
      requestEnd("fatal"),
    );
    await recorder(async () => undefined).record(CTX, requestEnd("fatal"));
    await recorder(async () => {
      throw new Error("config unreadable");
    }).record(CTX, tokenUsage(counts(5), counts(5)));
    const rows = db.prepare("SELECT status, cost FROM usage_records ORDER BY id").all();
    expect(rows).toEqual([
      { status: "fatal", cost: 0 },
      { status: "fatal", cost: null },
      { status: "completed", cost: null },
    ]);
  });

  it("a sub-session's session_meta registers the origin→model mapping; token_usage is attributed via it", async () => {
    const rec = recorder();
    const childMeta = withOrigin(
      sessionMeta(meta("session-child", "child-model")),
      "session-child",
    );
    await rec.record(CTX, childMeta);
    await rec.record(CTX, withOrigin(tokenUsage(counts(50), counts(50)), "session-child"));
    const row = db.prepare("SELECT * FROM usage_records").get()!;
    expect(row.session_id).toBe("session-main"); // attributed to its owning main Session
    expect(row.origin_session_id).toBe("session-child");
    expect(row.model_id).toBe("child-model");
  });

  it("falls back to the main Session's Model when the origin mapping is missing", async () => {
    const rec = recorder();
    await rec.record(CTX, withOrigin(tokenUsage(counts(5), counts(5)), "session-unknown"));
    const row = db.prepare("SELECT model_id FROM usage_records").get()!;
    expect(row.model_id).toBe("main-model");
  });

  it("non-token_usage messages are a no-op", async () => {
    const rec = recorder();
    await rec.record(CTX, sessionMeta(meta("session-main", "main-model")));
    expect(db.prepare("SELECT COUNT(*) AS n FROM usage_records").get()!.n).toBe(0);
  });

  it("the origin mapping is capped: past the limit the earliest entry is evicted and falls back to the main Session's Model", async () => {
    const rec = recorder();
    for (let i = 0; i <= ORIGIN_MODELS_MAX; i++) {
      // ORIGIN_MODELS_MAX + 1 entries total: the earliest, sub-0, gets evicted.
      await rec.record(CTX, withOrigin(sessionMeta(meta(`sub-${i}`, "sub-model")), `sub-${i}`));
    }
    await rec.record(CTX, withOrigin(tokenUsage(counts(5), counts(5)), "sub-0"));
    await rec.record(CTX, withOrigin(tokenUsage(counts(5), counts(5)), `sub-${ORIGIN_MODELS_MAX}`));
    const rows = db.prepare("SELECT model_id FROM usage_records ORDER BY id").all();
    expect(rows[0]!.model_id).toBe("main-model"); // evicted → falls back
    expect(rows[1]!.model_id).toBe("sub-model"); // still mapped
  });
});

describe("usage-service (sums the costs fixed at record time)", () => {
  let db: DatabaseSync;
  let repo: UsageRepo;
  let service: (now: Date) => UsageService;
  /**
   * The price each model has when a row is WRITTEN: `insert` fixes the row's cost from it, as the
   * recorder does. Changing it afterwards simulates a later price edit — which must not move a
   * recorded row.
   */
  let pricing: Record<string, PricingRates | undefined>;

  /** Queries never look a price up: they sum what was recorded. */
  const lookup: PricingLookup = async () => {
    throw new Error("a usage query must not re-price recorded rows");
  };

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = wire(UsageRepo, { db: db });
    const errors = wire(ErrorsRepo, { db: db });
    service = (now: Date) =>
      wire(UsageService, { usage: repo, errors, lookupPricing: lookup, clock: { now: () => now } });
    pricing = { m1: { cacheRead: 0.3, cacheWrite: 3.75, output: 15 } };
  });
  afterEach(() => db.close());

  // Fixed Tokens per row: cacheRead=10, cacheWrite=1, output=5 → the per-row cost for m1
  const ROW_COST = (10 * 0.3 + 1 * 3.75 + 5 * 15) / 1e6;

  function insert(date: string, opts: Partial<Parameters<UsageRepo["insert"]>[0]> = {}): void {
    const row = {
      cacheRead: 10,
      cacheWrite: 1,
      output: 5,
      modelId: "m1",
      ...opts,
    };
    const rates = pricing[row.modelId];
    repo.insert({
      cost: rates === undefined ? null : requestCostUsd(row, rates),
      ts: `${date}T00:00:00.000Z`,
      date,
      projectId: "p1",
      agentId: "a1",
      sessionId: "s1",
      originSessionId: null,
      modelId: "m1",
      provider: "custom",
      cacheRead: 10,
      cacheWrite: 1,
      output: 5,
      total: 100,
      ...opts,
    });
  }

  it("a query sums the recorded costs, and the total does not move with the clock", async () => {
    // Two rows fixed at different rates (the tier each ran in, decided when it was recorded):
    // reading them at any hour gives the same total.
    insert("2026-08-31", { ts: "2026-08-31T01:30:00.000Z", cost: 0.002 });
    insert("2026-08-31", { ts: "2026-08-31T12:00:00.000Z", cost: 0.001 });
    for (const at of ["2026-08-31T01:30:00Z", "2026-08-31T12:00:00Z", "2026-09-06T01:30:00Z"]) {
      const res = await service(new Date(at)).query("p1", {
        groupBy: "date",
        from: "2026-08-31",
        to: "2026-08-31",
      });
      expect(res.summary.total.cost, at).toBeCloseTo(0.003, 12);
    }
  });

  it("summary cards: today / last 7 days / cumulative; Models without pricing flag hasUncosted", async () => {
    const now = new Date("2026-07-06T10:00:00");
    const today = formatLocalDate(now);
    insert(today);
    insert("2026-07-03"); // within the last 7 days
    insert("2026-06-01", { modelId: "m-unpriced" }); // only in the cumulative total; this Model has no pricing
    const svc = service(now);
    const res = await svc.query("p1", { groupBy: "date" });
    expect(res.summary.today.total).toBe(100);
    expect(res.summary.today.requests).toBe(1);
    expect(res.summary.last7d.total).toBe(200);
    expect(res.summary.total.total).toBe(300);
    expect(res.summary.total.cost).toBeCloseTo(ROW_COST * 2, 12);
    expect(res.summary.total.hasUncosted).toBe(true);
    expect(res.summary.last7d.hasUncosted).toBe(false);
  });

  it("a price changed later never re-prices a recorded row: only the rows written after it carry it", async () => {
    const now = new Date("2026-07-06T10:00:00");
    insert("2026-07-06", { modelId: "m-late" }); // no price yet: recorded uncosted
    insert("2026-07-06"); // m1 at its old price
    const svc = service(now);

    const before = await svc.query("p1", { groupBy: "date" });
    expect(before.summary.total.cost).toBeCloseTo(ROW_COST, 12);
    expect(before.summary.total.hasUncosted).toBe(true);

    // A price added for m-late and m1 re-priced: the two recorded rows keep their figures.
    pricing["m-late"] = { cacheRead: 1, cacheWrite: 1, output: 1 };
    pricing.m1 = { cacheRead: 100, cacheWrite: 100, output: 100 };
    const unchanged = await svc.query("p1", { groupBy: "date" });
    expect(unchanged.summary.total.cost).toBeCloseTo(ROW_COST, 12);
    expect(unchanged.summary.total.hasUncosted).toBe(true);

    insert("2026-07-06", { modelId: "m-late" });
    const after = await svc.query("p1", { groupBy: "date" });
    expect(after.summary.total.cost).toBeCloseTo(ROW_COST + (10 + 1 + 5) / 1e6, 12);
    expect(after.summary.total.hasUncosted).toBe(true); // the first m-late row stays uncosted
  });

  it("group aggregation: date sorted descending; agent/model/session dimensions with agentId drill-down; folded across Models", async () => {
    const now = new Date("2026-07-06T10:00:00");
    pricing.m2 = { cacheRead: 1, cacheWrite: 1, output: 1 };
    insert("2026-07-05", { agentId: "a1", sessionId: "s1", modelId: "m1" });
    insert("2026-07-06", { agentId: "a2", sessionId: "s2", modelId: "m2", total: 300 });
    insert("2026-07-06", { agentId: "a2", sessionId: "s3", modelId: "m1" });
    const svc = service(now);

    const byDate = await svc.query("p1", { groupBy: "date" });
    expect(byDate.groups.map((g) => g.key)).toEqual(["2026-07-06", "2026-07-05"]);
    expect(byDate.groups[0]!.total).toBe(400);
    expect(byDate.groups[0]!.requests).toBe(2);
    // Same date, folded across Models: one m2 row + one m1 row.
    expect(byDate.groups[0]!.cost).toBeCloseTo((10 + 1 + 5) / 1e6 + ROW_COST, 12);

    const byAgent = await svc.query("p1", { groupBy: "agent" });
    expect(byAgent.groups[0]!.key).toBe("a2"); // sorted by Token count descending

    const bySession = await svc.query("p1", { groupBy: "session", agentId: "a2" });
    expect(bySession.groups.map((g) => g.key).sort()).toEqual(["s2", "s3"]);

    // Not visible from another Project.
    const other = await svc.query("p-other", { groupBy: "date" });
    expect(other.groups).toEqual([]);
  });

  it("every cost figure in a response is the recorded sum, with no price lookup at all", async () => {
    const now = new Date("2026-07-06T10:00:00");
    insert("2026-07-06", { modelId: "m1" });
    // Outside the requested range: it must not perturb the figures that are in range.
    insert("2026-06-20", { modelId: "m1", cost: 1 });
    const res = await service(now).query("p1", {
      groupBy: "date",
      from: "2026-07-06",
      to: "2026-07-06",
    });
    expect(res.summary.total.cost).toBeCloseTo(ROW_COST, 12);
    expect(res.summary.today.cost).toBeCloseTo(ROW_COST, 12);
    expect(res.groups[0]!.cost).toBeCloseTo(ROW_COST, 12);
    expect(res.series[0]!.cost).toBeCloseTo(ROW_COST, 12);
  });

  it("from/to filter the groups", async () => {
    const now = new Date("2026-07-06T10:00:00");
    insert("2026-07-06");
    insert("2026-06-20");
    insert("2026-05-01");
    const svc = service(now);
    const res = await svc.query("p1", {
      groupBy: "date",
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(res.groups.map((g) => g.key)).toEqual(["2026-07-06"]);
    expect(res.groups[0]!.cost).toBeCloseTo(ROW_COST, 12);
  });

  // —— status → success-rate pipeline (carried per bucket on the time series) ——

  it("success counts: completed against a denominator of all non-aborted requests, whatever the failure was", async () => {
    const now = new Date("2026-07-06T10:00:00");
    for (let i = 0; i < 7; i++) insert("2026-07-06");
    insert("2026-07-06", { status: "failed", total: 0 });
    insert("2026-07-06", { status: "timeout", total: 0 });
    insert("2026-07-06", { status: "malformed", total: 0 });
    const res = await service(now).query("p1", {
      groupBy: "date",
      from: "2026-07-06",
      to: "2026-07-06",
    });

    // Three different failure statuses, none of them broken out: anything that is
    // not `completed` and not `aborted` counts against the rate, conservatively.
    expect(res.series[0]).toMatchObject({ requests: 10, completed: 7, denominator: 10 });
    const m1 = res.byModelSeries.find((s) => s.modelId === "m1")!;
    expect(m1.completed).toEqual([7]);
    expect(m1.denominator).toEqual([10]);
  });

  it('regression: aborted (the user clicked "Stop") is not a model failure — excluded from the denominator, so interrupts never drag the success rate down', async () => {
    const now = new Date("2026-07-06T10:00:00");
    for (let i = 0; i < 8; i++) insert("2026-07-06");
    // The user clicked "Stop" twice: under the old accounting, the success rate would drop to 8/10 = 80%.
    insert("2026-07-06", { status: "aborted", total: 0 });
    insert("2026-07-06", { status: "aborted", total: 0 });
    const range = { groupBy: "date", from: "2026-07-06", to: "2026-07-06" } as const;
    const res = await service(now).query("p1", range);

    const bucket = res.series[0]!;
    expect(bucket.completed).toBe(8);
    expect(bucket.denominator).toBe(8); // denominator excludes aborted
    expect(bucket.requests).toBe(10); // but the two interrupts are still requests
    expect(bucket.completed / bucket.denominator).toBe(1); // 100%, no longer dragged down by aborts
    // Per-entity counts follow the same rule — they are what the charts' rate lines read.
    expect(res.byAgentSeries[0]!).toMatchObject({ completed: [8], denominator: [8] });

    // A real failure still counts: add one more failed → 8/9.
    insert("2026-07-06", { status: "failed", total: 0 });
    const after = await service(now).query("p1", range);
    expect(after.series[0]!.denominator).toBe(9);
  });

  it("the model filter narrows series but not byModelSeries; the agent filter narrows both", async () => {
    const now = new Date("2026-07-06T10:00:00");
    insert("2026-07-06", { modelId: "m1", agentId: "a1" });
    insert("2026-07-06", { modelId: "m2", agentId: "a2", status: "failed", total: 0 });
    const svc = service(now);
    const range = { groupBy: "date", from: "2026-07-06", to: "2026-07-06" } as const;

    // Filtering by m1: the by-Model chart still draws m2 (for comparison), while
    // every filter-scoped aggregate — the main series included — narrows to m1.
    const filtered = await svc.query("p1", { ...range, modelId: "m1", provider: "custom" });
    expect(filtered.byModelSeries.map((s) => s.modelId).sort()).toEqual(["m1", "m2"]);
    expect(filtered.series[0]!.requests).toBe(1);

    // Filtering by a1: m2's requests belong to a2, so they leave both.
    const byAgent = await svc.query("p1", { ...range, agentId: "a1" });
    expect(byAgent.byModelSeries.map((s) => s.modelId)).toEqual(["m1"]);
    expect(byAgent.series[0]!.requests).toBe(1);
  });

  it("lifetimeCost prices every record the Project wrote, and flags a Model with no price", async () => {
    insert("2026-01-01");
    insert("2020-03-02", { agentId: "a2" });
    expect((await service(new Date()).lifetimeCost("p1")).cost).toBeCloseTo(2 * ROW_COST, 12);

    // A reference no pricing table covers cannot be priced: the number is a lower bound, said
    // out loud, rather than a total that quietly excluded it.
    insert("2026-07-06", { modelId: "m-unknown" });
    const bounded = await service(new Date()).lifetimeCost("p1");
    expect(bounded.cost).toBeCloseTo(2 * ROW_COST, 12);
    expect(bounded.unpriced).toBe(true);

    // An empty Project has no figure at all — not a zero.
    expect(await service(new Date()).lifetimeCost("p-empty")).toEqual({
      cost: null,
      unpriced: false,
    });
  });
});

describe("usage-service model totals (unfiltered, for the models page)", () => {
  let db: DatabaseSync;
  let repo: UsageRepo;
  let service: UsageService;
  const lookup = async () => undefined;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = wire(UsageRepo, { db: db });
    service = wire(UsageService, {
      usage: repo,
      errors: wire(ErrorsRepo, { db: db }),
      lookupPricing: lookup,
    });
  });
  afterEach(() => db.close());

  function insert(date: string, opts: Partial<Parameters<UsageRepo["insert"]>[0]> = {}): void {
    repo.insert({
      cost: null,
      ts: `${date}T00:00:00.000Z`,
      date,
      projectId: "p1",
      agentId: "a1",
      sessionId: "s1",
      originSessionId: null,
      modelId: "m1",
      provider: "custom",
      cacheRead: 10,
      cacheWrite: 1,
      output: 5,
      total: 100,
      ...opts,
    });
  }

  it("sums every record a Model ever wrote, with no date or Agent window", () => {
    insert("2026-01-01");
    insert("2026-07-06");
    // A different Agent, and a date far outside any range the cost center offers: both count.
    insert("2020-03-02", { agentId: "a2" });
    const totals = service.modelTotals("p1").totals;
    expect(totals).toEqual([{ provider: "custom", modelId: "m1", tokens: 300, requests: 3 }]);
  });

  it("keys by the paired reference, so one id under two providers stays two entries", () => {
    insert("2026-07-06");
    insert("2026-07-06", { provider: "gateway" });
    const totals = service.modelTotals("p1").totals;
    expect(totals).toHaveLength(2);
    expect(totals.map((t) => t.provider).sort()).toEqual(["custom", "gateway"]);
  });

  it("is scoped to the Project, and a Model that never ran is absent rather than zero", () => {
    insert("2026-07-06");
    insert("2026-07-06", { projectId: "p2", modelId: "m-elsewhere" });
    const totals = service.modelTotals("p1").totals;
    expect(totals.map((t) => t.modelId)).toEqual(["m1"]);
  });
});

describe("usage-service series (zero-filled time-series buckets)", () => {
  let db: DatabaseSync;
  let repo: UsageRepo;
  let service: (now: Date) => UsageService;
  /** The price a row's cost is fixed at when `insert` writes it. */
  let pricing: Record<string, PricingRates | undefined>;
  const lookup: PricingLookup = async () => undefined;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = wire(UsageRepo, { db: db });
    const errors = wire(ErrorsRepo, { db: db });
    service = (now: Date) =>
      wire(UsageService, { usage: repo, errors, lookupPricing: lookup, clock: { now: () => now } });
    pricing = { m1: { cacheRead: 0.3, cacheWrite: 3.75, output: 15 } };
  });
  afterEach(() => db.close());

  const ROW_COST = (10 * 0.3 + 1 * 3.75 + 5 * 15) / 1e6;

  function insert(date: string, opts: Partial<Parameters<UsageRepo["insert"]>[0]> = {}): void {
    const row = { cacheRead: 10, cacheWrite: 1, output: 5, modelId: "m1", ...opts };
    const rates = pricing[row.modelId];
    repo.insert({
      cost: rates === undefined ? null : requestCostUsd(row, rates),
      ts: `${date}T00:00:00.000Z`,
      date,
      projectId: "p1",
      agentId: "a1",
      sessionId: "s1",
      originSessionId: null,
      modelId: "m1",
      provider: "custom",
      cacheRead: 10,
      cacheWrite: 1,
      output: 5,
      total: 100,
      ...opts,
    });
  }

  it("daily series: every bucket in the range appears exactly once, gaps as zeros; sums, cost, and success counts ride per bucket", async () => {
    const now = new Date("2026-07-06T10:00:00");
    insert("2026-07-02");
    insert("2026-07-02", { status: "failed", total: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
    insert("2026-07-02", { status: "aborted", total: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
    insert("2026-07-04");
    const res = await service(now).query("p1", {
      groupBy: "date",
      from: "2026-07-01",
      to: "2026-07-05",
    });
    expect(res.granularity).toBe("day");
    expect(res.series.map((p) => p.bucket)).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ]);
    const d2 = res.series[1]!;
    expect(d2).toMatchObject({ total: 100, requests: 3, completed: 1, denominator: 2 });
    expect(d2.cost).toBeCloseTo(ROW_COST, 12);
    // Zero-filled gap: nothing happened, but the bucket exists (a line must not bridge it silently).
    expect(res.series[2]).toMatchObject({
      total: 0,
      requests: 0,
      completed: 0,
      denominator: 0,
      cost: null,
    });
  });

  it("weekly buckets key on the ISO week's Monday and aggregate everything in the week; monthly on yyyy-mm", async () => {
    const now = new Date("2026-07-20T10:00:00");
    insert("2026-07-07"); // Tuesday → week of Monday 2026-07-06
    insert("2026-07-12"); // Sunday  → same week
    insert("2026-07-13"); // Monday  → next week
    const weekly = await service(now).query("p1", {
      groupBy: "date",
      from: "2026-07-06",
      to: "2026-07-19",
      granularity: "week",
    });
    expect(weekly.granularity).toBe("week");
    expect(weekly.series.map((p) => p.bucket)).toEqual(["2026-07-06", "2026-07-13"]);
    expect(weekly.series[0]!.requests).toBe(2);
    expect(weekly.series[1]!.requests).toBe(1);

    const monthly = await service(now).query("p1", {
      groupBy: "date",
      from: "2026-06-15",
      to: "2026-07-19",
      granularity: "month",
    });
    expect(monthly.series.map((p) => p.bucket)).toEqual(["2026-06", "2026-07"]);
    expect(monthly.series[1]!.requests).toBe(3);
  });

  it("hourly buckets follow the server's local clock (the same timezone the date column records)", async () => {
    // Build ts from a local wall-clock time so the expectation holds in any test timezone.
    const at = (h: number, m: number) => new Date(2026, 6, 6, h, m);
    const dateStr = formatLocalDate(at(9, 0));
    insert(dateStr, { ts: at(9, 15).toISOString() });
    insert(dateStr, { ts: at(9, 45).toISOString() });
    insert(dateStr, { ts: at(11, 5).toISOString() });
    const res = await service(at(12, 0)).query("p1", {
      groupBy: "date",
      from: dateStr,
      to: dateStr,
      granularity: "hour",
    });
    expect(res.series).toHaveLength(24);
    const byBucket = new Map(res.series.map((p) => [p.bucket, p.requests]));
    expect(byBucket.get(`${dateStr}T09:00`)).toBe(2);
    expect(byBucket.get(`${dateStr}T10:00`)).toBe(0);
    expect(byBucket.get(`${dateStr}T11:00`)).toBe(1);
  });

  it("byAgentSeries aligns index-for-index with series, sorts by total descending, and ignores the agent filter (all agents stay visible)", async () => {
    const now = new Date("2026-07-06T10:00:00");
    insert("2026-07-01", { agentId: "small" });
    insert("2026-07-02", { agentId: "big" });
    insert("2026-07-02", { agentId: "big", status: "failed", total: 0 });
    const res = await service(now).query("p1", {
      groupBy: "date",
      from: "2026-07-01",
      to: "2026-07-03",
      agentId: "small",
    });
    expect(res.byAgentSeries.map((s) => s.agentId)).toEqual(["big", "small"]);
    expect(res.byAgentSeries[0]!.requests).toEqual([0, 2, 0]);
    // Per-bucket success counts ride along, per entity (the failed request counts toward the denominator only).
    expect(res.byAgentSeries[0]!.completed).toEqual([0, 1, 0]);
    expect(res.byAgentSeries[0]!.denominator).toEqual([0, 2, 0]);
    expect(res.byAgentSeries[1]!.requests).toEqual([1, 0, 0]);
    // The main series does honor the agent filter, like every other aggregate.
    expect(res.series.map((p) => p.requests)).toEqual([1, 0, 0]);
  });

  it("byModelSeries mirrors byAgentSeries for the model dimension: aligned, sorted, model-filter-free but agent-filtered", async () => {
    const now = new Date("2026-07-06T10:00:00");
    insert("2026-07-01", { modelId: "m1", agentId: "a1" });
    insert("2026-07-02", { modelId: "m2", agentId: "a1" });
    insert("2026-07-02", { modelId: "m2", agentId: "a1", status: "aborted", total: 0 });
    insert("2026-07-02", { modelId: "m2", agentId: "other" });
    const res = await service(now).query("p1", {
      groupBy: "date",
      from: "2026-07-01",
      to: "2026-07-03",
      agentId: "a1",
      modelId: "m1",
      provider: "custom",
    });
    // The model filter does not narrow the list; the agent filter does.
    expect(res.byModelSeries.map((s) => s.modelId)).toEqual(["m2", "m1"]);
    const m2 = res.byModelSeries[0]!;
    expect(m2.provider).toBe("custom");
    expect(m2.requests).toEqual([0, 2, 0]);
    expect(m2.completed).toEqual([0, 1, 0]);
    // Aborted is excluded from the denominator, same as everywhere else.
    expect(m2.denominator).toEqual([0, 1, 0]);
  });

  it("minute buckets: a trailing timestamp window zero-fills by minute and bounds every range-scoped aggregate", async () => {
    // Build everything from local wall-clock times so expectations hold in any test timezone.
    const at = (h: number, m: number, s = 0) => new Date(2026, 6, 6, h, m, s);
    const dateStr = formatLocalDate(at(10, 0));
    insert(dateStr, { ts: at(9, 58, 30).toISOString() }); // inside the window
    insert(dateStr, { ts: at(10, 20, 0).toISOString() }); // inside
    insert(dateStr, { ts: at(8, 30, 0).toISOString() }); // before the window: excluded
    const res = await service(at(10, 30)).query("p1", {
      groupBy: "date",
      from: dateStr,
      to: dateStr,
      granularity: "minute",
      fromTs: at(9, 30).toISOString(),
      toTs: at(10, 30).toISOString(),
    });
    expect(res.granularity).toBe("minute");
    expect(res.series).toHaveLength(61);
    expect(res.series[0]!.bucket).toBe(`${dateStr}T09:30`);
    expect(res.series.at(-1)!.bucket).toBe(`${dateStr}T10:30`);
    const byBucket = new Map(res.series.map((p) => [p.bucket, p.requests]));
    expect(byBucket.get(`${dateStr}T09:58`)).toBe(1);
    expect(byBucket.get(`${dateStr}T10:20`)).toBe(1);
    // The pre-window row is outside the ts bounds everywhere the range applies.
    expect(res.summary.total.requests).toBe(2);
    expect(res.series.reduce((s, p) => s + p.requests, 0)).toBe(2);
    // The per-entity series are index-aligned with the same minute skeleton, so the
    // charts can read entity[i] against series[i] without carrying bucket keys of their own.
    for (const entity of [...res.byAgentSeries, ...res.byModelSeries]) {
      expect(entity.requests).toHaveLength(res.series.length);
      expect(entity.completed).toHaveLength(res.series.length);
      expect(entity.denominator).toHaveLength(res.series.length);
      expect(entity.requests.filter((n) => n > 0)).toHaveLength(2);
      const at = (bucket: string) =>
        entity.requests[res.series.findIndex((p) => p.bucket === bucket)];
      expect(at(`${dateStr}T09:58`)).toBe(1);
      expect(at(`${dateStr}T10:20`)).toBe(1);
    }
  });

  it("minute granularity without a timestamp window is rejected", async () => {
    const now = new Date("2026-07-06T10:00:00");
    await expect(
      service(now).query("p1", { groupBy: "date", granularity: "minute" }),
    ).rejects.toThrow(/fromTs/);
  });

  it("defaults: no from/to serves the last 30 days; no granularity means day", async () => {
    const now = new Date("2026-07-06T10:00:00");
    insert("2026-07-06");
    const res = await service(now).query("p1", { groupBy: "date" });
    expect(res.granularity).toBe("day");
    expect(res.series).toHaveLength(30);
    expect(res.series[0]!.bucket).toBe("2026-06-07");
    expect(res.series.at(-1)!).toMatchObject({ bucket: "2026-07-06", requests: 1 });
  });

  it("rejects a range × precision that would materialize an oversized series", async () => {
    const now = new Date("2026-07-06T10:00:00");
    await expect(
      service(now).query("p1", {
        groupBy: "date",
        from: "2025-07-01",
        to: "2026-07-01",
        granularity: "hour",
      }),
    ).rejects.toThrow(/granularity/);
  });
});

describe("usage-service settleUnsettledCosts (COMPATIBILITY: rows from before costs were fixed)", () => {
  let db: DatabaseSync;
  let repo: UsageRepo;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = wire(UsageRepo, { db: db });
  });
  afterEach(() => db.close());

  const COUNTS = { cacheRead: 10, cacheWrite: 1, output: 5 };

  /** A row as a build that did not price rows wrote it: Tokens only, cost_settled left at 0. */
  function legacyRow(ts: string, provider: string, modelId: string): void {
    db.prepare(
      `INSERT INTO usage_records
         (ts, date, project_id, agent_id, session_id, provider, model_id, cache_read, cache_write, output, total)
       VALUES (?, ?, 'p1', 'a1', 's1', ?, ?, 10, 1, 5, 16)`,
    ).run(ts, ts.slice(0, 10), provider, modelId);
  }

  it("costs each old row once, at the price its Project stores now, at the tier its own timestamp fell in", async () => {
    // The lookup stands in for `getPricing`: what the Project bills for a reference, at the
    // instant asked — list price, the row's promotion and that instant's tier, all folded in. A
    // scheduled reference's two legacy rows, eight hours of Beijing time apart, therefore settle
    // at the two different tiers they actually ran in rather than at one hour of the clock's.
    const deepseekEntry = catalogEntryFor("deepseek", "deepseek-v4-flash")!;
    const schedule = deepseekEntry.offPeakDiscount!;
    const peak = deepseekEntry.pricing!;
    const peakRate = {
      cacheRead: peak.cache_read,
      cacheWrite: peak.cache_write,
      output: peak.output,
    };
    const less = (v: number, fraction: number): number =>
      Math.round(v * (1 - fraction) * 1e6) / 1e6;
    const half = (v: number): number => less(v, schedule.rate);
    // A catalog row on a flat promotion: the Project's price for it is the list rate less that
    // fraction, at either tier (glm-5.3-flash has no schedule).
    const promoted = catalogEntryFor("tokendance", "glm-5.3-flash")!;
    expect(promoted.discount).toBeGreaterThan(0);
    const list = promoted.pricing!;
    const discounted = {
      cacheRead: less(list.cache_read, promoted.discount!),
      cacheWrite: less(list.cache_write, promoted.discount!),
      output: less(list.output, promoted.discount!),
    };
    const lookups: string[] = [];
    const svc = wire(UsageService, {
      usage: repo,
      errors: wire(ErrorsRepo, { db: db }),
      lookupPricing: async (_p: string, provider: string, modelId: string, at: Date) => {
        lookups.push(`${provider}/${modelId}@${at.toISOString()}`);
        if (provider === "deepseek") {
          return offPeakAt(schedule, at)
            ? {
                cacheRead: half(peakRate.cacheRead),
                cacheWrite: half(peakRate.cacheWrite),
                output: half(peakRate.output),
              }
            : peakRate;
        }
        if (provider === "tokendance") return discounted;
        return undefined;
      },
      clock: { now: () => new Date() },
    });
    // Monday 2026-08-31: 01:30Z is 09:30 Beijing (peak), 12:00Z is 20:00 (off-peak).
    legacyRow("2026-08-31T01:30:00.000Z", "deepseek", "deepseek-v4-flash");
    legacyRow("2026-08-31T12:00:00.000Z", "deepseek", "deepseek-v4-flash");
    legacyRow("2026-08-31T12:00:00.000Z", "tokendance", "glm-5.3-flash");
    legacyRow("2026-08-31T12:00:00.000Z", "custom", "m-unpriced");
    // A row the recorder fixed is never touched, and never priced for again.
    repo.insert({
      ts: "2026-08-31T12:00:00.000Z",
      date: "2026-08-31",
      projectId: "p1",
      agentId: "a1",
      sessionId: "s1",
      originSessionId: null,
      provider: "deepseek",
      modelId: "deepseek-v4-flash",
      ...COUNTS,
      total: 16,
      cost: 42,
    });

    expect(await svc.settleUnsettledCosts()).toBe(4);
    // Every unsettled row is asked for at its OWN timestamp (the settled one is not asked for at
    // all), so the two rows of one reference settle at the tier each actually ran in.
    expect([...lookups].sort()).toEqual(
      [
        "deepseek/deepseek-v4-flash@2026-08-31T01:30:00.000Z",
        "deepseek/deepseek-v4-flash@2026-08-31T12:00:00.000Z",
        "tokendance/glm-5.3-flash@2026-08-31T12:00:00.000Z",
        "custom/m-unpriced@2026-08-31T12:00:00.000Z",
      ].sort(),
    );
    const rows = db
      .prepare("SELECT cost, cost_settled FROM usage_records ORDER BY id")
      .all() as Array<{ cost: number | null; cost_settled: number }>;
    const peakCost = requestCostUsd(COUNTS, peakRate);
    expect(rows[0]!.cost).toBeCloseTo(peakCost, 15);
    expect(rows[1]!.cost).toBeCloseTo(peakCost * (1 - schedule.rate), 10);
    expect(rows[1]!.cost).toBeLessThan(rows[0]!.cost!);
    expect(rows[2]!.cost).toBeCloseTo(requestCostUsd(COUNTS, discounted), 15);
    expect(rows[3]!.cost).toBeNull();
    expect(rows[4]!.cost).toBe(42);
    expect(rows.every((r) => r.cost_settled === 1)).toBe(true);

    // A second boot finds nothing left to settle, and reads no price for it.
    lookups.length = 0;
    expect(await svc.settleUnsettledCosts()).toBe(0);
    expect(lookups).toEqual([]);
  });
});

describe("bucket enumeration across a DST transition", () => {
  // The zero-fill skeleton and SQLite's `strftime(..., 'localtime')` must agree key for key.
  // A fall-back replays a whole local hour, so two instants an hour apart share one key;
  // the enumeration has to emit that key once, or one of the two points it feeds stays empty.
  const realTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/New_York";
  });
  afterEach(() => {
    if (realTz === undefined) delete process.env.TZ;
    else process.env.TZ = realTz;
  });

  /** 2026-11-01 01:00 EDT (UTC-4) — the hour after this one is replayed as EST (UTC-5). */
  const foldStart = new Date(Date.UTC(2026, 10, 1, 5, 0));
  const foldEnd = new Date(Date.UTC(2026, 10, 1, 7, 0)); // 02:00 EST, past the replay

  it("minute keys over a replayed hour are unique and stay ascending", () => {
    const keys = enumerateTsBuckets(foldStart, foldEnd, "minute");
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(keys);
    expect(keys.filter((k) => k === "2026-11-01T01:30")).toEqual(["2026-11-01T01:30"]);
    expect(keys.at(0)).toBe("2026-11-01T01:00");
    expect(keys.at(-1)).toBe("2026-11-01T02:00");
  });

  it("hour keys over the same window collapse the replayed hour to one bucket", () => {
    expect(enumerateTsBuckets(foldStart, foldEnd, "hour")).toEqual([
      "2026-11-01T01:00",
      "2026-11-01T02:00",
    ]);
    // The date-driven path walks the same clock: a 25-hour local day still has 24 hour keys.
    const day = enumerateBuckets("2026-11-01", "2026-11-01", "hour");
    expect(new Set(day).size).toBe(day.length);
    expect(day).toHaveLength(24);
  });

  it("a spring-forward day is short a key rather than inventing the hour that never happened", () => {
    const day = enumerateBuckets("2026-03-08", "2026-03-08", "hour");
    expect(day).toHaveLength(23);
    expect(day).not.toContain("2026-03-08T02:00");
  });
});

describe("usage-service.queryErrors (error table paging)", () => {
  let db: DatabaseSync;
  let errors: ErrorsRepo;
  let service: UsageService;

  beforeEach(() => {
    db = openDatabase(":memory:");
    errors = wire(ErrorsRepo, { db: db });
    service = wire(UsageService, {
      usage: wire(UsageRepo, { db: db }),
      errors,
      lookupPricing: async () => undefined,
      clock: { now: () => new Date() },
    });
    // 25 rows, oldest first — so "newest first" ordering is observable across a page boundary.
    for (let i = 0; i < 25; i += 1) {
      errors.insert({
        ts: `2026-07-27T00:00:${String(i).padStart(2, "0")}.000Z`,
        date: "2026-07-27",
        projectId: "p1",
        agentId: "a1",
        sessionId: "s1",
        source: "http",
        kind: "expected",
        code: `code_${i}`,
        status: 400,
        message: `m${i}`,
      });
    }
  });
  afterEach(() => db.close());

  it("pages through rows, not records, once a day's repeats fold", () => {
    // Ten more of one error on the same day: one more row, ten more records.
    for (let i = 0; i < 10; i += 1) {
      errors.insert({
        ts: `2026-07-27T01:00:${String(i).padStart(2, "0")}.000Z`,
        date: "2026-07-27",
        projectId: "p1",
        agentId: "a1",
        sessionId: "s1",
        source: "messaging",
        kind: "expected",
        code: "messaging_connect_failed",
        status: null,
        message: "gateway stopped acknowledging heartbeats",
      });
    }
    const first = service.queryErrors("p1", { offset: 0, limit: 20 });
    expect(first.total).toBe(35);
    expect(first.rows).toBe(26);
    expect(first.items[0]).toMatchObject({ code: "messaging_connect_failed", count: 10 });
    expect(service.queryErrors("p1", { offset: 20, limit: 20 }).items).toHaveLength(6);
  });

  it("filters before it offsets, so a later page never slides onto rows the summary excluded", () => {
    // Five newer rows from another Agent, i.e. sitting at the head of the unfiltered table. If
    // the offset were counted over that table and the filter applied afterwards, both pages
    // below would come back shifted (and page two short); filtering first is what makes the
    // 25-row filtered set page cleanly as 20 + 5.
    for (let i = 0; i < 5; i += 1) {
      errors.insert({
        ts: `2026-07-28T00:00:0${i}.000Z`,
        date: "2026-07-28",
        projectId: "p1",
        agentId: "other",
        sessionId: "s2",
        source: "http",
        kind: "expected",
        code: `other_${i}`,
        status: 400,
        message: "m",
      });
    }
    const scoped = { offset: 0, limit: 20, agentId: "a1" };
    const first = service.queryErrors("p1", scoped);
    expect(first.total).toBe(25); // the other Agent's five are outside the count, not just the page
    expect(first.items[0]!.code).toBe("code_24");
    expect(first.items.at(-1)!.code).toBe("code_5");
    const second = service.queryErrors("p1", { ...scoped, offset: 20 });
    expect(second.items.map((e) => e.code)).toEqual([
      "code_4",
      "code_3",
      "code_2",
      "code_1",
      "code_0",
    ]);
    // Unfiltered, the same offset lands on entirely different rows — the filter is doing work.
    const unscoped = service.queryErrors("p1", { offset: 20, limit: 20 });
    expect(unscoped.total).toBe(30);
    expect(unscoped.items.map((e) => e.code)).toEqual([
      "code_9",
      "code_8",
      "code_7",
      "code_6",
      "code_5",
      "code_4",
      "code_3",
      "code_2",
      "code_1",
      "code_0",
    ]);
  });
});
