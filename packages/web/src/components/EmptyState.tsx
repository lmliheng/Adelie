// src/components/EmptyState.tsx
//
// 空态：这是新用户看到的第一个界面，所以它必须自己解释「这个应用是干什么的」，
// 并给四个**真的执行得起来**的示例任务（点了直接发送，不是教学文案）。
//
// 视觉上是 web-design 允许的唯一装饰：点阵背景 + 品牌字形。

import type { ReactNode } from 'react'
import { Icon } from './Icon'

const EXAMPLES: Array<{ text: string; hint: string }> = [
  { text: '读一遍这个仓库的 README，指出里面过时的地方', hint: '读取与分析' },
  { text: '找出项目里的类型错误并修掉，最后跑一遍测试', hint: '修改 + 验证' },
  { text: '写一个 scripts/release.mjs，按日期打包 dist 目录', hint: '新建文件' },
  { text: '给 packages/core 的公开函数补上缺失的单元测试', hint: '补测试' },
]

export function EmptyState({
  onPick,
  disabled,
  workspace,
}: {
  onPick: (text: string) => void
  disabled: boolean
  workspace: string | null
}): ReactNode {
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
      <p className="empty-sub">
        它会读文件、改代码、跑命令，每一步都留在时间线上
        {workspace !== null && `（工作区 ${workspace}）`}。危险操作会先问你。
      </p>
      <div className="examples">
        {EXAMPLES.map((example, index) => (
          <button
            type="button"
            key={example.text}
            className="example-card"
            disabled={disabled}
            onClick={() => onPick(example.text)}
          >
            <span className="example-num">
              {String(index + 1).padStart(2, '0')} · {example.hint}
            </span>
            <span className="example-text">{example.text}</span>
          </button>
        ))}
      </div>
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
