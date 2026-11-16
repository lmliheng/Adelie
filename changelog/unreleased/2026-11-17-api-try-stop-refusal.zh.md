# 停止没送到服务器时，原因留在仍是重试的那颗按钮下面

- **Date:** 2026-11-17
- **Type:** fix
- **Scope:** `web`, `docs`

[English](2026-11-17-api-try-stop-refusal.md)

API 标签页的**试一试**经会话的中止路由停下一次运行，而它背后那句 `catch` 只弹了一条六秒后自己消失的通知：
服务器出错时面板与按之前一模一样 —— 运行照旧，**停止**按钮还在原处 —— 屏幕上没有一个字说这一按没送到。
六秒后连通知也没了，屏幕读起来就像什么都没按过。

现在没被服务器接下的停止，把原因写在同一颗按钮下面：按的是什么（停下这次运行）、它没有生效（运行仍在继续），
以及为什么 —— 用界面自己的说法，从不吐线上英文。按钮留着，再按一次就是重试。这句话在运行继续写行的时候一直
在，事件流结束时就收走，不会比它说的那次运行活得更久。404 什么也不说：会话本身已经不在了，运行也随之结束，
再说一句只会比它解释的事活得更久。

## 细节

- `packages/web/src/features/agents/api-try-log.ts`：`TryState` 多一个 `stopRefusal`，reducer 多一个
  `stopRefused`（并在 `start` 与 `ended` 时清掉这句），新增的 `stopFailed(err)` 返回说出它的那个动作 ——
  404 返回 `null` —— 与拒绝的决定所用的 `approvalAnswerFailed` 同一个形状。
- `packages/web/src/features/agents/api-try-panel.tsx`：句子画在输入框那一排按钮下面（`role="alert"`、
  `data-testid="api-try-stop-refusal"`、危险色、最多两行、整句在悬停里），`onStop` 改为派出这个动作，不再
  弹通知。
- 文案 `agent.apiTryStopRefused(reason)` 中英各一条。
- 文档：`agent-api.zh.md` / `agent-api.en.md` 的「试一试」一节说明停止没送到服务器时是什么样子。

## 测试

- `packages/web/test/api-try-log.test.ts` 加 2 条：句子用界面自己的说法（从不含线上英文）、画在仍立着的
  停止按钮下面、后续负载不会把它冲掉、事件流结束与新一次运行时清掉；以及 404 根本不产生动作。
- `packages/web/e2e/api-try-stop-refusal.spec.mjs`（新，2 条，真服务端 + 仓库自带 mock 模型，用 mock 的
  慢速提示词让运行一直跑着）：把中止 POST 拒成 500 `internal` → 句子在**停止**下面、说运行仍在继续、从不
  含线上英文、没有通知、四秒后仍在，随后同一颗按钮把中止交上去、句子随事件流的 `run.done aborted` 一起
  收走；以及 404 时面板一句话都不说。

## 兼容性

只动前端状态、文案与文档，接口、线上格式与已存数据都没变。
