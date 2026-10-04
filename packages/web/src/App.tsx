// src/App.tsx
//
// 组装：**身份门** + 顶栏 + 会话侧栏 + 对话区（或连接/加载/空态）+ 输入框 + 设置 + Toast。
//
// 身份门在 P3 加进来：服务端说「你是匿名」时先登录，其余一律照旧。本机打开
// （回环、没配 token）的那位服务端直接认成管理员，所以桌面壳看不到这一层。
//
// 主界面用 `key` 重挂而不是把身份透进 useAdelie：登录态一变，会话列表、配置、
// 工具表全都要按新身份重取，让 hook 按原样重新跑一遍比在它内部逐处判断干净。

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from './components/Icon'
import { Glyph } from './components/Icon'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { EmptyState, ConnectionPanel } from './components/EmptyState'
import { Composer } from './components/Composer'
import { ComposerToolbar } from './components/ComposerToolbar'
import { TurnView } from './components/TurnView'
import { TranscriptSkeleton } from './components/Skeleton'
import { SettingsDialog } from './components/SettingsDialog'
import { CommandPalette } from './components/CommandPalette'
import { PlaceholderPage } from './components/PlaceholderPage'
import { LoginScreen } from './components/LoginScreen'
import { ToastHost } from './components/ToastHost'
import { useAdelie } from './hooks/useAdelie'
import { useAuth, type AuthState } from './hooks/useAuth'
import { useRoute } from './hooks/useRoute'
import { useTheme } from './hooks/useTheme'
import { useToast, type ToastController } from './hooks/useToast'
import { loadCredentials, saveCredentials, type Credentials } from './lib/credentials'
import { parseChord, resolveShortcut, type KeyChord, type ShortcutCommand } from './lib/shortcuts'
import { resolveSection, type SettingsSectionId } from './lib/sections'
import { HOME_PATH, NAV_PAGES, navPageOf, pageIdOf } from './lib/router'

// 键位在模块层解析一次，命令表每轮渲染直接引用（解析不会变，也就没必要放进 useMemo 的依赖）
const PALETTE_CHORD = parseChord('mod+k')
const SIDEBAR_CHORD = parseChord('mod+b')
const SETTINGS_CHORD = parseChord('mod+,')

/** 组装可选的 `chord` 字段：`exactOptionalPropertyTypes` 下不能把 undefined 塞给可选属性 */
function optionalChord(chord: KeyChord | null): Pick<ShortcutCommand, 'chord'> {
  return chord === null ? {} : { chord }
}

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
  // 路由：路径 → 页面。五个导航页一期只是占位（见 PlaceholderPage），但 URL 已经是真的：
  // 可分享、可前进后退、刷新不退化成对话页。
  const { path, navigate } = useRoute()
  const pageId = pageIdOf(path) ?? 'chat'

  const [draft, setDraft] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 设置停在那一节；身份变化时会按 `resolveSection` 收窄（管理员被降权后不会卡在「用户」）
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('connection')
  const [paletteOpen, setPaletteOpen] = useState(false)

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

  // Esc 关抽屉、以及一切快捷键，都走下面那个唯一的分发器（见 `commands` / `useEffect`）

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
  // 输入区那两个下拉失败时说的话（改模型 / 改审批口径没成功）。push 本身是稳定的，直接依赖它
  const pushToast = toast.push
  const notifyError = useCallback((message: string) => pushToast(message, 'error'), [pushToast])
  const openUsers = useCallback(() => {
    setSettingsSection('users')
    setSettingsOpen(true)
  }, [])
  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const toggleSidebar = useCallback(() => setSidebarOpen((value) => !value), [])
  const goHome = useCallback(() => navigate(HOME_PATH), [navigate])
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

  // 命令表：**唯一**一份「能做什么」。快捷键分发器与命令面板都从它取，
  // 于是「面板里列出来的」和「按得出来的」不会分叉。
  //
  // 只在当前条件下真的可用的才进表（不是灰掉）：列一条按了没反应的命令，
  // 比没有它更让人困惑。没有键位的命令只能从面板里选。
  const commands = useMemo<ShortcutCommand[]>(() => {
    const list: ShortcutCommand[] = [
      {
        id: 'palette.open',
        title: '打开命令面板',
        group: '通用',
        ...optionalChord(PALETTE_CHORD),
        run: openPalette,
      },
      { id: 'session.new', title: '新建会话', group: '会话', run: handleNewSession },
      {
        id: 'view.toggle-sidebar',
        title: '显示 / 隐藏会话列表',
        group: '视图',
        ...optionalChord(SIDEBAR_CHORD),
        run: toggleSidebar,
      },
      {
        id: 'theme.toggle',
        title: theme === 'dark' ? '切换到浅色模式' : '切换到深色模式',
        group: '视图',
        run: toggle,
      },
      {
        id: 'settings.open',
        title: '打开设置',
        group: '通用',
        ...optionalChord(SETTINGS_CHORD),
        run: openSettings,
      },
      // 导航没有键位：五条命令是给面板用的（顺带让面板能到 rail 到不了的地方，
      // 比如窄屏抽屉关着的时候）。
      { id: 'nav.chat', title: '回到对话', group: '导航', run: goHome },
      ...NAV_PAGES.map((page) => ({
        id: `nav.${page.id}`,
        title: `打开${page.label}`,
        group: '导航',
        run: () => navigate(page.path),
      })),
    ]
    if (user?.isAdmin === true) {
      list.push({ id: 'settings.users', title: '用户管理', group: '服务端', adminOnly: true, run: openUsers })
    }
    if (user !== null && user.kind !== 'host') {
      list.push({ id: 'auth.logout', title: '退出登录', group: '账号', run: handleLogout })
    }
    if (connectionBroken) {
      list.push({ id: 'connection.retry', title: '重试连接', group: '通用', run: adelie.retryConnection })
    }
    return list
  }, [
    adelie.retryConnection,
    connectionBroken,
    goHome,
    handleLogout,
    handleNewSession,
    navigate,
    openPalette,
    openSettings,
    openUsers,
    theme,
    toggle,
    toggleSidebar,
    user,
  ])

  // 单一分发器：所有快捷键与「Esc 关抽屉」都从这里过，不再有第二处 window.keydown。
  // 设置对话框与命令面板各自的 Esc 在更近的节点上 stopPropagation，所以到不了这里。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = resolveShortcut(event, commands)
      if (command !== null) {
        event.preventDefault()
        command.run()
        return
      }
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commands])

  // 身份变了就把「停在哪一节」收窄回当前身份看得见的位置
  const activeSection = useMemo(
    () => resolveSection(settingsSection, { isAdmin: user?.isAdmin === true }) ?? 'connection',
    [settingsSection, user],
  )

  return (
    <div className="app">
      <TopBar
        connection={adelie.connection}
        workspace={adelie.config.data?.workspace ?? null}
        theme={theme}
        user={user === null ? null : { name: user.name, isAdmin: user.isAdmin, kind: user.kind }}
        onToggleTheme={toggle}
        onOpenSettings={openSettings}
        onOpenPalette={openPalette}
        onOpenUsers={openUsers}
        onLogout={handleLogout}
        onToggleSidebar={toggleSidebar}
        onHome={goHome}
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
          path={path}
          onNavigate={navigate}
          onOpenSession={handleOpenSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onClose={closeSidebar}
        />

        <main className="chat" aria-label={pageId === 'chat' ? '对话' : (navPageOf(pageId)?.label ?? '页面')}>
          {pageId !== 'chat' ? (
            // 五个导航页一期是占位：`connectionBroken` 也照样显示（它们是本地页面，
            // 断网时看「这一页打算做什么」比看一块重试面板有用）。
            <PlaceholderPage id={pageId} onNavigate={navigate} />
          ) : connectionBroken ? (
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

                {showEmpty && <EmptyState />}

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
                toolbar={
                  <ComposerToolbar
                    config={adelie.config.data}
                    catalog={adelie.models.catalog}
                    saveConfig={saveConfig}
                    notify={notifyError}
                  />
                }
              />
            </>
          )}
        </main>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={closeSettings}
        section={activeSection}
        onSectionChange={setSettingsSection}
        isAdmin={user?.isAdmin === true}
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

      <CommandPalette open={paletteOpen} commands={commands} onClose={closePalette} />

      <ToastHost toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}
