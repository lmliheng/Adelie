// src/App.tsx
//
// 组装：顶栏 + 会话侧栏 + 对话区（或连接/加载/空态）+ 输入框 + 设置 + Toast。
//
// 状态全在 useAdelie 里，这里只做三件事：把状态映射成界面分支、维护纯视图状态
// （抽屉、设置开关、草稿、滚动跟随）、把用户动作转成一个调用。

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './components/Icon'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { EmptyState, ConnectionPanel } from './components/EmptyState'
import { Composer } from './components/Composer'
import { TurnView } from './components/TurnView'
import { TranscriptSkeleton } from './components/Skeleton'
import { SettingsDialog } from './components/SettingsDialog'
import { ToastHost } from './components/ToastHost'
import { useAdelie } from './hooks/useAdelie'
import { useTheme } from './hooks/useTheme'
import { useToast } from './hooks/useToast'

export function App(): ReactNode {
  const adelie = useAdelie()
  const { theme, toggle } = useTheme()
  const toast = useToast()

  const [draft, setDraft] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const toggleSidebar = useCallback(() => setSidebarOpen((value) => !value), [])
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

  return (
    <div className="app">
      <TopBar
        connection={adelie.connection}
        workspace={adelie.config.data?.workspace ?? null}
        theme={theme}
        onToggleTheme={toggle}
        onOpenSettings={openSettings}
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
        credentials={adelie.credentials}
        onSaveCredentials={setCredentials}
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

      <ToastHost toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
