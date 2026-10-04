---
title: "web: 左侧要有 项目 / 智能体 / 模型 / 插件 / 成本中心 五个入口（借 penguin 的 nav 模型）"
labels: [决策, scope:web, P2]
---

## 现象

Adelie web 现在是**一个平级页面**：`App.tsx` 用几个 `useState` 切抽屉与对话框，
`react-router` 在 `src/` 里 0 命中，没有页面层、没有 URL 深链、没有导航。

penguin 的侧栏 = 页面清单里 `nav: "main"` 的条目（`lib/pages.ts:32` `navPagesFor`），当前是
agents / models / plugins / machines(admin) / usage / benchmark，**再叠一层 Project 上下文**
（`state/project.tsx` + 侧栏顶部的项目切换）。用户要求 Adelie 照这个来：

> 左边可以设置项目，智能体，模型，插件，成本中心。

## 设计

rail 五项，每项先给出「最小版」与依赖；「什么时候能上」写在最后的期数里。

| 入口 | 是什么 | 最小版 | 依赖 |
| --- | --- | --- | --- |
| **项目** | 「一个工作区 + 一套默认模型 + 它名下的会话」。Penguin 的 Project 还带成员、模型表、插件表 | 项目 = 现有 `workspace` 路径 + 一个显示名；清单存 `~/.adelie/projects.json`；服务端 `GET/POST /api/projects` | 无（纯服务端新增） |
| **智能体** | Agent 列表 + 设置页（指令 / 密钥 / 技能 / 定时…九 tab） | `~/.adelie/agents/<id>/{AGENTS.md, config.toml, .vault.toml}`；九 tab 先做**指令**与**密钥**两个 | 目录约定 + `GET/PUT /api/agents/:id/config` |
| **模型** | 每个项目一张模型表：`(provider, modelId)` 配对键、整体替换、密钥授权、默认指针 | 配置文件式 `models/<provider>.json`；`GET` 遮罩密钥、`PUT` 整体替换 | `GET /api/models` 已有，写路由要加；详见 `web-models-page.md` |
| **插件** | 安装级目录 + `plugin.json`（= 技能 + 钩子的**打包单位**） | **远期**：需要 skills / hooks 运行时。一期只在 rail 上占位，点进去给一行「为什么还没有」 | skills 面 |
| **成本中心** | 三张汇总卡 + 一条成本折线 + 错误表 | = 路线图 **P4**，设计见 `web-usage-cost-center.md` | 用量落库 + 价格表 |

**要不要引入 `react-router`：要。** `docs/research/penguin-web-skeleton.md` §3.1 说「现在不搬」，
前提写得很清楚是「Adelie 只有一个平级页面」—— rail 一来这个前提就不成立了。用声明式
`<Routes>`，顺带把 `/chat/:sessionId?` 深链与「草稿态」两个东西拿到手（现在做不到，`App.tsx`
在没有活动会话时由服务端先建会话再发消息）。

## 期望

分三期，每期都能单独上线、单独回滚：

1. **一期（纯前端，先看得见）**：引入路由 + 空壳 rail。五项先落成占位页（一句话说明它是什么 +
   依赖什么），把现有对话页搬到 `/chat`。验收：地址栏能改、刷新不丢、窄屏 rail 收成抽屉。
2. **二期（要动服务端）**：项目与智能体两个实体（`docs/api.md` 先改）+ 项目切换器 +
   会话列表按 Agent 分组（现在是一张平铺列表，多 Agent 后会糊成一团）。
3. **三期**：模型页 + 成本中心（= P4）。插件等 skills 面。

## 复现

```bash
cd packages/web && grep -rn "react-router" src | wc -l     # 0
grep -n "useState" src/App.tsx                              # 抽屉/设置/面板全靠 useState
```

## 影响

- 这是**结构性**改动（用户原话：「可能会让应用重构」）：`App.tsx` 要拆成壳 + 页面，
  状态要分家（现在全在 `useAdelie` 一个 hook 里）。
- 不做的话，后面每加一个功能都只能往设置对话框里塞一节 —— 设置会变成一张 20 屏的表单，
  而设置里**放不下**「列表 + 详情」这种形态（Agent 的九 tab、模型表、用量图都不是一节表单）。

## 证据

- `docs/research/penguin-web-skeleton.md` §1.1（路由表）、§1.2（页面三种挂法）、§2.2（设置 11 页）；
- `docs/research/penguin-web-models-ops.md` §0（「面 → 页面 → 服务端前缀」表，10 个面）；
- Adelie 现状：`packages/web/src/App.tsx`、`docs/web-parity.md` §1（agents 判「待办/远期」、
  plugins 判「远期」、models 批次 3、usage 批次 4 = P4、ui 无 router）。
