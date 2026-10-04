// src/components/UsersDialog.tsx
//
// 用户管理（只有管理员能打开）。整片专用，因为服务端那一整片也是管理员专用的
// （路由权限表里 `/api/users` → admin）。
//
// 这里不做「乐观更新」：改完重新拉一遍列表。账号操作要么成功要么失败，中间态在
// 界面上停留半秒没有意义，而拉错一次会让人以为改成功了。

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { api, describeApiError, toApiError } from '../api/client'
import type { Credentials } from '../lib/credentials'
import type { UserInfo } from '../api/types'

export function UsersDialog({
  open,
  onClose,
  credentials,
}: {
  open: boolean
  onClose: () => void
  credentials: Credentials
}): ReactNode {
  const [users, setUsers] = useState<UserInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newIsAdmin, setNewIsAdmin] = useState(false)

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      setUsers(await api.listUsers(credentials, signal))
      setError(null)
    } catch (caught) {
      setError(describeApiError(toApiError(caught), credentials))
    }
  }, [credentials])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void reload(controller.signal)
    return () => controller.abort()
  }, [open, reload])

  // Esc 关闭（与设置弹窗同一条规矩：打开着的对话框自己处理）
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  async function run(action: () => Promise<unknown>, done: string): Promise<void> {
    setBusy(true)
    setNotice(null)
    try {
      await action()
      setNotice(done)
      await reload()
    } catch (caught) {
      setError(describeApiError(toApiError(caught), credentials))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="dialog-scrim" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="用户管理"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <h2>用户</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="关闭用户管理">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="dialog-body">
          {error !== null && (
            <p className="errorbox" role="alert">
              {error}
            </p>
          )}
          {notice !== null && <p className="hint">{notice}</p>}

          <div>
            <p className="section-title">账号</p>
            <ul className="users-list">
              {users.map((user) => (
                <li key={user.id} className="users-row">
                  <span className="users-name">
                    {user.name}
                    {user.isAdmin && <span className="chip chip-brand">管理员</span>}
                    {user.isSelf && <span className="chip">本人</span>}
                  </span>
                  <span className="users-meta">
                    {user.hasPassword ? '有口令' : '无口令'} · {user.sessionCount} 个会话
                  </span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      const next = window.prompt(`给 ${user.name} 设一个新口令（至少 6 位）`, '')
                      if (next === null) return
                      if (next.length < 6) {
                        setError('口令至少 6 位')
                        return
                      }
                      void run(() => api.setUserPassword(credentials, user.id, next), `已更新 ${user.name} 的口令`)
                    }}
                  >
                    改口令
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy || user.id === 'admin'}
                    onClick={() => {
                      void run(
                        () => api.setUserRole(credentials, user.id, !user.isAdmin),
                        `${user.name} 现在是${user.isAdmin ? '普通用户' : '管理员'}`,
                      )
                    }}
                  >
                    {user.isAdmin ? '降为普通' : '升为管理员'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy || user.id === 'admin' || user.isSelf}
                    onClick={() => {
                      if (!window.confirm(`删除 ${user.name}？他的会话索引会被清掉（磁盘上的事件流仍留着）。`)) return
                      void run(() => api.deleteUser(credentials, user.id), `已删除 ${user.name}`)
                    }}
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="section-title">新建账号</p>
            <div className="field">
              <label htmlFor="user-name">用户名</label>
              <input
                id="user-name"
                className="input"
                value={newName}
                spellCheck={false}
                placeholder="字母、数字、下划线、点或连字符"
                onChange={(event) => setNewName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="user-password">口令</label>
              <input
                id="user-password"
                className="input"
                type="password"
                value={newPassword}
                placeholder="至少 6 位；留空表示先不设口令"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={newIsAdmin} onChange={(event) => setNewIsAdmin(event.target.checked)} />
              <span>给管理员权限</span>
            </label>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy || newName.trim() === ''}
              onClick={() => {
                const name = newName.trim()
                const password = newPassword
                void run(
                  () => api.createUser(credentials, {
                    name,
                    ...(password === '' ? {} : { password }),
                    isAdmin: newIsAdmin,
                  }),
                  `已创建 ${name}`,
                ).then(() => {
                  setNewName('')
                  setNewPassword('')
                  setNewIsAdmin(false)
                })
              }}
            >
              创建
            </button>
          </div>

          <p className="hint">
            每个人的会话与密钥是分开的：普通用户的会话落在自己的分区里，密钥写在
            <code> ~/.adelie/secrets/&lt;用户&gt;.env</code>（0600）。聊天、审批、选模型
            两档完全一样，差别只在密钥、端点、工作区与账号管理这几件事上。
          </p>
        </div>
      </div>
    </div>
  )
}
