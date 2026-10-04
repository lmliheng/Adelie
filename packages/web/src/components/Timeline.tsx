// src/components/Timeline.tsx
//
// 时间线：把 mapEventsToTimeline 的条目按类型派发到对应卡片。
// 折叠/上下文折叠这类「解释模型为什么变了」的事件用一行文字带过，不占卡片空间。
// 没有计划卡与验收卡：计划是模型自己维护的文件（PLAN.md），验收是模型自己跑的项目命令，
// 两者都是普通的工具调用，跟着 tool 条目走。

import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { ToolCard } from './ToolCard'
import { compactNumber, durationZh, relativeTime } from '../lib/format'
import { formatUsd } from '../lib/usage'
import { describeStopReason, type TimelineEntry } from '../lib/timeline'

export function Timeline({ entries, running = false }: { entries: TimelineEntry[]; running?: boolean }): ReactNode {
  if (entries.length === 0) return null
  return (
    <div className="timeline">
      <span className="timeline-label">
        {/* 还在跑：标题上也点一颗活体点，让人一眼看出这一屏是「活的」 */}
        {running && <span className="live-dot" aria-hidden="true" />}
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
  cost,
  iterations,
  toolCalls,
  stopReason,
  at,
  running,
  elapsedSeconds,
}: {
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null
  /**
   * 这一轮的钱（`costOfUsage` 算出来的，USD）。**null = 不显示金额**：
   * 模型未知、或这一轮用的模型在价目表里没有牌价。这时宁可只说 token，
   * 也不按当前配置猜一个数字 —— 猜出来的钱比不显示更坏（它会被人当成事实）。
   */
  cost: number | null
  iterations: number | null
  toolCalls: number | null
  stopReason: unknown
  at: number
  running: boolean
  /** 跑着的时候走到第几秒（`useElapsed`）；不跑时是 0，不显示 */
  elapsedSeconds: number
}): ReactNode {
  const stop = describeStopReason(stopReason)
  // 口径与 /usage 页一致：token 用 k/M 缩写，钱用 formatUsd（小额不会被抹成 $0）。
  // 输入 / 输出 / 合计三个数在 title 里 —— 占一整行读起来是噪声，但它们也不该丢。
  const usageDetail =
    usage === null
      ? undefined
      : `输入 ${usage.promptTokens} · 输出 ${usage.completionTokens} · 共 ${usage.totalTokens} tokens`
  return (
    <div className="turn-meta">
      {running && (
        <>
          <span className="chip chip-live">
            <span className="live-dot" aria-hidden="true" />
            执行中 · {durationZh(elapsedSeconds)}
          </span>
          <span className="dot" />
        </>
      )}
      {usage !== null && (
        <>
          <span title={usageDetail}>
            {compactNumber(usage.totalTokens)} tokens
            {cost === null ? '' : ` · ${formatUsd(cost)}`}
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
