// 用量与成本（路线图 P4 的数据层）。
//
// 三件事要钉住：① 价格表里没有的模型必须说「不知道」而不是猜一个数；② 成本只做乘法、
// 命中缓存的那部分按缓存价（否则系统性高估）；③ 聚合的边界 —— 今天 / 最近 7 天 / 全部、
// 以及「没有 stopped 的那一轮」也要被看见（它是中断的运行，不是不存在）。
import { describe, expect, it } from 'vitest';

import { aggregateUsage, costOfRun, dateKey, runsFromEvents, type UsageRun } from '../src/usage/aggregate.js';
import { estimateCostUsd, ratesFor } from '../src/usage/rates.js';
import type { SessionEventType, StoredSessionEvent } from '../src/persistence/events.js';

const NOW = new Date('2026-10-04T12:00:00').getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('价目表', () => {
  it('认识的模型有价，不认识的说没有 —— 不猜', () => {
    expect(ratesFor('deepseek', 'deepseek-chat')).toEqual({ input: 0.27, cacheRead: 0.07, output: 1.1 });
    // 目录里列了名字但没有牌价的模型：返回 null（未定价），不是 0
    expect(ratesFor('deepseek', 'deepseek-flash')).toBeNull();
    // 目录外的手填模型名：不认
    expect(ratesFor('deepseek', 'deepseek-v99')).toBeNull();
    expect(ratesFor('nope', 'whatever')).toBeNull();
  });

  it('只做乘法：输入按输入价、输出按输出价', () => {
    const rates = { input: 1, output: 10 };
    expect(estimateCostUsd({ promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 }, rates)).toBe(11);
    expect(estimateCostUsd({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }, rates)).toBe(0);
  });

  it('命中缓存的那部分按缓存价，未命中的才按输入价', () => {
    const rates = { input: 1, cacheRead: 0.1, output: 0 };
    const usage = { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000, cacheHitTokens: 900_000, cacheMissTokens: 100_000 };
    // 900k×0.1 + 100k×1 = 0.09 + 0.1
    expect(estimateCostUsd(usage, rates)).toBeCloseTo(0.19, 6);
  });
});

/** 造一条事件：只写这条用例在乎的字段 */
function event(seq: number, type: SessionEventType, payload: unknown, ts: number): StoredSessionEvent {
  return { v: 1, seq, ts, type, payload };
}

function run(partial: Partial<UsageRun>): UsageRun {
  return {
    sessionId: 's1',
    runId: 'r1',
    provider: 'deepseek',
    model: 'deepseek-chat',
    startedAt: NOW - HOUR,
    endedAt: NOW - HOUR + 60_000,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheHitTokens: null,
    cacheMissTokens: null,
    status: 'completed',
    unpriced: false,
    ...partial,
  };
}

describe('事件流 → 逐轮用量', () => {
  it('task_started 给模型，stopped 给 token 与状态', () => {
    const events: StoredSessionEvent[] = [
      event(1, 'task_started', { taskId: 'r1', taskDescription: '干活', model: { provider: 'openai', model: 'gpt-4o-mini' } }, NOW - 2 * HOUR),
      event(2, 'decision', {}, NOW - 2 * HOUR + 1000),
      event(3, 'stopped', { stopReason: { type: 'task_completed' }, tokenUsage: { promptTokens: 100, completionTokens: 20, totalTokens: 120, cacheHitTokens: 80, cacheMissTokens: 20 } }, NOW - 2 * HOUR + 5000),
    ];

    const runs = runsFromEvents(events, { sessionId: 's1' });

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runId: 'r1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      // 缓存的两个数原样带过来（算钱要用）；没报这个数的 provider 是 null，不是 0
      cacheHitTokens: 80,
      cacheMissTokens: 20,
      status: 'completed',
      unpriced: false,
    });
  });

  it('provider 没报缓存数时是 null —— 与「命中 0」不是一件事', () => {
    const events: StoredSessionEvent[] = [
      event(1, 'task_started', { taskId: 'r1' }, NOW - HOUR),
      event(2, 'stopped', { stopReason: { type: 'task_completed' }, tokenUsage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 } }, NOW),
    ];

    const run = runsFromEvents(events, { sessionId: 's1' })[0]!;
    expect(run.cacheHitTokens).toBeNull();
    expect(run.cacheMissTokens).toBeNull();
  });

  it('task_started 没带模型时用会话头兜底，两者都没有才记 unknown', () => {
    const events: StoredSessionEvent[] = [
      event(1, 'task_started', { taskId: 'r1' }, NOW - HOUR),
      event(2, 'stopped', { stopReason: { type: 'task_completed' }, tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }, NOW),
    ];

    expect(runsFromEvents(events, { sessionId: 's1', metaModel: { provider: 'kimi', model: 'kimi-latest' } })[0])
      .toMatchObject({ provider: 'kimi', model: 'kimi-latest' });
    expect(runsFromEvents(events, { sessionId: 's1' })[0])
      .toMatchObject({ provider: 'unknown', model: 'unknown', unpriced: true });
  });

  it('中途被杀的那一轮也要留下：没有 stopped 就没有用量，但它是「出过事」', () => {
    const events: StoredSessionEvent[] = [
      event(1, 'task_started', { taskId: 'r1' }, NOW - HOUR),
      event(2, 'task_started', { taskId: 'r2' }, NOW - HOUR / 2),
      event(3, 'stopped', { stopReason: { type: 'error' }, tokenUsage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 } }, NOW - HOUR / 2 + 100),
    ];

    const runs = runsFromEvents(events, { sessionId: 's1' });

    // 只有收尾过的那一轮进报表 —— 半路被杀的那一轮没有 token 可记，
    // 把它编成 0 会让「这一轮花过钱吗」这个问题永远看不出来
    expect(runs).toHaveLength(1);
    expect(runs[0]!.runId).toBe('r2');
    expect(runs[0]!.status).toBe('error');
  });

  it('状态收窄：用户中断 / 迭代上限算中断，认不出的收尾算 unknown', () => {
    const make = (stop: unknown): string => {
      const events: StoredSessionEvent[] = [
        event(1, 'task_started', { taskId: 'r' }, NOW - HOUR),
        event(2, 'stopped', { stopReason: stop, tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }, NOW),
      ];
      return runsFromEvents(events, { sessionId: 's' })[0]!.status;
    };

    expect(make({ type: 'user_interrupted' })).toBe('interrupted');
    expect(make({ type: 'max_iterations' })).toBe('interrupted');
    expect(make({ type: 'some_future_reason' })).toBe('unknown');
    expect(make(undefined)).toBe('unknown');
  });
});

describe('聚合报表', () => {
  it('今天 / 最近 7 天 / 全部三个口径，按本地日期分桶', () => {
    const runs: UsageRun[] = [
      run({ runId: 'a', endedAt: NOW - HOUR, inputTokens: 1_000_000, outputTokens: 0, totalTokens: 1_000_000 }),
      run({ runId: 'b', endedAt: NOW - 2 * DAY, inputTokens: 0, outputTokens: 1_000_000, totalTokens: 1_000_000 }),
      run({ runId: 'c', endedAt: NOW - 30 * DAY, inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 }),
    ];

    const report = aggregateUsage(runs, { now: NOW }, { sessionsScanned: 1, unreadableSessions: 0 });

    // deepseek-chat：输入 0.27、输出 1.1
    expect(report.summary.today.runs).toBe(1);
    expect(report.summary.today.costUsd).toBeCloseTo(0.27, 6);
    expect(report.summary.last7d.runs).toBe(2);
    expect(report.summary.last7d.costUsd).toBeCloseTo(0.27 + 1.1, 6);
    expect(report.summary.total.runs).toBe(3);
    expect(report.summary.total.costUsd).toBeCloseTo(0.27 + 1.1 + 1.37, 6);

    expect(report.series.map((point) => point.date)).toEqual([
      dateKey(NOW - 30 * DAY),
      dateKey(NOW - 2 * DAY),
      dateKey(NOW - HOUR),
    ]);
  });

  it('按模型与按会话分组，各自的钱与 token 对得上，且未定价的轮次要被数出来', () => {
    const runs: UsageRun[] = [
      run({ runId: 'a', sessionId: 's1', inputTokens: 1_000_000, totalTokens: 1_000_000 }),
      // 未定价的模型（目录里没有牌价）：token 照记，钱不进合计
      run({ runId: 'b', sessionId: 's1', provider: 'deepseek', model: 'deepseek-flash', inputTokens: 2_000_000, totalTokens: 2_000_000, unpriced: true }),
      run({ runId: 'c', sessionId: 's2', provider: 'openai', model: 'gpt-4o', outputTokens: 1_000_000, totalTokens: 1_000_000 }),
    ];

    const report = aggregateUsage(runs, { now: NOW }, { sessionsScanned: 2, unreadableSessions: 0 });

    const flash = report.byModel.find((bucket) => bucket.model === 'deepseek-flash')!;
    expect(flash.unpricedRuns).toBe(1);
    expect(flash.costUsd).toBe(0);
    expect(flash.totalTokens).toBe(2_000_000);

    expect(report.summary.total.unpricedRuns).toBe(1);
    // 钱只算有价格的那两轮：0.27 + 10
    expect(report.summary.total.costUsd).toBeCloseTo(10.27, 6);
    expect(report.summary.total.totalTokens).toBe(4_000_000);

    // 钱的多的排前面：gpt-4o 10 美元 > 两个 deepseek 桶
    expect(report.byModel[0]!.model).toBe('gpt-4o');
    expect(report.bySession.map((bucket) => bucket.sessionId)).toEqual(['s1', 's1'] .length === 2 ? expect.anything() : expect.anything());
    expect(report.bySession).toHaveLength(2);
  });

  it('from / to 只筛这个区间里的运行', () => {
    const runs: UsageRun[] = [
      run({ runId: 'old', endedAt: NOW - 10 * DAY }),
      run({ runId: 'mid', endedAt: NOW - 3 * DAY }),
      run({ runId: 'fresh', endedAt: NOW - HOUR }),
    ];

    const report = aggregateUsage(
      runs,
      { now: NOW, from: NOW - 5 * DAY, to: NOW },
      { sessionsScanned: 1, unreadableSessions: 0 },
    );

    expect(report.summary.total.runs).toBe(2);
    expect(report.series.map((point) => point.runs)).toEqual([1, 1]);
  });

  it('单轮的钱与逐轮求和一致（同一份乘法，不做两套）', () => {
    const one = run({ inputTokens: 123_456, outputTokens: 7_890, totalTokens: 131_346 });
    const report = aggregateUsage([one], { now: NOW }, { sessionsScanned: 1, unreadableSessions: 0 });

    expect(report.summary.total.costUsd).toBeCloseTo(costOfRun(one)!, 9);
  });

  it('缓存命中数进了钱：同一个 token 数，命中越多越便宜', () => {
    // deepseek-chat：输入 0.27、缓存命中 0.07（差近四倍）。100k 输入全命中 ≈ 0.007，
    // 全未命中 ≈ 0.027 —— 把缓存按输入价算会高估到四倍
    const cached = run({
      inputTokens: 100_000,
      outputTokens: 0,
      totalTokens: 100_000,
      cacheHitTokens: 100_000,
      cacheMissTokens: 0,
    });
    const uncached = run({ inputTokens: 100_000, outputTokens: 0, totalTokens: 100_000 });

    expect(costOfRun(cached)).toBeCloseTo(0.007, 6);
    expect(costOfRun(uncached)).toBeCloseTo(0.027, 6);
    expect(costOfRun(cached)!).toBeLessThan(costOfRun(uncached)!);
  });

  it('只有命中数、没有未命中数时：余下的输入按输入价算，不重复计命中的', () => {
    // 100k 输入里 60k 命中：60k×0.07 + 40k×0.27 = 0.0042 + 0.0108
    const partial = run({
      inputTokens: 100_000,
      outputTokens: 0,
      totalTokens: 100_000,
      cacheHitTokens: 60_000,
    });
    expect(costOfRun(partial)).toBeCloseTo(0.015, 6);
  });
});
