// src/hooks/useAuth.ts
//
// 「这次请求是以谁的名义」在界面上的唯一入口。
//
// 一条要紧的取舍：**连不上服务端时不要显示登录页**。把「服务端没起来」误判成
// 「你没登录」会把用户引到一条走不通的路上 —— 他会反复输口令，而问题在连接。
// 所以网络层失败（status 0）当作「已登录、身份未知」，让主界面照旧显示连接面板。
import { useCallback, useEffect, useState } from 'react'

import { api, toApiError } from '../api/client'
import type { AuthMe } from '../api/types'
import type { Credentials } from '../lib/credentials'

export type AuthStatus = 'checking' | 'anonymous' | 'authed'

export interface AuthState {
  status: AuthStatus
  /** 服务端说我是谁；连不上或匿名时为 null */
  me: AuthMe | null
  login(name: string, password: string): Promise<void>
  logout(): Promise<void>
  /** 登录态变了（登录/登出）之后调用方要重挂主界面，这就是那个自增的记号 */
  epoch: number
}

export function useAuth(credentials: Credentials): AuthState {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [me, setMe] = useState<AuthMe | null>(null)
  const [epoch, setEpoch] = useState(0)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const current = await api.me(credentials, signal)
      setMe(current)
      setStatus(current.authenticated ? 'authed' : 'anonymous')
    } catch (error) {
      const apiError = toApiError(error)
      if (apiError.code === 'aborted') return
      // 连不上：不放行也不拦着，交给主界面的连接面板去解释
      setMe(null)
      setStatus(apiError.isNetwork ? 'authed' : 'anonymous')
    }
  }, [credentials])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  const login = useCallback(async (name: string, password: string) => {
    await api.login(credentials, name, password)
    setEpoch((value) => value + 1)
    await refresh()
  }, [credentials, refresh])

  const logout = useCallback(async () => {
    try {
      await api.logout(credentials)
    } finally {
      setMe({ authenticated: false })
      setStatus('anonymous')
      setEpoch((value) => value + 1)
    }
  }, [credentials])

  return { status, me, login, logout, epoch }
}
