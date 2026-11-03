# 插入占位符被拒时，原因留在那条提示条下面，不再只活六秒

- **日期：** 2026-11-03
- **类型：** fix
- **范围：** `web`
- **破坏性：** 无

[English](2026-11-03-placeholder-insert-refusal.md)

Agent 设置的记忆页与技能 / 密钥保险柜 / 定时任务各页顶上，在提示词模板还缺占位符时都有一条提示条，
条上那颗按钮请服务端把占位符写进模板。写没落地之前页面上什么都不动，所以被拒之后模板照旧没有占位符、
提示条和那颗按钮都还在 —— 而原因此前只进一条六秒的通知。六秒之后提示条看上去像没被按过；这一处还
不只是个设置写：它是整个功能接进上下文的那条路（记忆进不进上下文、技能与保险柜小节在不在、定时任务
小节在不在）。

现在原因留在提示条正下方，按的是那颗按钮自己的措辞（旧版模板的按钮是「迁移」，句子就说「迁移为」而
不是「插入」），点明是哪一个占位符（四个小节共用这句话），并带上服务端给出的原话，留到下一次插入为
止 —— 提示条上那颗按钮就是重试。

## 细节

- `packages/web/src/features/agents/placeholder-insert-refusal.ts`（新）：
  `placeholderInsertRefused(token, legacy, reason)` —— 占位符 token、这一次按的是「插入」还是
  「迁移」、服务端原话。
- `packages/web/src/lib/strings{,-en}.ts`：`agent.placeholderInsertRefused` /
  `placeholderMigrateRefused` 两对句，以及四处 `placeholderToken`（记忆、技能、保险柜、定时任务各一个，
  写在它自己那条提示条与按钮的文案旁边）。
- `packages/web/src/features/agents/memory-tab.tsx` 与 `prompt-injection-controls.tsx`：各一个
  `insertRefusal` 状态（发出写时清掉、被拒时写上），句子画在提示条下面（`role="alert"`、危险色、
  限两行）。失败通知保留 —— 本笔补上一条活得更久的说法，没有撤掉任何一条。

## 测试

- `packages/web/test/placeholder-insert-refusal.test.ts`（新，5 条）：插入与迁移两种措辞、四个小节各有
  自己的 token、原因原样带过去（含服务端自己的标点）、跟着界面语言走。
- `packages/web/e2e/placeholder-insert-refusal.spec.mjs`（新，真服务端两条）：先把 Agent 的提示词模板
  换成不带占位符的纯文本（否则默认模板里什么都有、提示条根本不出现）；记忆页与技能页各一条 —— 被拒后
  提示条下面恰好一句、提示条与按钮都还在、通知区没有可点的条目、七秒后句子仍在；放开拒绝再按同一颗
  按钮，句子和提示条一起消失、模板里有了占位符。

## 兼容

- 接口、请求与存储都没变：还是那四个 `POST …/{memory,skills,vault,schedules}/template-placeholder`。
  改变的只有被拒之后画在哪里 —— 从「只有一条通知」到「提示条下面多一条活得下去的说法」。
