// src/components/Timeline.tsx
//
// 时间线：把 mapEventsToTimeline 的条目按类型派发到对应卡片。
// 折叠/上下文折叠这类「解释模型为什么变了」的事件用一行文字带过，不占卡片空间。
// 没有计划卡与验收卡：计划是模型自己维护的文件（PLAN.md），验收是模型自己跑的项目命令，
// 两者都是普通的工具调用，跟着 tool 条目走。

import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { ToolCard } from './ToolCard'
import { relativeTime } from '../lib/format'
import { describeStopReason, type TimelineEntry } from '../lib/timeline'

export function Timeline({ entries }: { entries: TimelineEntry[] }): ReactNode {
  if (entries.length === 0) return null
  return (
    <div className="timeline">
      <span className="timeline-label">
        执行记录 · {entries.length} 步
      </span>
      {entries.map((entry) => {
        switch (entry.kind) {
          case 'tool':
            return <ToolCard entry={entry} key={entry.id} />
          case 'approval':
            return (
              <div className="turn-meta" key={entry.id}>
                <Icon name={entry.decision === 'approve' ? 'check' : 'close'} size={13} />
                <span>
                  审批{entry.decision === 'approve' ? '通过' : '拒绝'} · {entry.tool} · {describeSource(entry.source)}
                </span>
                <span className="dot" />
                <span>{relativeTime(entry.decidedAt)}</span>
              </div>
            )
          case 'context_folded':
            return (
              <div className="turn-meta" key={entry.id}>
                <Icon name="refresh" size={13} />
                <span>
                  上下文已折叠：保留最近 {entry.keepRuns} 轮 / {entry.keepObservations} 条观察
                  {entry.reason !== '' && ` —— ${entry.reason}`}
                </span>
              </div>
            )
          default:
            return (
              <div className="turn-meta" key={entry.id}>
                <Icon name="alert" size={13} />
                {/* 不静默丢：这段历史来自另一个版本的引擎（例：早先的计划状态机写下的
                    plan_updated），说清楚比装作没看见好 */}
                <span>未识别的事件类型：{entry.type}（这份历史来自另一个版本）</span>
              </div>
            )
        }
      })}
      {entries.length === 0 && null}
    </div>
  )
}

function describeSource(source: string): string {
  switch (source) {
    case 'reviewer':
      return '人工'
    case 'policy':
      return '按策略'
    case 'timeout':
      return '等待超时'
    case 'error':
      return '回调出错'
    default:
      return source
  }
}

/** run 汇总：用量 / 迭代 / 停止原因，一行小字 */
export function TurnMeta({
  usage,
  iterations,
  toolCalls,
  stopReason,
  at,
  running,
}: {
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null
  iterations: number | null
  toolCalls: number | null
  stopReason: unknown
  at: number
  running: boolean
}): ReactNode {
  const stop = describeStopReason(stopReason)
  return (
    <div className="turn-meta">
      {running && (
        <>
          <span className="chip chip-brand">执行中</span>
          <span className="dot" />
        </>
      )}
      {usage !== null && (
        <>
          <span>
            输入 {usage.promptTokens} · 输出 {usage.completionTokens} · 共 {usage.totalTokens} tokens
          </span>
          <span className="dot" />
        </>
      )}
      {iterations !== null && (
        <>
          <span>{iterations} 轮迭代</span>
          <span className="dot" />
        </>
      )}
      {toolCalls !== null && (
        <>
          <span>{toolCalls} 次工具调用</span>
          <span className="dot" />
        </>
      )}
      <span title={stop.detail ?? undefined}>
        {stop.text}
        {stop.detail !== null && `（${stop.detail}）`}
      </span>
      <span className="dot" />
      <span>{relativeTime(at)}</span>
    </div>
  )
}
