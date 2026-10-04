// src/components/EmptyState.tsx
//
// 空态：新会话的第一屏。
//
// 只留「这是什么」—— 字形 + 品牌行 + 一句话标题。原来的用法说明段与四张示例任务卡
// 已按用户要求删掉：那一屏的下一步是去输入框，而不是先读一段介绍再点别人写好的任务。
//
// 视觉上是 web-design 允许的唯一装饰：点阵背景 + 品牌字形。

import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function EmptyState(): ReactNode {
  return (
    <section className="empty" aria-label="开始使用">
      <div className="empty-flourish">
        {/* 相对 base（'./'）下用 BASE_URL 拼图标地址：子路径部署（GitHub Pages）时
            '/adelie-icon.svg' 会 404，而 './adelie-icon.svg' 跟着页面走。 */}
        <img className="empty-mark" src={`${import.meta.env.BASE_URL}adelie-icon.svg`} alt="" width={64} height={64} />
      </div>
      <span className="eyebrow">Adelie · 工作区智能体</span>
      <h1 className="empty-title">
        让 Adelie 在你的<em>工作区</em>里动手做完
      </h1>
    </section>
  )
}

/** 连不上服务端时的整页状态：说清楚原因 + 下一步做什么，而不是空白 */
export function ConnectionPanel({
  status,
  error,
  onRetry,
  onOpenSettings,
}: {
  status: 'offline' | 'unauthorized'
  error: string | null
  onRetry: () => void
  onOpenSettings: () => void
}): ReactNode {
  return (
    <section className="panel" aria-label="连接状态">
      <span className="eyebrow">Adelie · 离线</span>
      <h2>未连接到 Adelie 服务端</h2>
      <p>
        {status === 'unauthorized'
          ? error ?? '服务端要求鉴权，但当前没有有效的 token。'
          : error ?? '这台设备现在连不上服务端。'}
      </p>
      <div className="errorbox" role="alert">
        <span className="errorbox-title">
          <Icon name="offline" size={15} />
          {status === 'unauthorized' ? '401 未授权' : '网络不可达'}
        </span>
        <span>
          {status === 'unauthorized'
            ? '到设置里粘贴服务端启动时打印的地址（含 token），或单独填 token。'
            : '在本机启动服务端（pnpm serve），手机则要填服务端的局域网地址：设置 → 服务端连接。'}
        </span>
        <span className="errorbox-actions">
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            <Icon name="refresh" size={15} />
            重试
          </button>
          <button type="button" className="btn btn-primary" onClick={onOpenSettings}>
            <Icon name="gear" size={15} />
            打开设置
          </button>
        </span>
      </div>
    </section>
  )
}
