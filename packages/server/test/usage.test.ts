// 用量与成本：`GET /api/usage`（契约 §2）背后的账要能对得上。
//
// 这些用例的立场是「报表是派生视图」：每一条都**先跑一轮真的对话**（假 provider 报出
// 用量、运行时写进事件流），再看报表说的和事件流里的事实是否一致 —— 而不是拿一个
// 手写的报表去比对另一个手写的报表。
//
// 每个用例一份全新的 harness：报表是**全量聚合**的，共用一个服务就等于共用一本账，
// 前一条用例的 token 会跑到后一条的合计里。
import { beforeEach, describe, expect, it } from 'vitest';

import { SessionStore } from 'adelie-core';

import { locationOptions } from '../src/sessions.js';
import { createSession, startHarness, type Harness } from './harness.js';
import { consumeSse } from './sse-client.js';

import type { ModelDecision, TokenUsage } from 'adelie-core';

/** 一轮就走完的对话：一个 Final 决策，provider 只被问一次 */
const FINAL: ModelDecision = { type: 'Final', answer: '完成' };

interface Totals {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  unpricedRuns: number;
}

interface UsageBody {
  summary: { today: Totals; last7d: Totals; total: Totals };
  byModel: Array<Totals & { provider: string; model: string }>;
  bySession: Array<Totals & { sessionId: string; lastActiveAt: number }>;
  series: Array<Totals & { date: string }>;
  sessionsScanned: number;
  unreadableSessions: number;
  now: number;
}

/** 用某个身份跑一轮对话，并等流真的结束（不是等响应头） */
async function runTurn(
  harness: Harness,
  sessionId: string,
  usage: TokenUsage,
  init?: RequestInit,
): Promise<void> {
  harness.scriptWithUsage(usage, FINAL);
  const res = await harness.post(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, { text: '随便做点什么' }, init);
  expect(res.status).toBe(200);
  await consumeSse(res, () => undefined);
}

function getUsage(harness: Harness, query = '', init?: RequestInit): Promise<UsageBody> {
  return fetch(`${harness.base}/api/usage${query}`, init).then(async (res) => {
    expect(res.status).toBe(200);
    return res.json() as Promise<UsageBody>;
  });
}

/** 界面上逐轮算钱用的那张价目表（与服务端同源：GET /api/models） */
async function ratesOf(harness: Harness, provider: string, model: string): Promise<{ input: number; output: number } | null> {
  const body = (await fetch(`${harness.base}/api/models`).then((res) => res.json())) as {
    groups: Array<{ id: string; models: Array<{ id: string; rates?: { input: number; output: number } }> }>;
  };
  const found = body.groups.find((group) => group.id === provider)?.models.find((item) => item.id === model);
  return found?.rates ?? null;
}

/** 一轮只报一次用量：输入 1000 / 输出 500 */
const USAGE: TokenUsage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };

describe('GET /api/usage', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness();
  });

  it('汇总、按模型、按会话、按天四个视图都说同一件事', async () => {
    const sessionId = await createSession(harness);
    await runTurn(harness, sessionId, USAGE);

    const body = await getUsage(harness);

    // token 的说法：报表里每一处都等于事件流里的那一轮
    const store = new SessionStore(harness.workspace, sessionId, locationOptions(harness.sessionsRoot));
    const stopped = store.readEvents().filter((event) => event.type === 'stopped');
    expect(stopped).toHaveLength(1);
    expect((stopped[0]!.payload as { tokenUsage: TokenUsage }).tokenUsage.totalTokens).toBe(1500);

    const expected: Totals = {
      runs: 1,
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      // 钱按服务端公示的价目表现算 —— 报表与价目表必须自洽
      costUsd: 0,
      unpricedRuns: 0,
    };
    const rates = await ratesOf(harness, 'deepseek', 'deepseek-chat');
    expect(rates).not.toBeNull();
    expected.costUsd = Math.round(((1000 * rates!.input + 500 * rates!.output) / 1_000_000) * 1_000_000) / 1_000_000;

    // 「今天」与「最近 7 天」都装得下刚跑的这一轮
    expect(body.summary.today).toEqual(expected);
    expect(body.summary.last7d).toEqual(expected);
    expect(body.summary.total).toEqual(expected);

    // 按模型：这一轮的模型来自 task_started（deepseek-chat），不是会话头
    expect(body.byModel).toEqual([{ provider: 'deepseek', model: 'deepseek-chat', ...expected }]);

    // 按会话：能指回是哪条会话，且带着最后一次活动时间
    expect(body.bySession).toHaveLength(1);
    expect(body.bySession[0]!.sessionId).toBe(sessionId);
    expect(body.bySession[0]!.totalTokens).toBe(1500);
    expect(body.bySession[0]!.lastActiveAt).toBeGreaterThan(0);

    // 按天：就一个桶，时间戳落在服务端说的「今天」里
    expect(body.series).toHaveLength(1);
    expect(body.series[0]!.totalTokens).toBe(1500);
    expect(Date.parse(`${body.series[0]!.date}T00:00:00`)).toBeLessThanOrEqual(body.now);

    expect(body.sessionsScanned).toBe(1);
    expect(body.unreadableSessions).toBe(0);
  });

  it('多轮累加：一条会话跑两轮，合计是两轮之和', async () => {
    const sessionId = await createSession(harness);
    await runTurn(harness, sessionId, USAGE);
    await runTurn(harness, sessionId, USAGE);

    const body = await getUsage(harness);

    expect(body.summary.total.runs).toBe(2);
    expect(body.summary.total.totalTokens).toBe(3000);
    expect(body.summary.total.inputTokens).toBe(2000);
    expect(body.summary.total.outputTokens).toBe(1000);
    expect(body.bySession[0]!.runs).toBe(2);
  });

  it('价目表里没有的模型：token 照记，钱留空并数出「未定价几轮」', async () => {
    // `deepseek-flash` 不在官方目录的价目表里（见 core 的 model-catalog）——
    // 没人公布价就留空，绝不编一个数字
    const patched = await fetch(`${harness.base}/api/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: { provider: 'deepseek', model: 'deepseek-flash' } }),
    });
    expect(patched.status).toBe(200);

    const sessionId = await createSession(harness);
    await runTurn(harness, sessionId, USAGE);

    const body = await getUsage(harness);

    expect(body.summary.total.totalTokens).toBe(1500);
    expect(body.summary.total.costUsd).toBe(0);
    expect(body.summary.total.unpricedRuns).toBe(1);
    expect(body.byModel[0]!.model).toBe('deepseek-flash');
    expect(body.byModel[0]!.unpricedRuns).toBe(1);
    // 界面上要能说出「这条没价」—— GET /api/models 里它确实没有 rates
    expect(await ratesOf(harness, 'deepseek', 'deepseek-flash')).toBeNull();
  });

  it('from / to 收窄口径：窗口外的一轮不进任何桶', async () => {
    const sessionId = await createSession(harness);
    await runTurn(harness, sessionId, USAGE);

    const future = await getUsage(harness, `?from=${Date.now() + 3_600_000}`);
    expect(future.summary.total.runs).toBe(0);
    expect(future.summary.today.runs).toBe(0);
    expect(future.series).toEqual([]);
    // 扫过几条会话照报：报表空不等于「没扫」
    expect(future.sessionsScanned).toBe(1);

    // 起点放到过去：窗口装得下这一轮
    const wide = await getUsage(harness, '?from=0');
    expect(wide.summary.total.totalTokens).toBe(1500);

    // ISO 时间串也认（浏览器里复制时间戳与手写链接两种写法都常见）
    const iso = await getUsage(harness, `?from=${encodeURIComponent(new Date(Date.now() - 3_600_000).toISOString())}`);
    expect(iso.summary.total.totalTokens).toBe(1500);
  });

  it('from / to 认不出来回 400，不让它悄悄变成「不限」或「现在」', async () => {
    const bad = await fetch(`${harness.base}/api/usage?from=yesterday`);
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe('bad_request');

    const reversed = await fetch(`${harness.base}/api/usage?from=2000&to=1000`);
    expect(reversed.status).toBe(400);
  });

  it('别人的账看不见：默认只算自己的，管理员要用 scope=all', async () => {
    await harness.createUser('alice', 'alice-pw');
    const aliceCookie = await harness.login('alice', 'alice-pw');

    // alice 建一条会话并跑一轮（带她的 Cookie）
    const created = await fetch(`${harness.base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({}),
    });
    expect(created.status).toBe(201);
    const aliceSession = ((await created.json()) as { session: { id: string } }).session.id;
    await runTurn(harness, aliceSession, USAGE, { headers: { Cookie: aliceCookie } });

    // 本机管理员默认也只看到自己的账（与 /api/sessions 同一条规矩）
    const host = await getUsage(harness);
    expect(host.bySession.some((row) => row.sessionId === aliceSession)).toBe(false);
    expect(host.summary.total.runs).toBe(0);

    // 管理员可以显式要全部
    const all = await getUsage(harness, '?scope=all');
    expect(all.bySession.some((row) => row.sessionId === aliceSession)).toBe(true);

    // alice 看自己的：就那一条，且 `scope=all` 对她只是被忽略（不是报错）
    const her = await getUsage(harness, '?scope=all', { headers: { Cookie: aliceCookie } });
    expect(her.bySession).toHaveLength(1);
    expect(her.bySession[0]!.sessionId).toBe(aliceSession);
  });
});
