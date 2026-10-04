// src/usage/aggregate.ts
//
// 把「一次运行」的 token 记录聚合成用量报表（契约 §2 的 `GET /api/usage` 背后那层）。
//
// 数据源是**已在盘上的事件流**，不是另建一张表：Adelie 的会话目录本来就存着全量事件，
// 每轮的用量写在 `stopped` 事件的 `tokenUsage` 里、模型写在 `task_started` 的 `model` 里。
// 先读事件流现算，代价是每次查询要扫一遍会话目录；好处是**没有第二份真相** ——
// 落库那一份迟早会和事件流对不上，而那时候没人知道该信谁。量真的大了再落库（见
// docs/issues/web-usage-cost-center.md 的三期）。
//
// 这一层是纯函数：输入事件数组 + 会话身份，输出报表。运行时的时钟与日期不是它的事，
// 由调用方把 `now` 与 `from/to` 传进来 —— 否则测试就得跟真实时间赛跑。

import { estimateCostUsd, ratesFor } from './rates.js';

import type { ModelRef } from '../types/ModelRef.js';
import type { StoredSessionEvent } from '../persistence/events.js';

/** 一次运行（一轮任务）的用量，从事件流派生出来 */
export interface UsageRun {
  sessionId: string;
  runId: string;
  /** 这一轮的模型从哪里来：优先 `task_started`，老会话退回会话头里的 model */
  provider: string;
  model: string;
  startedAt: number;
  endedAt: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /**
   * 命中 / 未命中前缀缓存的输入 token（响应没给这个数时是 `null`）。
   *
   * 单列出来是为了算钱：命中的那部分按 `cacheRead` 计价，与输入价能差四倍
   * （deepseek 0.07 对 0.27），把它按输入价算会系统性高估。`UsageTotals` 里不带它 ——
   * 报表看的是 token 总量，缓存只是它的一个分解。
   */
  cacheHitTokens: number | null;
  cacheMissTokens: number | null;
  /** 这一轮是怎么结束的。`unknown` = 没有 `stopped`（进程被杀、事件流断在半路） */
  status: UsageRunStatus;
  /** 这一轮没有价格（模型不在价目表里）；金额因此是「已知部分的下界」 */
  unpriced: boolean;
}

export type UsageRunStatus = 'completed' | 'error' | 'interrupted' | 'unknown';

/** 一个桶里的合计。`costUsd` 只累计**有价格**的那些轮 */
export interface UsageTotals {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  /** 桶里有几轮没价格 —— 界面必须能说出来，否则数字看起来像「只花了这么点」 */
  unpricedRuns: number;
}

export interface UsageReport {
  summary: { today: UsageTotals; last7d: UsageTotals; total: UsageTotals };
  byModel: Array<UsageTotals & { provider: string; model: string }>;
  bySession: Array<UsageTotals & { sessionId: string; lastActiveAt: number }>;
  /** 按**本地日期**分桶（`YYYY-MM-DD`），从早到晚 */
  series: Array<UsageTotals & { date: string }>;
  /** 扫了几个会话、几个会话读不动（删了一半、权限不足） */
  sessionsScanned: number;
  unreadableSessions: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function emptyTotals(): UsageTotals {
  return { runs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, unpricedRuns: 0 };
}

/**
 * 本地日期键。
 *
 * 用**服务器本地时区**而不是 UTC：问「今天花了多少」的人问的是他日历上的今天。
 * 代价是服务器搬家（换时区）会让分桶边界移动 —— 报表因此不承诺跨时区可比。
 */
export function dateKey(ts: number): string {
  const date = new Date(ts);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `stopped.stopReason.type` → 报表里的状态。运行时给的原因比报表需要的细，这里收窄 */
function statusOf(stopReason: unknown): UsageRunStatus {
  const type = (stopReason as { type?: unknown } | null | undefined)?.type;
  switch (type) {
    case 'task_completed':
      return 'completed';
    case 'error':
      return 'error';
    case 'user_interrupted':
    case 'max_iterations':
    case 'max_tool_calls':
    case 'timeout':
      return 'interrupted';
    default:
      return 'unknown';
  }
}

interface OpenRun {
  runId: string;
  provider: string;
  model: string;
  startedAt: number;
}

/**
 * 事件流 → 逐轮用量。
 *
 * 会话头里的 `model` 是兜底：老会话（0.1 建的）与「`task_started` 里没带模型」的那一轮
 * 只能靠它归属。两处都没有时按 `unknown/unknown` 记 —— 宁可在报表上看见「不知道哪家」，
 * 也不要把它算到别的模型头上。
 */
export function runsFromEvents(
  events: readonly StoredSessionEvent[],
  session: { sessionId: string; metaModel?: ModelRef | undefined },
): UsageRun[] {
  const runs: UsageRun[] = [];
  let open: OpenRun | null = null;

  for (const event of events) {
    if (event.type === 'task_started') {
      const payload = event.payload as { taskId?: unknown; model?: unknown };
      const model = isModelRef(payload.model) ? payload.model : session.metaModel;
      open = {
        runId: typeof payload.taskId === 'string' ? payload.taskId : `${session.sessionId}-${event.seq}`,
        provider: model?.provider ?? 'unknown',
        model: model?.model ?? 'unknown',
        startedAt: event.ts,
      };
      continue;
    }

    if (event.type !== 'stopped') continue;

    const payload = event.payload as { tokenUsage?: unknown; stopReason?: unknown };
    const usage = payload.tokenUsage as
      | { promptTokens?: unknown; completionTokens?: unknown; totalTokens?: unknown; cacheHitTokens?: unknown; cacheMissTokens?: unknown }
      | undefined;
    const promptTokens = numberOf(usage?.promptTokens);
    const completionTokens = numberOf(usage?.completionTokens);
    const started = open ?? {
      runId: `${session.sessionId}-${event.seq}`,
      provider: session.metaModel?.provider ?? 'unknown',
      model: session.metaModel?.model ?? 'unknown',
      startedAt: event.ts,
    };

    runs.push({
      sessionId: session.sessionId,
      runId: started.runId,
      provider: started.provider,
      model: started.model,
      startedAt: started.startedAt,
      endedAt: event.ts,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      totalTokens: numberOf(usage?.totalTokens) || promptTokens + completionTokens,
      cacheHitTokens: numberOfOrNull(usage?.cacheHitTokens),
      cacheMissTokens: numberOfOrNull(usage?.cacheMissTokens),
      status: statusOf(payload.stopReason),
      unpriced: ratesFor(started.provider, started.model) === null,
    });
    open = null;
  }

  return runs;
}

/** 一次运行的钱（未定价的返回 null）。查一次价目表，别每轮都查 */
export function costOfRun(run: UsageRun): number | null {
  const rates = ratesFor(run.provider, run.model);
  if (rates === null) return null;
  return estimateCostUsd(
    {
      promptTokens: run.inputTokens,
      completionTokens: run.outputTokens,
      totalTokens: run.totalTokens,
      // 缓存字段整段带上：`cacheHitTokens` 是「确实命中」的计数（0 与「不知道」不同），
      // 两个都缺时成本按输入价算 —— 与 rates.ts 的口径一致
      ...(run.cacheHitTokens === null ? {} : { cacheHitTokens: run.cacheHitTokens }),
      ...(run.cacheMissTokens === null ? {} : { cacheMissTokens: run.cacheMissTokens }),
    },
    rates,
  );
}

function addRun(totals: UsageTotals, run: UsageRun, cost: number | null): void {
  totals.runs += 1;
  totals.inputTokens += run.inputTokens;
  totals.outputTokens += run.outputTokens;
  totals.totalTokens += run.totalTokens;
  if (cost === null) {
    totals.unpricedRuns += 1;
    return;
  }
  // 只抹浮点尾巴，不在累加过程中四舍五入：一次运行省下的一厘钱乘几千轮就是一块钱
  totals.costUsd += cost;
}

function round<T extends UsageTotals>(totals: T): T {
  return { ...totals, costUsd: Math.round(totals.costUsd * 1_000_000) / 1_000_000 };
}

export interface AggregateOptions {
  /** 「今天 / 最近 7 天」的分界。运行时必须给 —— 报表不读系统时钟 */
  now: number;
  /** 只要这段时间里的运行（闭区间，毫秒）。省略 = 全部 */
  from?: number;
  to?: number;
}

export function aggregateUsage(
  runs: readonly UsageRun[],
  options: AggregateOptions,
  context: { sessionsScanned: number; unreadableSessions: number },
): UsageReport {
  const { now, from, to } = options;
  const inRange = runs.filter(
    (run) =>
      (from === undefined || run.endedAt >= from) && (to === undefined || run.endedAt <= to),
  );

  const todayKey = dateKey(now);
  const weekStart = now - 7 * DAY_MS;

  const summary = { today: emptyTotals(), last7d: emptyTotals(), total: emptyTotals() };
  const byModel = new Map<string, UsageTotals & { provider: string; model: string }>();
  const bySession = new Map<string, UsageTotals & { sessionId: string; lastActiveAt: number }>();
  const series = new Map<string, UsageTotals & { date: string }>();

  for (const run of inRange) {
    const cost = costOfRun(run);

    addRun(summary.total, run, cost);
    if (run.endedAt >= weekStart) addRun(summary.last7d, run, cost);
    if (dateKey(run.endedAt) === todayKey) addRun(summary.today, run, cost);

    const modelKey = `${run.provider}/${run.model}`;
    let modelBucket = byModel.get(modelKey);
    if (modelBucket === undefined) {
      modelBucket = { provider: run.provider, model: run.model, ...emptyTotals() };
      byModel.set(modelKey, modelBucket);
    }
    addRun(modelBucket, run, cost);

    let sessionBucket = bySession.get(run.sessionId);
    if (sessionBucket === undefined) {
      sessionBucket = { sessionId: run.sessionId, lastActiveAt: 0, ...emptyTotals() };
      bySession.set(run.sessionId, sessionBucket);
    }
    sessionBucket.lastActiveAt = Math.max(sessionBucket.lastActiveAt, run.endedAt);
    addRun(sessionBucket, run, cost);

    const key = dateKey(run.endedAt);
    let dayBucket = series.get(key);
    if (dayBucket === undefined) {
      dayBucket = { date: key, ...emptyTotals() };
      series.set(key, dayBucket);
    }
    addRun(dayBucket, run, cost);
  }

  // 排序都在服务端定一次，界面照显示：钱多的在前；日期那组按时间升序（折线要时序）
  const byCost = (a: UsageTotals, b: UsageTotals): number =>
    b.costUsd - a.costUsd || b.totalTokens - a.totalTokens;

  return {
    summary: { today: round(summary.today), last7d: round(summary.last7d), total: round(summary.total) },
    byModel: [...byModel.values()].sort(byCost).map(round),
    bySession: [...bySession.values()].sort(byCost).map(round),
    series: [...series.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map(round),
    sessionsScanned: context.sessionsScanned,
    unreadableSessions: context.unreadableSessions,
  };
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 与 `numberOf` 不同：**0 与「不知道」不能混同**。
 *
 * 缓存命中数是「0 = 一次都没命中」与「null = 这家没报这个数」两件事，混同之后
 * 「缓存一点没命中」与「缓存信息拿不到」在报表上长得一模一样，而它们的成本算得不一样。
 */
function numberOfOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** 事件里的模型是 wire 上的数据（`unknown`）：只认长得像 `{ provider, model }` 的那些 */
function isModelRef(value: unknown): value is ModelRef {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as { provider?: unknown; model?: unknown };
  return typeof ref.provider === 'string' && typeof ref.model === 'string';
}
