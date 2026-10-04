// src/App.tsx
//
// 组装：**身份门** + 顶栏 + 会话侧栏 + 对话区（或连接/加载/空态）+ 输入框 + 设置 + Toast。
//
// 身份门在 P3 加进来：服务端说「你是匿名」时先登录，其余一律照旧。本机打开
// （回环、没配 token）的那位服务端直接认成管理员，所以桌面壳看不到这一层。
//
// 主界面用 `key` 重挂而不是把身份透进 useAdelie：登录态一变，会话列表、配置、
// 工具表全都要按新身份重取，让 hook 按原样重新跑一遍比在它内部逐处判断干净。

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './components/Icon'
import { Glyph } from './components/Icon'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { EmptyState, ConnectionPanel } from './components/EmptyState'
import { Composer } from './components/Composer'
import { TurnView } from './components/TurnView'
import { TranscriptSkeleton } from './components/Skeleton'
import { SettingsDialog } from './components/SettingsDialog'
import { LoginScreen } from './components/LoginScreen'
import { UsersDialog } from './components/UsersDialog'
import { ToastHost } from './components/ToastHost'
import { useAdelie } from './hooks/useAdelie'
import { useAuth, type AuthState } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import { useToast, type ToastController } from './hooks/useToast'
import { loadCredentials, saveCredentials, type Credentials } from './lib/credentials'

export function App(): ReactNode {
  const [credentials, setCredentials] = useState<Credentials>(() => loadCredentials())
  const auth = useAuth(credentials)
  const toast = useToast()

  const applyCredentials = useCallback((next: Credentials) => {
    saveCredentials(next)
    setCredentials(next)
  }, [])

  if (auth.status === 'checking') {
    return (
      <div className="app">
        <div className="boot">
          <Glyph size={36} />
          <span>连接中…</span>
        </div>
      </div>
    )
  }

  if (auth.status === 'anonymous') {
    return (
      <div className="app">
        <LoginScreen credentials={credentials} onSaveCredentials={applyCredentials} login={auth.login} />
        <ToastHost toasts={toast.toasts} onDismiss={toast.dismiss} />
      </div>
    )
  }

  return (
    <Shell
      // 身份或连接变了就整片重挂：会话、配置、工具表都要按新身份重取
      key={`${credentials.baseUrl}|${credentials.token}|${auth.epoch}`}
      auth={auth}
      credentials={credentials}
      onSaveCredentials={applyCredentials}
      toast={toast}
    />
  )
}

function Shell({
  auth,
  credentials,
  onSaveCredentials,
  toast,
}: {
  auth: AuthState
  credentials: Credentials
  onSaveCredentials: (next: Credentials) => void
  toast: ToastController
}): ReactNode {
  const adelie = useAdelie()
  const { theme, toggle } = useTheme()

  const [draft, setDraft] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [usersOpen, setUsersOpen] = useState(false)

  const messagesRef = useRef<HTMLDivElement | null>(null)
  /** 用户往上翻历史时不再强行拉到底，只在贴底时跟随 */
  const stickToBottom = useRef(true)

  const turns = adelie.turns
  const activeSessionId = adelie.activeId

  useEffect(() => {
    const node = messagesRef.current
    if (node === null || !stickToBottom.current) return
    node.scrollTop = node.scrollHeight
  }, [turns])

  const handleScroll = useCallback(() => {
    const node = messagesRef.current
    if (node === null) return
    stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
  }, [])

  // Esc 关抽屉（设置对话框自己在内部处理 Esc，并阻止冒泡）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const send = useCallback(
    (text: string) => {
      stickToBottom.current = true
      void adelie.send(text)
    },
    [adelie],
  )

  // 传给子组件的回调都固定下来：SettingsDialog 会把 onClose 放进 effect 依赖，
  // 每次渲染换一个新函数会让它反复执行（重新聚焦、重设表单）。
  const { newSession, removeSession, openSession, saveConfig, loadConfig, loadTools, setCredentials } = adelie
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const closeUsers = useCallback(() => setUsersOpen(false), [])
  const openUsers = useCallback(() => setUsersOpen(true), [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const toggleSidebar = useCallback(() => setSidebarOpen((value) => !value), [])
  const handleLogout = useCallback(() => {
    void auth.logout()
  }, [auth])
  const handleNewSession = useCallback(() => {
    void newSession().then((id) => {
      if (id === null) toast.push('新建会话失败，检查服务端连接', 'error')
    })
  }, [newSession, toast])
  const handleDeleteSession = useCallback(
    (id: string) => {
      void removeSession(id)
    },
    [removeSession],
  )
  const handleOpenSession = useCallback(
    (id: string) => {
      openSession(id)
    },
    [openSession],
  )

  const connectionBroken = adelie.connection.status === 'offline' || adelie.connection.status === 'unauthorized'
  const checking = adelie.connection.status === 'checking'
  const transcriptLoading = adelie.transcript.status === 'loading' && turns.length === 0
  const showEmpty = !connectionBroken && !checking && !transcriptLoading && turns.length === 0

  const composerDisabled = connectionBroken || checking
  const placeholder = connectionBroken
    ? '连不上服务端 —— 到设置里填服务端地址'
    : activeSessionId === null
      ? '描述要 Adelie 做什么，发送时会新建一个会话'
      : '描述要 Adelie 做什么…'

  const user = auth.me?.user ?? null

  return (
    <div className="app">
      <TopBar
        connection={adelie.connection}
        workspace={adelie.config.data?.workspace ?? null}
        theme={theme}
        user={user === null ? null : { name: user.name, isAdmin: user.isAdmin, kind: user.kind }}
        onToggleTheme={toggle}
        onOpenSettings={openSettings}
        onOpenUsers={openUsers}
        onLogout={handleLogout}
        onToggleSidebar={toggleSidebar}
      />

      {connectionBroken && turns.length > 0 && (
        <div className="banner" role="alert">
          <Icon name="offline" size={15} />
          <span>与服务端的连接中断了，之前加载的内容还可以看。</span>
          <span className="spacer" />
          <button type="button" className="btn btn-secondary" onClick={adelie.retryConnection}>
            重试
          </button>
        </div>
      )}

      <div className="shell">
        {sidebarOpen && (
          <button
            type="button"
            className="scrim"
            aria-label="关闭会话列表"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <Sidebar
          sessions={adelie.sessions.items}
          activeId={activeSessionId}
          streamingSessionIds={adelie.streamingSessionIds}
          status={adelie.sessions.status}
          error={adelie.sessions.error}
          workspace={adelie.config.data?.workspace ?? null}
          provider={adelie.config.data?.model.provider ?? null}
          model={adelie.config.data?.model.model ?? null}
          open={sidebarOpen}
          onOpenSession={handleOpenSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onClose={closeSidebar}
        />

        <main className="chat" aria-label="对话">
          {connectionBroken ? (
            <div className="messages">
              <ConnectionPanel
                status={adelie.connection.status === 'unauthorized' ? 'unauthorized' : 'offline'}
                error={adelie.connection.error}
                onRetry={adelie.retryConnection}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </div>
          ) : (
            <>
              <div className="messages" ref={messagesRef} onScroll={handleScroll} data-testid="messages">
                {checking && turns.length === 0 && <TranscriptSkeleton />}

                {transcriptLoading && <TranscriptSkeleton />}

                {adelie.transcript.status === 'error' && (
                  <div className="column errorbox" role="alert">
                    <span className="errorbox-title">
                      <Icon name="alert" size={15} />
                      会话历史加载失败
                    </span>
                    <span>{adelie.transcript.error}</span>
                    <span className="errorbox-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          if (activeSessionId !== null) void adelie.reloadSession(activeSessionId)
                        }}
                      >
                        <Icon name="refresh" size={15} />
                        重试
                      </button>
                    </span>
                  </div>
                )}

                {showEmpty && (
                  <EmptyState
                    disabled={composerDisabled}
                    workspace={adelie.config.data?.workspace ?? null}
                    onPick={(text) => {
                      setDraft(text)
                      send(text)
                    }}
                  />
                )}

                {turns.map((turn) => (
                  <TurnView
                    key={turn.id}
                    turn={turn}
                    onDecide={(decision, remember) => {
                      void adelie.decideApproval(turn, decision, remember).then(() => {
                        if (decision === 'deny') toast.push('已拒绝这次操作')
                      })
                    }}
                    onRetry={() => send(turn.task)}
                    onReload={() => {
                      if (activeSessionId !== null) void adelie.reloadSession(activeSessionId)
                    }}
                  />
                ))}
              </div>

              <Composer
                value={draft}
                onChange={setDraft}
                onSend={send}
                onStop={adelie.stop}
                streaming={adelie.isStreaming}
                stopRequested={turns.some((turn) => turn.status === 'running' && turn.stopRequested)}
                disabled={composerDisabled}
                placeholder={placeholder}
              />
            </>
          )}
        </main>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={closeSettings}
        credentials={credentials}
        onSaveCredentials={onSaveCredentials}
        config={adelie.config.data}
        configStatus={adelie.config.status}
        configError={adelie.config.error}
        loadConfig={loadConfig}
        saveConfig={saveConfig}
        tools={adelie.tools.items}
        toolsStatus={adelie.tools.status}
        toolsError={adelie.tools.error}
        loadTools={loadTools}
      />

      <UsersDialog open={usersOpen} onClose={closeUsers} credentials={credentials} />

      <ToastHost toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
