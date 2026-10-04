// src/components/PlanCard.tsx
//
// 计划卡：把 PlanState 画成勾选清单 —— 这是「agent 打算怎么做、做到哪一步」的全部信息。
// 被重规划取代的旧版本默认折叠：时间线上保留它（审计要看），但不抢当前版本的注意力。

import { useId, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { stepMark, type PlanEntry } from '../lib/timeline'

export function PlanCard({ entry }: { entry: PlanEntry }): ReactNode {
  const [open, setOpen] = useState(!entry.superseded)
  const bodyId = useId()
  const done = entry.steps.filter((step) => step.status === 'completed' || step.status === 'skipped').length
  const failed = entry.steps.some((step) => step.status === 'failed')

  return (
    <article className="tl-card">
      <button
        type="button"
        className="tl-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="tl-icon">
          <Icon name="sparkle" size={14} />
        </span>
        <span className="tl-tool">
          {entry.reason === null ? `计划 v${entry.version}` : `重新规划 v${entry.version}`}
        </span>
        <span className="tl-args">{entry.originalGoal}</span>
        <span className="tl-summary">
          {done}/{entry.steps.length} 步
          {entry.superseded ? ' · 已被取代' : entry.reason !== null ? ' · 已调整' : ''}
        </span>
        {failed && <span className="chip chip-danger">有失败</span>}
        <span className="tl-chev">
          <Icon name="chevron" size={14} />
        </span>
      </button>

      {open && (
        <div className="tl-body" id={bodyId}>
          {entry.reason !== null && (
            <>
              <div className="tl-sub">调整原因</div>
              <div className="tl-thought">{entry.reason}</div>
            </>
          )}
          <div className="plan-steps">
            {entry.steps.map((step, index) => (
              <div
                key={step.id}
                className={`plan-step is-${step.status}${index === entry.currentStepIndex && step.status === 'in_progress' ? ' is-current' : ''}`}
              >
                <span className="step-mark" aria-hidden="true">
                  {stepMark(step.status)}
                </span>
                <span>{step.description}</span>
              </div>
            ))}
          </div>
          {entry.deliverables.length > 0 && (
            <>
              <div className="tl-sub">声明的交付物</div>
              <div className="tl-files">
                {entry.deliverables.map((path) => (
                  <span className="chip" key={path}>
                    <Icon name="file" size={11} />
                    {path}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </article>
  )
}
