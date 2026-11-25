# stop hook 派生的游离会话不再在对话里留下一条智能体行

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `web`

[English](2026-11-26-detached-hook-child.md)

长 Task 结束后，最后一条回复下方有时会多出一条智能体行（写着「General Agent」与一小段 id），点开后智能体面板却是空的。

这条行是 stop hook 派生的那个游离会话。stop hook 以子智能体作答时，hook 循环把子会话的 Session id 写进 `hook` 事件，紧接着把子会话的 `session_meta` 发到父会话的流上（好让宿主登记这个 Session）—— 除此之外父会话的 Trace 里没有指向它的子智能体指针。Web App 的流模型给任何不认识的 origin 头都建一个嵌套模型，找不到可以绑定的 `run_subagent` 卡片时再补一条独立的子智能体项，那条行就是这么来的。

现在流模型记下 `stop` hook 事件点名的会话 id，并丢弃第一跳 origin 正是它的记录：对话里不再有那条行，也不再给它开嵌套模型。

## 细节

- `packages/web/src/lib/omni/stream-model.ts`：新增 `StreamModel.detachedChildren`（由 `handleEvent` 新增的 `hook` 分支从 `stop` 事件的 `output.session_id` 填入），`pushMessage` 的 origin 分支在 `routeNested` 之前先查它。
- `packages/web/test/stream-model.test.ts`：一条用例按 stop hook 作答后的记录顺序推进（`hook` 事件，再是带 origin 的子会话 `session_meta`），断言没有 `subagent` 项、`subagents` 里也没有它。

## 兼容

只改 Web App；服务端对子会话的登记不变，父会话的 Trace 既不重写也不换读法。

## 备注

hook 派生的子会话沿用这一轮的审批回调：在需要询问的审批档下，它的工具调用会等一个 Web App 里没有任何地方能答的审批 —— 这与本笔无关，先留着。
