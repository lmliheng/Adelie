# 子 Agent 面板里的停止没送到服务器时，原因留在那个输入框上方

- **Date:** 2026-11-18
- **Type:** fix
- **Scope:** `web`, `docs`

[English](2026-11-18-subagent-stop-refusal.md)

智能体面板里子 Agent 输入框上的**停止**，是这个面板自己那条中止路由上的一次请求，而它背后那句
`catch(() => undefined)` 把失败整个吞掉了：服务器出错时面板与按之前一模一样 —— 子会话照旧在跑，同一颗
**停止**按钮 —— 屏幕上没有一个字，连主输入卡上的停止过去还会弹的那条六秒通知都没有。

现在没被路由接下的停止，把原因写在那个输入框上方，用面板自己的说法（这句话紧挨着父对话的输入卡，所以它说清
楚是哪一个运行还在继续）。什么都没停下，所以同一颗**停止**按钮留着，再按一次就是重试；这句话跟这次运行同生
共死 —— 子会话一回到空闲就收走，而不是等某个计时器。404 什么也不说：那是父会话不在了，那句话说的运行也随之
结束。（路由的 204 也不是拒绝：它说已经没有可中止的运行，正是这一按想要的结局。）

## 细节

- `packages/web/src/features/chat/subagent-send-refusal.ts`：新增 `subagentStopRefused(err)`，返回
  `string | null` —— 404 返回 `null` —— 与主输入卡的 `stopRefusalLine` 同一条规则。模块头注释改成覆盖落在这
  个输入框上的两种按压。
- `packages/web/src/features/chat/subagents-view.tsx`：`SubagentComposer` 多一格 `stopRefusal`，子会话的运行
  回到空闲时清掉（与 chat page 用的是同一个 effect），下一次按压也清掉；`onStop` 不再吞掉失败，而是把原因
  落进这一格；句子画在输入框上方、拒绝的发送旁边（`role="alert"`、`data-testid="subagent-stop-refusal"`、
  危险色）。
- 文案 `subagentPanel.stopRefused(reason)` 中英各一条。
- 文档：`chat.zh.md` / `chat.en.md` 讲子 Agent 的那一条补一句。
- `packages/web/e2e/mock-llm.mjs`：新增「slow subagent test」触发词，派下去的子会话自己那一轮跑前台
  `sleep 45`，所以用例按停止时它仍在跑。

## 测试

- `packages/web/test/subagent-send-refusal.test.ts` 加 5 条：句子点名这一按、说运行仍在继续、用错误码自己的
  说法（不含线上英文）、404 什么都不产生、请求没送到时保留错误自己的话、无话可说时用通用句子、跟着界面语言。
- `packages/web/e2e/subagent-stop-refusal.spec.mjs`（新，2 条，真服务端 + 仓库自带 mock 模型）：把中止 POST
  拒成 500 `internal` → 句子在子会话输入框上方、说它仍在继续、从不含线上英文、没有通知、四秒后仍在、两个主
  输入卡的槽位都没被占用；随后同一颗按钮把中止交上去，句子随运行回到空闲一起收走。以及 404 时一个字都不说、
  **停止**仍在原处。

## 兼容性

只动前端状态、文案、测试用的 mock 与文档，接口、线上格式与已存数据都没变。
