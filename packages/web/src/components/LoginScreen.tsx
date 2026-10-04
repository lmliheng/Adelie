// src/components/LoginScreen.tsx
//
// 登录页。只在服务端说「你是匿名」时出现 —— 本机上打开（回环、没配 token）的那位
// 永远不会看到它，桌面壳因此不需要登录界面。

import { useState, type ReactNode } from 'react'
import { Glyph } from './Icon'
import { describeApiError, toApiError } from '../api/client'
import { parseConnectionInput, type Credentials } from '../lib/credentials'

export function LoginScreen({
  credentials,
  onSaveCredentials,
  login,
}: {
  credentials: Credentials
  onSaveCredentials: (next: Credentials) => void
  /** 登录；失败时抛 ApiError（这里翻成人话显示） */
  login: (name: string, password: string) => Promise<void>
}): ReactNode {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 连接设置默认收起：局域网里的手机第一次用要填一次，之后再也不看
  const [showConnection, setShowConnection] = useState(credentials.baseUrl === '')
  const [connection, setConnection] = useState(credentials.baseUrl)
  const [token, setToken] = useState(credentials.token)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await login(name.trim(), password)
    } catch (caught) {
      const apiError = toApiError(caught)
      // 登录这一路的 401 只有一个含义：这一对用户名/口令不对。不能直接套
      // describeApiError —— 那句「服务端地址不对、token 无效」会把人引去改连接设置，
      // 而这里的问题在他刚填的两个格子里。（/api/auth/login 本身不要求 token。）
      setError(apiError.isAuth ? '用户名或口令不对' : describeApiError(apiError, credentials))
    } finally {
      setBusy(false)
    }
  }

  function saveConnection(): void {
    // 粘贴进来的可能是带 token 的整条 URL（服务端启动时会打印那样一条）
    const parsed = parseConnectionInput(connection)
    onSaveCredentials({
      baseUrl: parsed.baseUrl,
      token: token.trim() === '' ? (parsed.token ?? '') : token.trim(),
    })
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <span className="login-mark">
          <Glyph size={40} />
        </span>
        <h1 className="login-title">Adelie</h1>
        <p className="login-sub">登录后进入你自己的会话与密钥。</p>

        <div className="field">
          <label htmlFor="login-name">用户名</label>
          <input
            id="login-name"
            className="input"
            value={name}
            autoComplete="username"
            autoFocus
            spellCheck={false}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">口令</label>
          <input
            id="login-password"
            className="input"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error !== null && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy || name.trim() === '' || password === ''}>
          {busy ? '登录中…' : '登录'}
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-block login-connection-toggle"
          onClick={() => setShowConnection((value) => !value)}
        >
          {showConnection ? '收起连接设置' : '连接设置'}
        </button>

        {showConnection && (
          <>
            <div className="field">
              <label htmlFor="login-base">服务端地址</label>
              <input
                id="login-base"
                className="input"
                value={connection}
                placeholder="留空 = 同源（就是打开这个页面的服务端）"
                spellCheck={false}
                onChange={(event) => setConnection(event.target.value)}
              />
              <span className="hint">手机连局域网里的服务端时，填 http://192.168.x.x:7370</span>
            </div>
            <div className="field">
              <label htmlFor="login-token">访问 token</label>
              <input
                id="login-token"
                className="input"
                value={token}
                placeholder="服务端没设 token 就留空"
                spellCheck={false}
                onChange={(event) => setToken(event.target.value)}
              />
              <span className="hint">
                跨站访问（比如 GitHub Pages 上的 PWA 连局域网服务端）时 Cookie 不生效，
                但登录本身照常可用；token 是给「服务端配了 ADELIE_TOKEN」那种情况用的。
              </span>
            </div>
            <button type="button" className="btn btn-secondary btn-block" onClick={saveConnection}>
              保存连接设置
            </button>
          </>
        )}

        <p className="login-foot">
          在这台机器上（本机浏览器 / 桌面应用）打开时不需要登录：能读到 Adelie 数据目录的人
          就是管理员。账号由管理员在「用户」里创建。
        </p>
      </form>
    </div>
  )
}
