// src/lib/timeline.test.ts
//
// 事件 → 时间线的映射是「历史回放」与「实时流」共用的唯一路径，
// 所以它必须是纯的、对坏数据免疫的（wire 上是 unknown），并且不丢事件。

import { describe, expect, it } from 'vitest'
import { mapEventsToTimeline, summarizeData, summarizeToolCall, truncateMiddle } from './timeline'
import type { SessionEventLike } from '../api/types'

function action(tool: string, params: Record<string, unknown>, thought = ''): SessionEventLike {
  return {
    type: 'decision',
    ts: 1000,
    payload: { decision: { type: 'Action', tool, params, thought } },
  }
}

function observation(tool: string, result: Record<string, unknown>, extra: Record<string, unknown> = {}): SessionEventLike {
  return {
    type: 'observation',
    ts: 1100,
    payload: { observation: { action: { type: 'Action', tool, params: {} }, result, timestamp: 1100, ...extra } },
  }
}

describe('mapEventsToTimeline：工具调用与结果合成一张卡', () => {
  it('Action 紧接着 Observation → 一条 status=ok 的条目', () => {
    const view = mapEventsToTimeline([
      action('read_file', { path: 'src/app.ts', startLine: 1, endLine: 40 }, '先看看入口'),
      observation('read_file', { success: true, data: 'export function app() {}', display: 'src/app.ts 第 1–40 行 / 共 320 行' }),
    ])

    expect(view.entries).toHaveLength(1)
    const entry = view.entries[0]
    expect(entry?.kind).toBe('tool')
    if (entry?.kind !== 'tool') throw new Error('应该是工具条目')
    expect(entry.tool).toBe('read_file')
    expect(entry.label).toBe('读取文件')
    expect(entry.callSummary).toBe('src/app.ts · 第 1–40 行')
    expect(entry.status).toBe('ok')
    expect(entry.resultSummary).toBe('src/app.ts 第 1–40 行 / 共 320 行')
    expect(entry.thought).toBe('先看看入口')
  })

  it('失败的观察 → status=failed，摘要取错误信息', () => {
    const view = mapEventsToTimeline([
      action('run_command', { command: 'pnpm test' }),
      observation('run_command', { success: false, data: null, error: 'exit code 1: 3 tests failed' }),
    ])
    const entry = view.entries[0]
    if (entry?.kind !== 'tool') throw new Error('应该是工具条目')
    expect(entry.status).toBe('failed')
    expect(entry.resultSummary).toContain('3 tests failed')
    expect(entry.resultDetail).toContain('错误：exit code 1')
  })

  it('还没有结果的调用是 pending（正跑着的那一步）', () => {
    const view = mapEventsToTimeline([action('run_command', { command: 'pnpm build' })])
    const entry = view.entries[0]
    if (entry?.kind !== 'tool') throw new Error('应该是工具条目')
    expect(entry.status).toBe('pending')
    expect(entry.resultSummary).toBe('（无输出）')
  })

  it('批量动作按顺序与观察一一配对，并标出并行数', () => {
    const view = mapEventsToTimeline([
      {
        type: 'decision',
        ts: 1,
        payload: {
          decision: {
            type: 'BatchAction',
            actions: [
              { tool: 'read_file', params: { path: 'a.ts' } },
              { tool: 'read_file', params: { path: 'b.ts' } },
            ],
          },
        },
      },
      observation('read_file', { success: true, data: 'aaa' }),
      observation('read_file', { success: false, data: null, error: 'ENOENT' }),
    ])

    expect(view.entries).toHaveLength(2)
    const [first, second] = view.entries
    if (first?.kind !== 'tool' || second?.kind !== 'tool') throw new Error('应该是两条工具条目')
    expect(first.callSummary).toBe('a.ts')
    expect(first.status).toBe('ok')
    expect(first.batchSize).toBe(2)
    expect(second.callSummary).toBe('b.ts')
    expect(second.status).toBe('failed')
  })

  it('截断信息从 delivery 带出来（原始字符数 vs 送达字符数）', () => {
    const view = mapEventsToTimeline([
      action('read_file', { path: 'big.log' }),
      observation(
        'read_file',
        { success: true, data: 'x'.repeat(5000) },
        { delivery: { rawChars: 5000, deliveredChars: 800, truncated: true, fullOutputPath: '/tmp/full.txt' } },
      ),
    ])
    const entry = view.entries[0]
    if (entry?.kind !== 'tool') throw new Error('应该是工具条目')
    expect(entry.truncated).toBe(true)
    expect(entry.delivery).toEqual({ rawChars: 5000, deliveredChars: 800 })
  })
})

describe('mapEventsToTimeline：计划 / 验收 / 审批 / 其它事件', () => {
  const plan = (version: number, status: string): SessionEventLike => ({
    type: 'plan_updated',
    ts: version * 10,
    payload: {
      plan: {
        originalGoal: '把 README 的错别字改掉',
        version,
        currentStepIndex: 0,
        steps: [
          { id: 's1', description: '找错别字', status },
          { id: 's2', description: '改掉', status: 'pending' },
        ],
        deliverables: [{ path: 'README.md' }],
      },
    },
  })

  it('计划版本保留每一版，只有最后一版不是 superseded', () => {
    const view = mapEventsToTimeline([plan(1, 'in_progress'), plan(2, 'completed')])
    const plans = view.entries.filter((entry) => entry.kind === 'plan')
    expect(plans).toHaveLength(2)
    if (plans[0]?.kind !== 'plan' || plans[1]?.kind !== 'plan') throw new Error('应该是计划条目')
    expect(plans[0].superseded).toBe(true)
    expect(plans[1].superseded).toBe(false)
    expect(plans[1].steps[0]?.status).toBe('completed')
    expect(plans[1].deliverables).toEqual(['README.md'])
    expect(view.plan?.version).toBe(2)
  })

  it('Replan 决策也进时间线，并带上原因', () => {
    const view = mapEventsToTimeline([
      {
        type: 'decision',
        ts: 5,
        payload: {
          decision: {
            type: 'Replan',
            reason: '原计划漏了测试',
            newPlan: { originalGoal: 'g', version: 2, currentStepIndex: 0, steps: [{ id: 'a', description: '补测试', status: 'pending' }] },
          },
        },
      },
    ])
    const entry = view.entries[0]
    if (entry?.kind !== 'plan') throw new Error('应该是计划条目')
    expect(entry.reason).toBe('原计划漏了测试')
  })

  it('Final 决策成为 answer，且不产生时间线条目', () => {
    const view = mapEventsToTimeline([
      { type: 'decision', ts: 9, payload: { decision: { type: 'Final', answer: '改好了，共 3 处。' } } },
    ])
    expect(view.answer).toBe('改好了，共 3 处。')
    expect(view.entries).toHaveLength(0)
  })

  it('verification 保留分层结论与交付物断言（不让测试全绿盖住没产出）', () => {
    const view = mapEventsToTimeline([
      {
        type: 'verification',
        ts: 20,
        payload: {
          verification: {
            passed: false,
            verificationStatus: 'executed',
            testResults: { passed: 12, failed: 0, output: 'all green' },
            typeCheckPassed: true,
            typeCheckOutput: '',
            diffSummary: 'M README.md',
            completionCriteriaMet: false,
            details: '交付物 README.md 不存在',
            deliverables: [{ path: 'README.md', ok: false, detail: '不存在' }],
            layers: { regression: { executed: true, passed: true }, deliverables: { declared: 1, passed: false } },
          },
        },
      },
    ])
    const entry = view.entries[0]
    if (entry?.kind !== 'verification') throw new Error('应该是验收条目')
    expect(entry.passed).toBe(false)
    expect(entry.layers?.regression.passed).toBe(true)
    expect(entry.layers?.deliverables.passed).toBe(false)
    expect(entry.deliverables).toEqual([{ path: 'README.md', ok: false, detail: '不存在' }])
  })

  it('approval / context_folded 各自成条目，认不出的类型也不丢', () => {
    const view = mapEventsToTimeline([
      {
        type: 'approval',
        ts: 30,
        payload: {
          approval: {
            id: 'a1',
            tool: 'write_file',
            summary: '写入 README.md',
            riskLevel: 'medium',
            affectedFiles: ['README.md'],
            decision: 'reject',
            source: 'timeout',
            requestedAt: 30,
            decidedAt: 40,
          },
        },
      },
      { type: 'context_folded', ts: 50, payload: { keepRuns: 2, keepObservations: 6, reason: '上下文超过预算' } },
      { type: 'future_event_type', ts: 60, payload: {} },
    ])
    expect(view.entries.map((entry) => entry.kind)).toEqual(['approval', 'context_folded', 'unknown'])
    const approval = view.entries[0]
    if (approval?.kind !== 'approval') throw new Error('应该是审批条目')
    expect(approval.decision).toBe('reject')
    expect(approval.source).toBe('timeout')
  })

  it('stopped 汇总用量、迭代数、工具调用数与停止原因', () => {
    const view = mapEventsToTimeline([
      {
        type: 'stopped',
        ts: 99,
        payload: {
          stopReason: { type: 'max_iterations', limit: 50 },
          tokenUsage: { promptTokens: 1200, completionTokens: 340, totalTokens: 1540, cacheHitTokens: 900, cacheMissTokens: 300, cacheComplete: true, complete: true },
          iterationCount: 50,
          toolCallCount: 17,
          fileChanges: [{ tool: 'edit_file', path: 'README.md', at: 1 }],
        },
      },
    ])
    expect(view.entries).toHaveLength(0)
    expect(view.summary?.usage?.totalTokens).toBe(1540)
    expect(view.summary?.iterations).toBe(50)
    expect(view.summary?.toolCalls).toBe(17)
    expect(view.summary?.stopReason).toBe('达到最大迭代数')
    expect(view.summary?.stopDetail).toBe('上限 50')
  })

  it('cancelled 与 user_interrupted 都翻成「已被取消」（两份文档用了两个名字）', () => {
    const cancelled = mapEventsToTimeline([
      { type: 'stopped', ts: 1, payload: { stopReason: 'cancelled', tokenUsage: {}, iterationCount: 1, toolCallCount: 0, fileChanges: [] } },
    ])
    expect(cancelled.summary?.stopReason).toBe('已被取消')
    const interrupted = mapEventsToTimeline([
      { type: 'stopped', ts: 1, payload: { stopReason: { type: 'user_interrupted' } } },
    ])
    expect(interrupted.summary?.stopReason).toBe('已被取消')
  })

  it('task_started 不产生条目（轮次边界由 history 处理）', () => {
    const view = mapEventsToTimeline([{ type: 'task_started', ts: 1, payload: { taskId: 't1', taskDescription: 'x', startTime: 1 } }])
    expect(view.entries).toHaveLength(0)
  })
})

describe('mapEventsToTimeline：坏数据免疫', () => {
  it('payload 是 null / 字符串 / 数组都不抛错', () => {
    const view = mapEventsToTimeline([
      { type: 'decision', ts: 1, payload: null },
      { type: 'observation', ts: 2, payload: 'not-an-object' },
      { type: 'plan_updated', ts: 3, payload: [] },
      { type: 'verification', ts: 4, payload: 42 },
      { type: 'stopped', ts: 5, payload: null },
    ])
    // 只有 observation 会出一条（它本身是「有结果的卡片」），其余尽力降级
    expect(view.entries.length).toBeGreaterThanOrEqual(1)
    expect(view.summary?.usage).toBeNull()
  })

  it('空事件流返回空视图', () => {
    expect(mapEventsToTimeline([])).toEqual({ entries: [], plan: null, summary: null, answer: null })
  })

  it('观测没有对应决策时，仍然出现在时间线上', () => {
    const view = mapEventsToTimeline([
      { type: 'observation', ts: 7, payload: { observation: { action: { type: 'Action', tool: 'run_command', params: { command: 'ls' } }, result: { success: true, data: 'a\nb' } } } },
    ])
    const entry = view.entries[0]
    if (entry?.kind !== 'tool') throw new Error('应该是工具条目')
    expect(entry.tool).toBe('run_command')
    expect(entry.status).toBe('ok')
  })
})

describe('摘要工具', () => {
  it('summarizeToolCall 按工具语义挑字段', () => {
    expect(summarizeToolCall('read_file', { path: 'a.ts' })).toBe('a.ts')
    expect(summarizeToolCall('run_command', { command: 'pnpm   test' })).toBe('pnpm test')
    expect(summarizeToolCall('write_file', { path: 'a.ts', content: '12345' })).toBe('a.ts · 5 字符')
    expect(summarizeToolCall('search_code', { query: 'createClient' })).toBe('createClient')
    expect(summarizeToolCall('unknown_tool', { a: 1, b: 'x' })).toBe('a=1 · b=x')
    expect(summarizeToolCall('unknown_tool', {})).toBe('（无参数）')
  })

  it('summarizeData 优先取人读字段', () => {
    expect(summarizeData('hello\nworld')).toBe('hello world')
    expect(summarizeData([1, 2, 3])).toBe('3 项')
    expect(summarizeData({ summary: '读完了', rows: 3 })).toBe('读完了')
    expect(summarizeData(null)).toBe('（无输出）')
  })

  it('truncateMiddle 保留首尾，超长才截', () => {
    expect(truncateMiddle('short', 10)).toBe('short')
    const result = truncateMiddle('a'.repeat(100), 10)
    expect(result).toHaveLength(10)
    expect(result).toContain('…')
  })
})
