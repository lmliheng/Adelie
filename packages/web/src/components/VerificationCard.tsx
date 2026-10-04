// src/components/VerificationCard.tsx
//
// 验收卡。这一层的价值在于「结论来自运行时，不来自模型自述」，
// 所以界面上必须把**分层**摆清楚：回归测试 / 交付物断言，两者分开显示，
// 不让「测试全绿」盖住「交付物没产出」。

import { useId, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import type { VerificationEntry } from '../lib/timeline'

export function VerificationCard({ entry }: { entry: VerificationEntry }): ReactNode {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const skipped = entry.verificationStatus === 'unavailable'
  const title = skipped ? '未执行验收' : entry.passed ? '验收通过' : '验收未通过'
  const declared = entry.layers?.deliverables.declared ?? 0
  const passedDeliverables = entry.deliverables.filter((item) => item.ok).length

  return (
    <article className={`tl-card ${entry.passed ? 'is-ok' : 'is-failed'}`}>
      <button
        type="button"
        className="tl-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="tl-icon">
          <Icon name={entry.passed ? 'shield' : 'alert'} size={14} />
        </span>
        <span className="tl-tool">{title}</span>
        <span className="tl-args">
          {skipped
            ? '工作区里没有可用的验证手段'
            : `测试 ${entry.tests.passed} 通过 / ${entry.tests.failed} 失败`}
        </span>
        <span className="tl-summary">{declared > 0 ? `交付物 ${passedDeliverables}/${declared}` : ''}</span>
        <span className="tl-chev">
          <Icon name="chevron" size={14} />
        </span>
      </button>

      {open && (
        <div className="tl-body" id={bodyId}>
          <div className="tl-files">
            <span className="chip">回归测试：{describeLayer(entry.layers?.regression)}</span>
            <span className="chip">
              类型检查：
              {entry.typeCheckPassed === null ? '未执行' : entry.typeCheckPassed ? '通过' : '失败'}
            </span>
            <span className="chip">交付物：{describeDeliverables(entry)}</span>
          </div>

          {entry.deliverables.length > 0 && (
            <>
              <div className="tl-sub">交付物断言</div>
              <div className="plan-steps">
                {entry.deliverables.map((item) => (
                  <div key={item.path} className={`plan-step is-${item.ok ? 'completed' : 'failed'}`}>
                    <span className="step-mark" aria-hidden="true">
                      {item.ok ? '✓' : '✗'}
                    </span>
                    <span>
                      <code>{item.path}</code> {item.detail}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {entry.diffSummary !== '' && (
            <>
              <div className="tl-sub">变更摘要</div>
              <pre className="tl-pre">{entry.diffSummary}</pre>
            </>
          )}
          {entry.details !== '' && (
            <>
              <div className="tl-sub">验收说明</div>
              <pre className="tl-pre">{entry.details}</pre>
            </>
          )}
          {entry.tests.output !== '' && (
            <>
              <div className="tl-sub">测试输出</div>
              <pre className="tl-pre">{entry.tests.output}</pre>
            </>
          )}
          {entry.typeCheckOutput !== '' && (
            <>
              <div className="tl-sub">类型检查输出</div>
              <pre className="tl-pre">{entry.typeCheckOutput}</pre>
            </>
          )}
        </div>
      )}
    </article>
  )
}

function describeLayer(layer: { executed: boolean; passed: boolean } | undefined): string {
  if (layer === undefined) return '未知'
  if (!layer.executed) return '未执行'
  return layer.passed ? '通过' : '失败'
}

function describeDeliverables(entry: VerificationEntry): string {
  if (entry.layers === null || entry.layers.deliverables.declared === 0) return '本次未声明'
  return entry.layers.deliverables.passed ? '全部通过' : '有未通过项'
}
