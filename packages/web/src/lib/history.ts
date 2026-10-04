// src/lib/history.ts
//
// 会话事件 → 轮次（一轮 = 一次 task_started 到 stopped 之间的事件）。
//
// 为什么以 task_started 切分而不是以 run 的 ID：`GET /api/sessions/:id` 给回来的
// `events` 是扁平的一条流（持久层的唯一事实源），而 run 边界只由 task_started 表达。
// 按它切分，回放出来的对话结构与实时流一样是「用户说一句 → 一轮执行」。

import type { ModelRefInfo, SessionEventLike } from '../api/types'

export interface Turn {
  /** runId（task_started 的 taskId）或位置 id */
  id: string
  /** 用户这一轮说的话 */
  task: string
  /** 这一轮里的事件（不含 task_started 本身也可以，但保留能显示时间） */
  events: SessionEventLike[]
  /** 开始时间 */
  at: number
  /**
   * 这一轮用的模型（`task_started.payload.model`）。
   *
   * 回放时没有 `run_started` 帧，模型只能从事件流里读；而**每轮的成本要靠它** ——
   * 会话中途换过模型时，按当前配置算钱会算错，所以必须跟着轮次走。
   */
  model: ModelRefInfo | null
}

/**
 * wire 上的模型：只认长得像 `{ provider, model }` 的对象。
 *
 * 事件流与 `run_started` 帧里都有它，两处的收窄规则必须一样 —— 分开写迟早会分叉
 * （一边认字符串简写、另一边不认，就是两处对同一轮显示不同的模型）。
 */
export function modelRefOf(value: unknown): ModelRefInfo | null {
  const record = asRecord(value)
  if (record === null) return null
  const provider = record['provider']
  const model = record['model']
  if (typeof provider !== 'string' || typeof model !== 'string') return null
  if (provider === '' || model === '') return null
  return { provider, model }
}

export function buildTurns(events: readonly SessionEventLike[]): Turn[] {
  const turns: Turn[] = []
  let current: Turn | null = null

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (event === undefined) continue

    if (event.type === 'task_started') {
      const payload = asRecord(event.payload)
      current = {
        id: asString(payload?.['taskId']) ?? `turn-${index}`,
        task: asString(payload?.['taskDescription']) ?? '',
        events: [event],
        at: asNumber(payload?.['startTime']) ?? event.ts,
        model: modelRefOf(payload?.['model']),
      }
      turns.push(current)
      continue
    }

    if (current === null) {
      // task_started 之前的事件：老日志或异常中止的轮次。单独成一轮而不是丢弃，
      // 否则这些工具记录会在界面上凭空消失（历史不完整比多一块更糟）。
      current = { id: `orphan-${index}`, task: '', events: [], at: event.ts, model: null }
      turns.push(current)
    }
    current.events.push(event)
  }

  return turns
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
