# 离开模型流时取消上游请求

- **Date:** 2026-10-28
- **Type:** fix
- **Scope:** `core`
- **Breaking:** no

[English](2026-10-28-llm-stream-cleanup.md)

移植自 PenguinHarness `aff7ee37`（`#1354`）。

`GenerativeModel.streamGenerate()` 把一次请求变成一条消息流。调用方在响应结束之前就不再读的（引擎放弃这一轮、
消费者从循环里跳出、请求抛错或超时），过去会留下两样东西：这次请求自己的 `AbortController` 没有被 abort，
上游的迭代器也从没关过。于是厂商继续往一个没人读的流里生成（也继续计费），连接一直挂到厂商自己写完为止。

现在**在响应的 stop 事件之前**离开的每一条路径都会取消请求、并让迭代器关掉。已经报过 stop 的响应不动：
那一轮已经提交并入账，传输层可能还在读流的结尾。清理是尽力而为 —— 上游的 `return()` 抛错、被拒或永不落地，
都不能改变这次的结果、也不能把调用方挂住。这正是引擎自己的中断路径本来就期望的「已 abort 的请求」，
只是现在不必再等别人替它做。

## 细节

- `packages/core/src/llm/generative-model.ts`：把上游迭代器提到 `try` 之外
  （`let it: AsyncIterator<UniEvent> | undefined`），`finally` 在清掉空闲计时器、摘掉 abort 监听之后，
  **只在翻译器没有见到结束原因时**调用 `ac.abort()` 与
  `void Promise.resolve(it?.return?.()).catch(() => undefined)`。「上游永不落地」那一支（`res === STOPPED`）
  不再自己关迭代器，统一交给 `finally` 处理，于是每一条出口都只关一次。本树的翻译器没有 `stopped`
  这个读取口（那是上游更晚的一笔带来的），守卫用等价的 `sawFinishReason()`。
- `packages/core/test/llm.test.ts`：三条生命周期用例 —— 消费者提前离开、用户在生成器挂在 `yield` 时中断、
  以及「已经收到 stop 的请求不许动」—— 外加三条清理失败（`throw` / `reject` / `hang`）仍要让调用方走得掉。
  本地化：本树的 `UniEvent` 词汇是 `{ type: "text" }` 条目加一个显式 `stop` 事件，而且本树的循环会一直拉到
  `done`（上游是在 stop 处 break），所以「不许动」那条改成断言「没有发出 `return()`、信号没被 abort」，
  而不是「生产者的 `finally` 从来不跑」。

## 兼容性

- 不改依赖、不改接口、不改磁盘格式与协议：仍是同一个端点上的同一个请求；调用方离开时，连接现在会被关掉，
  而不是留在那里继续流。正常读完的请求与以前完全一致，用量也不变。
