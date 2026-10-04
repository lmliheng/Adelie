// src/components/TurnView.tsx
//
// 一轮对话的完整呈现：
//   用户气泡 → 思考过程（可折叠，正文一到就自动收起）→ 正文 → 执行记录 → 审批 → 汇总行。
//
// 时间线不在这里算：events 交给 mapEventsToTimeline（纯函数、可单测），
// useMemo 挂在 events 数组的身份上，所以流式正文的高频更新不会重算时间线。

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { Markdown } from './Markdown'
import { Timeline, TurnMeta } from './Timeline'
import { ApprovalCard } from './ApprovalCard'
import { mapEventsToTimeline } from '../lib/timeline'
import { duration } from '../lib/format'
import { useElapsed } from '../hooks/useElapsed'
import { costOfUsage, ratesForModel } from '../lib/usage'
import type { ModelCatalog } from '../api/types'
import type { TurnState } from '../hooks/useAdelie'

export function TurnView({
  turn,
  catalog,
  onDecide,
  onRetry,
  onReload,
}: {
  turn: TurnState
  /** 价目表（`GET /api/models` 的目录）。查不到价就不显示金额，见下面那条注释 */
  catalog: ModelCatalog | null
  onDecide: (decision: 'approve' | 'deny', remember: boolean) => void
  onRetry: () => void
  onReload: () => void
}): ReactNode {
  const view = useMemo(() => mapEventsToTimeline(turn.events), [turn.events])
  // 实时流里正文来自 delta；历史回放里正文是 Final 决策的 answer
  const content = turn.content !== '' ? turn.content : (view.answer ?? '')
  const running = turn.status === 'running'
  const thinking = turn.reasoning

  const [thinkingOpen, setThinkingOpen] = useState(true)
  const autoCollapsed = useRef(false)
  useEffect(() => {
    // 第一条正文到达就自动收起思考（可以再手动展开）：正文才是要读的东西
    if (!autoCollapsed.current && turn.content !== '') {
      autoCollapsed.current = true
      setThinkingOpen(false)
    }
  }, [turn.content])

  const reasoningSeconds =
    turn.reasoningStartedAt === null
      ? null
      : ((turn.contentStartedAt ?? (running ? Date.now() : turn.reasoningStartedAt)) - turn.reasoningStartedAt) / 1000

  // 用量两处都有，**优先事件流那份**：只有 `stopped.tokenUsage` 带「缓存命中数」，而钱
  // 要吃它（`run_finished.usage` 只有三个总数，契约 §4）。/usage 页读的也是这一份，
  // 于是这一行与那一页才是同一笔账 —— 否则命中缓存的轮次在这里会被系统性高估。
  const usage = view.summary?.usage ?? turn.finished?.usage ?? null
  // 钱用这一轮**自己的**模型查价（run_started / task_started 带下来的，见 TurnState.model）。
  // 模型未知、或它没有牌价时 `costOfUsage` 返回 null —— 这时只显示 token，不显示金额：
  // 按当前配置猜一个数字比不显示更坏，因为猜出来的钱会被当成事实。
  const cost = costOfUsage(usage, ratesForModel(catalog, turn.model))
  const iterations = turn.finished?.iterations ?? view.summary?.iterations ?? null
  const toolCalls = view.summary?.toolCalls ?? null
  const stopReason = turn.finished !== null ? turn.finished.stopReason : (view.summary?.stopReason ?? null)
  // 跑着的时候界面得「会走」：这一轮从开始到现在多久（每秒一跳，见 useElapsed）
  const elapsedSeconds = useElapsed(turn.at, running)

  return (
    <article className="turn column">
      <header>
        <p className="msg-user" style={{ margin: 0 }}>
          {turn.task === '' ? '（上一轮未记录任务描述）' : turn.task}
        </p>
      </header>

      {thinking !== '' && (
        <section className="thinking">
          <button
            type="button"
            className="thinking-head"
            aria-expanded={thinkingOpen}
            onClick={() => setThinkingOpen((value) => !value)}
          >
            <Icon name="chevron" size={13} />
            <span>思考过程</span>
            {reasoningSeconds !== null && <span>· {duration(reasoningSeconds)}</span>}
            {running && !autoCollapsed.current && <span>· 进行中</span>}
          </button>
          {thinkingOpen && <div className="thinking-body">{thinking}</div>}
        </section>
      )}

      <section aria-label="回答">
        {content !== '' ? (
          <Markdown text={content} streaming={running} className="msg-assistant md-body" />
        ) : running ? (
          <span className="dots" role="status" aria-label="正在生成回答">
            <span />
            <span />
            <span />
          </span>
        ) : null}
      </section>

      <Timeline entries={view.entries} running={running} />

      {turn.approval !== null && <ApprovalCard action={turn.approval} onDecide={onDecide} />}

      {/* 审批处理后卡片就消失了，所以结果用一行文字留在原地：
          否则「我点了批准，然后什么都没发生」会让人以为点漏了。 */}
      {turn.approval === null && turn.approvalOutcome !== null && (
        <div className="turn-meta">
          <Icon name={turn.approvalOutcome === 'stale' ? 'alert' : 'check'} size={13} />
          <span>
            {turn.approvalOutcome === 'approve'
              ? '已批准，继续执行'
              : turn.approvalOutcome === 'deny'
                ? '已拒绝'
                : '审批已失效：超过等待时间或已在别处处理'}
          </span>
        </div>
      )}

      {turn.error !== null && (
        <div className="errorbox" role="alert">
          <span className="errorbox-title">
            <Icon name="alert" size={15} />
            {turn.error.code === 'stream_closed' ? '连接中断' : turn.error.code === 'incomplete' ? '这一轮没有正常结束' : '出错了'}
          </span>
          <span>{turn.error.message}</span>
          <span className="errorbox-actions">
            <button type="button" className="btn btn-secondary" onClick={onRetry}>
              <Icon name="refresh" size={15} />
              重新发送这条任务
            </button>
            <button type="button" className="btn btn-secondary" onClick={onReload}>
              从服务端重新同步
            </button>
          </span>
        </div>
      )}

      <TurnMeta
        usage={usage}
        cost={cost}
        iterations={iterations}
        toolCalls={toolCalls}
        stopReason={stopReason}
        at={turn.at}
        running={running}
        elapsedSeconds={elapsedSeconds}
      />
    </article>
  )
}
