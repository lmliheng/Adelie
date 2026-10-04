// src/components/PlaceholderPage.tsx
//
// 导航一期：五个页面先落成**占位**，但每一页都写清三件事 —— 它是什么、它依赖什么、
// 设计写在哪。理由：空页面会让人以为功能坏了，而「说清还没做 + 为什么」既诚实又把
// 上下文留在界面上（下一轮接手时不用翻文档才知道这一页打算长什么样）。
//
// 文案与 `docs/issues/web-*.md` 一一对应；改那一页之前先看草稿。

import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { HOME_PATH, navPageOf, type PageId } from '../lib/router'

interface PageCopy {
  /** 这一页是什么（一句话） */
  what: string
  /** 卡在哪：要哪个接口 / 哪个实体先存在 */
  deps: readonly string[]
  /** 设计草稿（仓库内路径） */
  draft: string
}

const COPY: Record<Exclude<PageId, 'chat'>, PageCopy> = {
  projects: {
    what: '一个项目 = 一个工作区 + 一套默认模型 + 它名下的会话。现在工作区只是「设置 → 运行配置」里的一个字符串，还没有「几个项目切着用」这件事。',
    deps: ['服务端新增 GET/POST /api/projects（清单存 ~/.adelie/projects.json）', '会话按项目归属（现在只有工作区路径）'],
    draft: 'docs/issues/web-left-rail-navigation.md',
  },
  agents: {
    what: 'Agent = 一个目录 + 一份配置（AGENTS.md / config.toml / .vault.toml）。九 tab 里先做「指令」与「密钥」两个。',
    deps: ['~/.adelie/agents/<id>/ 的目录约定', 'GET/PUT /api/agents/:id/config', '会话列表按 Agent 分组'],
    draft: 'docs/issues/web-left-rail-navigation.md',
  },
  models: {
    what: '每个项目一张模型表：配了哪些模型、哪家有密钥、默认指哪一条。引擎里的目录只是候选，不是白名单。',
    deps: ['PUT /api/models（整表替换，管理员）', '价格三档数字（成本中心要它才算得出钱）'],
    draft: 'docs/issues/web-models-page.md',
  },
  plugins: {
    what: '插件 = 技能 + 钩子的打包单位，装在安装级目录里，项目只记「我要哪些」。它要等 skills / hooks 运行时先存在。',
    deps: ['技能目录与清单（skills/*/SKILL.md）', '钩子运行时：在子进程里跑脚本'],
    draft: 'docs/issues/web-left-rail-navigation.md',
  },
  usage: {
    what: '成本中心：用了多少 token、花了多少钱、哪家最贵、失败了多少次。成本按当次价格现算，不写进历史行。',
    deps: ['每轮落一行用量（带项目 / 智能体归属）', '价格表', 'GET /api/usage'],
    draft: 'docs/issues/web-usage-cost-center.md',
  },
}

export function PlaceholderPage({
  id,
  onNavigate,
}: {
  id: Exclude<PageId, 'chat'>
  onNavigate: (next: string) => void
}): ReactNode {
  const page = navPageOf(id)
  const copy = COPY[id]

  return (
    <div className="page">
      <div className="page-card">
        <div className="page-head">
          <Icon name="clock" size={16} />
          <h2 id="page-title">{page?.label ?? id}</h2>
          <span className="chip">还没做</span>
        </div>
        <p className="page-what">{copy.what}</p>

        <p className="section-title">它卡在哪</p>
        <ul className="page-deps">
          {copy.deps.map((dep) => (
            <li key={dep}>{dep}</li>
          ))}
        </ul>

        <p className="page-foot">
          设计写在 <code>{copy.draft}</code>，推进顺序在 <code>docs/web-parity.md</code> 第 7 节。
        </p>

        <button type="button" className="btn btn-secondary" onClick={() => onNavigate(HOME_PATH)}>
          回到对话
        </button>
      </div>
    </div>
  )
}
