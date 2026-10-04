// src/components/Sidebar.tsx
//
// 会话列表（宽屏常驻、移动端抽屉）。
//
// 删除做成行内二次确认（「删除 / 取消」）而不是 window.confirm：原生弹窗在 PWA 里
// 样式不受控、会打断输入，而且 confirm 在部分浏览器里被当成「阻塞脚本」直接吞掉。

import { useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { NavRail } from './NavRail'
import { SessionListSkeleton } from './Skeleton'
import { relativeTime, shortenPath } from '../lib/format'
import type { SessionSummary } from '../api/types'

export function Sidebar({
  sessions,
  activeId,
  streamingSessionIds,
  status,
  error,
  workspace,
  provider,
  model,
  open,
  path,
  onNavigate,
  onOpenSession,
  onNewSession,
  onDeleteSession,
  onClose,
}: {
  sessions: SessionSummary[]
  activeId: string | null
  streamingSessionIds: Set<string>
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  workspace: string | null
  provider: string | null
  model: string | null
  open: boolean
  /** 当前路由（给 rail 标出在哪一页） */
  path: string
  onNavigate: (next: string) => void
  onOpenSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
  onClose: () => void
}): ReactNode {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busyNew, setBusyNew] = useState(false)

  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="导航与会话" data-testid="sidebar">
      {/* 导航在会话列表之上、同一个抽屉里：手机上打开抽屉一次就能既换页又换会话 */}
      <NavRail
        path={path}
        onNavigate={(next) => {
          onNavigate(next)
          onClose()
        }}
      />

      <div className="sidebar-head">
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busyNew}
          onClick={() => {
            setBusyNew(true)
            // 这里不需要 loading 态：请求很快，且失败会体现在列表错误里
            onNewSession()
            setTimeout(() => setBusyNew(false), 600)
            onClose()
          }}
        >
          <Icon name="plus" size={15} />
          新建会话
        </button>
      </div>

      <nav className="session-list" aria-label="会话">
        {status === 'loading' && sessions.length === 0 && <SessionListSkeleton />}

        {status === 'error' && (
          <div className="errorbox" role="alert">
            <span className="errorbox-title">
              <Icon name="alert" size={15} />
              会话列表加载失败
            </span>
            <span>{error ?? '未知错误'}</span>
          </div>
        )}

        {status === 'ready' && sessions.length === 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--fg-faint)', padding: '8px 6px', margin: 0 }}>
            还没有会话。新建一个，或直接在输入框里描述要做什么。
          </p>
        )}

        {sessions.map((session) =>
          confirming === session.id ? (
            <div className="confirm-strip" key={session.id}>
              <span style={{ flex: 1 }}>删除这个会话？</span>
              <button
                type="button"
                className="btn btn-danger"
                style={{ minHeight: 40, padding: '2px 10px', fontSize: 12.5 }}
                onClick={() => {
                  setConfirming(null)
                  onDeleteSession(session.id)
                }}
              >
                删除
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ minHeight: 40, padding: '2px 10px', fontSize: 12.5 }}
                onClick={() => setConfirming(null)}
              >
                取消
              </button>
            </div>
          ) : (
            <div
              key={session.id}
              className={`session-item${session.id === activeId ? ' is-active' : ''}`}
              role="button"
              tabIndex={0}
              aria-current={session.id === activeId ? 'true' : undefined}
              onClick={() => {
                onOpenSession(session.id)
                onClose()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenSession(session.id)
                  onClose()
                }
              }}
            >
              <span className="session-body">
                <span className="session-name">{session.title === '' ? '未命名会话' : session.title}</span>
                <span className="session-meta">
                  {relativeTime(session.lastActiveAt ?? session.createdAt)}
                  {session.taskCount > 0 && ` · ${session.taskCount} 轮`}
                </span>
              </span>
              {streamingSessionIds.has(session.id) && <span className="session-running" aria-label="正在执行" />}
              <button
                type="button"
                className="iconbtn iconbtn-sm session-delete"
                aria-label={`删除会话：${session.title === '' ? '未命名会话' : session.title}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setConfirming(session.id)
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          ),
        )}
      </nav>

      <div className="sidebar-foot">
        {workspace !== null && (
          <span title={workspace}>
            工作区 <code>{shortenPath(workspace)}</code>
          </span>
        )}
        <span>
          {provider ?? '—'} / {model ?? '—'}
        </span>
      </div>
    </aside>
  )
}
