// src/components/ApprovalCard.tsx
//
// 审批卡：产品里唯一「停下来等人」的地方，所以它必须回答三个问题——
//   做什么（summary + 工具 + 完整命令/参数）、影响什么（文件与变更类型）、风险多高。
// 批准/拒绝是明确的动作，不是「关闭弹窗」。超时（409 stale_approval）由调用方
// 翻成一行结果，不在这里假装成功。

import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import type { PendingActionLike } from '../api/types'

const RISK_LABEL: Record<string, string> = { low: '低风险', medium: '中风险', high: '高风险' }
const CHANGE_LABEL: Record<string, string> = { create: '新建', modify: '修改', delete: '删除' }

export function ApprovalCard({
  action,
  onDecide,
}: {
  action: PendingActionLike
  onDecide: (decision: 'approve' | 'deny', remember: boolean) => void
}): ReactNode {
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null)
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.round((action.expiresAt - Date.now()) / 1000)))

  // 倒计时让「5 分钟后自动按拒绝处理」这件事是可见的，而不是突然失败
  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(Math.max(0, Math.round((action.expiresAt - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [action.expiresAt])

  const params = action.source.decision.params
  const command = typeof params['command'] === 'string' ? params['command'] : null
  const path = typeof params['path'] === 'string' ? params['path'] : null

  return (
    <section className="approval" aria-label="需要审批的操作" data-testid="approval">
      <div className="approval-head">
        <Icon name="shield" size={16} />
        <span>需要你确认</span>
        <span className="spacer" />
        <span className={`chip${action.preview.riskLevel === 'high' ? ' chip-danger' : ''}`}>
          {RISK_LABEL[action.preview.riskLevel] ?? action.preview.riskLevel}
        </span>
        {remaining > 0 && <span className="chip">{remaining}s 后自动拒绝</span>}
      </div>

      <p className="approval-line" style={{ margin: 0 }}>
        {action.preview.summary}
      </p>

      {command !== null && <pre className="approval-cmd">{command}</pre>}
      {command === null && path !== null && (
        <pre className="approval-cmd">
          {action.preview.tool} · {path}
        </pre>
      )}

      {action.preview.affectedFiles.length > 0 && (
        <div className="tl-files">
          {action.preview.affectedFiles.map((file) => (
            <span className="chip" key={`${file.path}-${file.changeType}`}>
              {CHANGE_LABEL[file.changeType] ?? file.changeType} {file.path}
            </span>
          ))}
        </div>
      )}

      {action.source.thought !== '' && (
        <details>
          <summary style={{ fontSize: 12.5, color: 'var(--fg-muted)', cursor: 'pointer' }}>模型的理由</summary>
          <div className="tl-thought" style={{ marginTop: 8 }}>
            {action.source.thought}
          </div>
        </details>
      )}

      <div className="approval-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null}
          onClick={() => {
            setBusy('approve')
            onDecide('approve', remember)
            setBusy(null)
          }}
        >
          <Icon name="check" size={15} />
          批准
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy !== null}
          onClick={() => {
            setBusy('deny')
            onDecide('deny', remember)
            setBusy(null)
          }}
        >
          拒绝
        </button>
        <label className="approval-remember">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          记住这个决定
        </label>
      </div>
    </section>
  )
}
