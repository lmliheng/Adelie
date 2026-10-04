// src/components/NavRail.tsx
//
// 左栏顶部的导航（rail）。五项来自用户的清单（项目 / 智能体 / 模型 / 插件 / 成本中心），
// 外加一个「对话」—— penguin 的 chat 是 `nav: "none"`（它靠「新会话」按钮与会话列表回去），
// Adelie 也有那两样，但 rail 上少一个「回去」的入口在手机上很难用，所以这里多加一条。
//
// 顺序、路径、id 都在 `lib/router.ts` 里（纯函数、有单测）；这里只管画与点。

import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { HOME_PATH, NAV_PAGES, pageIdOf, type PageId } from '../lib/router'

const ICONS: Record<PageId, IconName> = {
  chat: 'chat',
  projects: 'folder',
  agents: 'robot',
  models: 'cube',
  plugins: 'plug',
  usage: 'chart',
}

export function NavRail({
  path,
  onNavigate,
}: {
  path: string
  onNavigate: (next: string) => void
}): ReactNode {
  const active: PageId = pageIdOf(path) ?? 'chat'
  const items: { id: PageId; path: string; label: string }[] = [
    { id: 'chat', path: HOME_PATH, label: '对话' },
    ...NAV_PAGES.map((page) => ({ id: page.id as PageId, path: page.path, label: page.label })),
  ]

  return (
    <nav className="nav-rail" aria-label="主导航">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`nav-item${item.id === active ? ' is-active' : ''}`}
          aria-current={item.id === active ? 'page' : undefined}
          data-testid={`nav-${item.id}`}
          onClick={() => onNavigate(item.path)}
        >
          <Icon name={ICONS[item.id]} size={16} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
