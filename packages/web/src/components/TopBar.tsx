// src/components/TopBar.tsx
//
// 顶栏：品牌 + 连接状态 + 身份 + 主题切换 + 用户 + 设置。移动端左侧多一个抽屉按钮。
// 连接状态是常驻的：这个应用的失败模式大多是「连不上服务端」，
// 把它做成一个安静但一直在的小胶囊，比弹一次错误框有用。
//
// 身份也常驻：多用户之后「我现在是谁」必须一眼可见 —— 否则改模型、看会话列表时
// 都在猜这是谁的。本机上没登录的那位显示「本机」。

import type { ReactNode } from 'react'
import { Glyph, Icon } from './Icon'
import { shortenPath } from '../lib/format'
import type { ConnectionState } from '../hooks/useAdelie'

const LABELS: Record<ConnectionState['status'], string> = {
  checking: '连接中',
  online: '已连接',
  offline: '未连接',
  unauthorized: '未授权',
}

export function TopBar({
  connection,
  workspace,
  theme,
  user,
  onToggleTheme,
  onOpenSettings,
  onOpenUsers,
  onLogout,
  onToggleSidebar,
}: {
  connection: ConnectionState
  workspace: string | null
  theme: 'light' | 'dark'
  /** 当前身份；连不上服务端时是 null（那时还不知道是谁） */
  user: { name: string; isAdmin: boolean; kind: string } | null
  onToggleTheme: () => void
  onOpenSettings: () => void
  onOpenUsers: () => void
  onLogout: () => void
  onToggleSidebar: () => void
}): ReactNode {
  const title =
    connection.status === 'online'
      ? `已连接${connection.health ? ` · v${connection.health.version}` : ''}`
      : (connection.error ?? LABELS[connection.status])

  return (
    <header className="topbar">
      <button
        type="button"
        className="iconbtn sidebar-toggle"
        onClick={onToggleSidebar}
        aria-label="打开会话列表"
        data-testid="sidebar-toggle"
      >
        <Icon name="menu" size={18} />
      </button>
      {/* 回到部署根（相对 base 下 '/ ' 会跑出子路径） */}
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="Adelie 首页">
        <Glyph size={24} />
        <span className="brand-name">Adelie</span>
      </a>
      {workspace !== null && (
        <span className="brand-workspace" title={workspace}>
          {shortenPath(workspace)}
        </span>
      )}
      <span className="spacer" />
      <span className={`conn is-${connection.status}`} title={title}>
        <span className="conn-dot" />
        <span className="conn-label">{LABELS[connection.status]}</span>
      </span>
      {user !== null && (
        <span className="who" title={user.kind === 'host' ? '本机身份（这台上读得到 Adelie 数据的人就是管理员）' : user.name}>
          <Icon name="user" size={16} />
          <span className="who-name">{user.kind === 'host' ? '本机' : user.name}</span>
          {user.isAdmin && <span className="who-admin">管理员</span>}
        </span>
      )}
      {user?.isAdmin === true && (
        <button type="button" className="iconbtn" onClick={onOpenUsers} aria-label="用户管理" data-testid="open-users">
          <Icon name="users" size={18} />
        </button>
      )}
      {user !== null && user.kind !== 'host' && (
        <button type="button" className="iconbtn" onClick={onLogout} aria-label="退出登录" data-testid="logout">
          <Icon name="logout" size={18} />
        </button>
      )}
      <button
        type="button"
        className="iconbtn"
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
      </button>
      <button type="button" className="iconbtn" onClick={onOpenSettings} aria-label="打开设置" data-testid="open-settings">
        <Icon name="gear" size={18} />
      </button>
    </header>
  )
}
