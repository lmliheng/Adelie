---
title: "web: 输入区要有控件带（附件 / 权限 / 技能 / 上下文 / 思考等级 / 模型切换）"
labels: [欠账, scope:web, P2]
---

## 现象

Adelie 的输入区（`packages/web/src/components/Composer.tsx`）现在只有三样东西：
自增高的 `textarea`、一行提示（Enter 发送 / Shift+Enter 换行）、一个发送键。
「这轮任务用什么条件跑」全部要跑到设置对话框里去改，改完是**全局**的，不是这一轮的。

penguin 的输入卡是「multiline textarea + **单行**控件带：附件 · 审批模式 ｜ 上下文环 · 模型 · 发送」，
外加 `/` 斜杠命令（`/compact`、`/model`、`/agent` 与每个已装技能一条），
`/model` 与 `/agent` 是**暂存**语义（变成输入框上方的 chip，Enter 时才生效）。

## 设计

六件，按「能不能只用现有接口做出来」排序；每件都给最小版。

| 控件 | 最小版 | 依赖 |
| --- | --- | --- |
| **模型切换** | 输入区右侧一个选择器（现在是设置里的下拉），**同家换型号**直接生效；跨家换要新开会话（penguin 是先压缩再换，Adelie 没有压缩路由） | `PATCH /api/config` 已有 |
| **权限** | 一个下拉改三档审批策略（`always-ask` / `read-only` / `allow-all`） | `GET /api/config` 已回 `approvalPolicy`；要加 `PATCH` 字段与三档语义 |
| **上下文占用** | 输入区右侧一个圆环，点开显示构成（系统提示 / 历史 / 工具结果 / 本轮） | 服务端要有**会话级** token 累计（`web-usage-cost-center.md` 一期顺带做） |
| **思考等级** | 三档（关 / 中 / 高），只影响下一轮；按 provider 能力过滤（不支持的档置灰并给原因，不隐藏） | 契约要先定「等级」落在哪：provider 请求参数（`reasoning_effort` 这类）还是提示词前缀。**这项要先拍板** |
| **附件（图片 / 文件）** | 粘贴图片 + `+` 菜单选文件；随任务一起发，服务端写进 scratchpad 并在任务文本后补 `[attached file: …]` | 契约加一条上传/随消息带文件的路由；Adelie 现在**没有** `/api/files` |
| **技能** | 一个多选面板，列出 `skills/*/SKILL.md`（读 frontmatter 的 name/description）；**选择顺序即发送顺序** | 技能目前只存在于 agent 的目录约定里，没有服务端列表路由 |

后置：`/compact`（没有压缩路由）、`/agent`（没有 Agent 实体，见 `web-left-rail-navigation.md`）、
技能选择面板的拖拽排序。

**排布**：`≥700px` 一行（左：附件 + 权限；右：上下文环 + 思考等级 + 模型 + 发送）；
`<700px` 折两行，低频项（思考等级、技能）收进 `+` 菜单 —— 这条与 `web-mobile-layout.md`
是同一件事的两面，别分开设计。

## 期望

一期（只用现有接口）：模型切换 + 权限 + 每轮统计行加成本。
二期（要服务端）：上下文环、附件。
三期：思考等级（先拍板语义）、技能选择。

## 复现

```bash
sed -n '52,118p' packages/web/src/components/Composer.tsx   # 输入区的全部内容
grep -rn "approvalPolicy" packages/web/src packages/server/src   # 只读，没有任何写入口
grep -rn "api/files\|attachment" docs/api.md                     # 0 命中
```

## 影响

- 每轮任务的「怎么跑」现在只能全局改：想临时用强一点的模型、临时放开审批，都要改设置再改回来。
- 附件不做，遇到「这张报错截图你看一下」「这个 csv 分析下」这类最常见的请求就没法用。
- 上下文环不做，用户无法判断「是不是快满了、要不要新开会话」—— 长会话的成本与质量都受影响。

## 证据

- `docs/research/penguin-web-chat-workspace.md` §1 的「输入卡」「斜杠命令」「模型选择」「上下文环」
  四行 + §7 的最小可移植版本（斜杠命令、每轮统计行、审批模式三处）；
- `packages/web/src/components/Composer.tsx`（现状）、`packages/web/src/components/SettingsDialog.tsx`
  （模型与预算现在只能在设置里改）；
- `docs/api.md` §2（`approvalPolicy` 只读）、§4（消息路由，无附件字段）。
