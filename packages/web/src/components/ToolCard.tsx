// src/components/ToolCard.tsx
//
// 一次工具调用的卡片：工具名 + 参数摘要 + 结果摘要，展开看完整参数与输出。
//
// 这是产品里最接近「agent 在干什么」的地方，所以信息优先级排得很明确：
//   第一行一眼看到  tool / 参数 / 状态色；结果摘要在右侧（窄屏隐藏，因为挤不下）；
//   展开后才是 思考 → 参数 → 结果 → 送达统计（字符数被输出预算截断过就标出来）。

import { useId, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import type { ToolEntry } from '../lib/timeline'

function iconFor(entry: ToolEntry): IconName {
  if (entry.status === 'failed') return 'alert'
  if (entry.status === 'pending') return 'clock'
  if (entry.tool === 'run_command') return 'terminal'
  if (entry.tool === 'read_file' || entry.tool === 'write_file' || entry.tool === 'edit_file') return 'file'
  return 'check'
}

export function ToolCard({ entry }: { entry: ToolEntry }): ReactNode {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const hasDetail = entry.resultDetail !== null || entry.thought !== null
  const statusText = entry.status === 'ok' ? '成功' : entry.status === 'failed' ? '失败' : '执行中'

  return (
    <article className={`tl-card is-${entry.status}`} data-testid="tool-card">
      <button
        type="button"
        className="tl-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
        disabled={!hasDetail}
        title={hasDetail ? '展开详情' : undefined}
      >
        <span className="tl-icon">
          <Icon name={iconFor(entry)} size={14} />
        </span>
        <span className="tl-tool">{entry.label}</span>
        <span className="tl-args">{entry.callSummary}</span>
        <span className="tl-summary" title={entry.resultSummary}>
          {entry.status === 'failed' ? '失败 · ' : ''}
          {entry.resultSummary}
        </span>
        {entry.batchSize > 1 && <span className="chip">并行 {entry.batchSize}</span>}
        {entry.truncated && (
          <span className="chip" title="结果被输出预算截断后才送进模型">
            已截断
          </span>
        )}
        <span className="sr-only">{statusText}</span>
        {hasDetail && (
          <span className="tl-chev">
            <Icon name="chevron" size={14} />
          </span>
        )}
      </button>

      {open && hasDetail && (
        <div className="tl-body" id={bodyId} data-testid="tool-body">
          {entry.thought !== null && (
            <>
              <div className="tl-sub">模型当时的想法</div>
              <div className="tl-thought">{entry.thought}</div>
            </>
          )}
          <div className="tl-sub">参数</div>
          <pre className="tl-pre">{entry.paramsJson}</pre>
          <div className="tl-sub">结果</div>
          <pre className="tl-pre">{entry.resultDetail ?? '（无输出）'}</pre>
          {entry.delivery !== null && (
            <div className="tl-files">
              <span className="chip">
                原始 {entry.delivery.rawChars} 字符 → 送达 {entry.delivery.deliveredChars}
              </span>
            </div>
          )}
        </div>
      )}
    </article>
  )
}
