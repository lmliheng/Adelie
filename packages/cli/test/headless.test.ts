// src/test/cli/headless.test.ts
//
// 覆盖 headless（CI）形态的两件产物：退出码依据与结构化结果。
//
// 这两样都要能被脚本信任，所以判定规则写在纯函数里、不依赖终端与真实模型：
// 「什么算这次运行成功」一旦含糊，CI 分流的结论就是错的。
//
// 判据只有一条：停止原因是不是「任务完成」。运行时不再有验收子系统替模型判有没有做完
// （计划与验收都归模型自己维护），所以这里也没有 verification 这类第二份结论要断言。

import { describe, it, expect } from 'vitest';

import { buildHeadlessResult, isRunSuccessful } from '../src/cli.js';
import type { AgentRunState, StopReason } from 'adelie-core';

function stateWith(stopReason: StopReason | undefined): AgentRunState {
  return {
    taskId: 'task-1',
    taskDescription: '把天气写成 results/weather.md',
    decisions: [],
    observations: [],
    toolCallCount: 2,
    iterationCount: 3,
    startTime: 0,
    fileChanges: [],
    approvals: [],
    tokenUsage: {
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      cacheHitTokens: null,
      cacheMissTokens: null,
      complete: true,
      cacheComplete: true,
    },
    contextSize: { tokens: 100, source: 'measured' },
    ...(stopReason !== undefined ? { stopReason } : {}),
  };
}

describe('headless 退出码依据', () => {
  it('停止原因是「任务完成」-> 成功', () => {
    expect(isRunSuccessful(stateWith({ type: 'task_completed' }))).toBe(true);
  });

  it('没跑完一律失败', () => {
    const reasons: StopReason[] = [
      { type: 'max_iterations', limit: 50 },
      { type: 'max_tool_calls', limit: 100 },
      { type: 'max_tokens', limit: 1000 },
      { type: 'max_file_changes', limit: 20 },
      { type: 'timeout', durationMs: 1000 },
      { type: 'no_progress', tool: 'run_command', repeats: 3 },
      { type: 'user_interrupted' },
      { type: 'error', message: '炸了' },
    ];

    for (const reason of reasons) {
      expect(isRunSuccessful(stateWith(reason))).toBe(false);
    }
    // 连停止原因都没记下时不能冒充成功
    expect(isRunSuccessful(stateWith(undefined))).toBe(false);
  });
});

describe('headless 结构化结果', () => {
  it('字段与 state 同构，并补上 ok / task / answer', () => {
    const result = buildHeadlessResult({
      task: '写天气',
      sessionId: '20260928-000000-aaaaaa',
      state: stateWith({ type: 'task_completed' }),
      answer: '写好了',
      persistence: { degraded: false, error: null },
    });

    expect(result.ok).toBe(true);
    expect(result.task).toBe('写天气');
    expect(result.sessionId).toBe('20260928-000000-aaaaaa');
    expect(result.stopReason).toEqual({ type: 'task_completed' });
    expect(result.toolCalls).toBe(2);
    expect(result.tokenUsage).toMatchObject({ totalTokens: 120 });
    expect(result.answer).toBe('写好了');
    expect(result.persistence).toEqual({ degraded: false, error: null });
    // 验收子系统已删：产物里不再有 verification 这一项（调用方也不该再读它）
    expect(Object.keys(result)).not.toContain('verification');
  });

  it('缺的字段给 null 而不是省略，字段集稳定', () => {
    const result = buildHeadlessResult({
      task: '什么都没干',
      sessionId: 's',
      state: stateWith(undefined),
      answer: undefined,
      persistence: { degraded: true, error: '磁盘满了' },
    });

    expect(result.stopReason).toBeNull();
    expect(result.answer).toBeNull();
    expect(result.ok).toBe(false);
    expect(Object.keys(result)).toEqual([
      'task', 'sessionId', 'ok', 'stopReason', 'decisions', 'toolCalls',
      'tokenUsage', 'contextSize', 'approvals', 'answer', 'persistence',
    ]);
  });

  it('序列化后是单行 JSON（调用方按行读）', () => {
    const line = JSON.stringify(buildHeadlessResult({
      task: '写天气',
      sessionId: 's',
      // 没记停止原因 => 不算完成，ok 为 false
      state: stateWith(undefined),
      answer: '完成',
      persistence: { degraded: false, error: null },
    }));

    expect(line).not.toContain('\n');
    expect(JSON.parse(line).ok).toBe(false);
  });
});
