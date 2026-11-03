# Agent 各分区的「启用」开关被拒时，原因留在卡片下面，不再只活六秒

- **日期：** 2026-11-03
- **类型：** 修复
- **范围：** `web`
- **不兼容变更：** 无

[English](2026-11-03-agent-switch-refusal.md)

Agent 设置的每个标签页都以一颗「启用」开关开头：记忆有自己的卡片，技能 / 密钥保险柜 / 定时任务 /
钩子共用一颗（`usePromptInjection`）。这些开关都不做乐观写入 —— 卡片显示的是服务端答回来的配置 ——
所以被拒之后开关静静地停在原处，解释只有一条六秒的通知。六秒过后，这个标签页看上去像「按了一下又自己
弹回去」，而这颗开关正是它下面整个功能的闸门：记忆会不会进入上下文、Agent 能不能读到密钥保险柜、
新会话要不要装配钩子。

现在那句话留在开关卡片下面，带 `role="alert"` —— 开关没动，它是唯一的解释 —— 并且点名**这一次**
想去的是哪一边（开关仍未移动，不说方向等于什么都没说）。它说的是功能自己的名词（「记忆」/「钩子」），
不是卡片上那个已经以「启用」开头的标签，免得一句话里说两遍「启用」。这句话留到下一次同一种写为止，
同一颗开关就是重试。

## 细节

- `packages/web/src/features/agents/feature-switch-refusal.ts`（新）：`featureSwitchRefused(noun,
  enabled, reason)` —— 功能、这次请求的方向、以及服务端给出的原话。两条代码路径画的是同一句话。
- `packages/web/src/lib/strings{,-en}.ts`：`agent.switchOnRefused` / `agent.switchOffRefused`，以及
  每张卡片标签旁边的名词（`memory.switchNoun` 与 `{skills,vault,schedule,hooks}.injection.switchNoun`）。
- `packages/web/src/features/agents/prompt-injection-controls.tsx`：一个 `switchRefusal` 状态，发出写
  请求时清掉、被拒时写上；那句话画在共享卡片的正下方。失败通知保留 —— 这一笔只是补上活得比它久的那一条。
- `packages/web/src/features/agents/memory-tab.tsx`：同样的状态与同样的一句话，画在记忆卡片下面；这颗
  开关在概览读完之前就已经画出来了，所以更需要一句话说明它为什么不动。

## 测试

- `packages/web/test/feature-switch-refusal.test.ts`（新，6 条）：两个方向、原话逐字透传、每个功能
  自己的名词（并断言没有重复标签里的「启用」）、当前界面语言。
- `packages/web/e2e/agent-switch-refusal.spec.mjs`（新，真服务端上两条）：配置写在 `page.route` 上
  被桩掉，一条测记忆卡片、一条测共享的技能卡片。被拒后卡片下面一条句子、通知区没有这条原因、开关没动，
  七秒后句子仍在；放开拒绝后再按同一颗开关就通过，句子归零。

## 兼容性

- 接口、请求与存储都没变：仍是同一个 `PUT …/agents/:id/config`，位置也照旧。变的只是「被拒之后画在
  哪里」—— 从只有一条通知，到卡片下面的一行字，通知因此不必再独自承担解释。
