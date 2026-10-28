# 取消的 AMSP 消息流当场停住，缓存的事件也不再交付

- **Date:** 2026-10-28
- **Type:** fix
- **Scope:** `amsp`
- **Breaking:** no

[English](2026-10-28-amsp-cancel-buffered-events.md)

移植自 PenguinHarness `ca7114a2`（`#1326`）。

`readSse`/`sseData` 只在从网络拉到一个数据块之后才看 abort 信号。于是在自己循环体里取消的调用方
（循环体正好在生成器挂在 `yield` 时运行）要等到下一个数据块到达才被发现，而当前数据块里已经解析出来的事件
照样交付。跟在最后一条事件后面的 `[DONE]` 会把这次读取平静地结束掉 —— 于是 `AgentClient` 把调用方已经取消的
run 报成 `completed`，取消之后的那些事件也还是送到了调用方手上。

现在每交付一条事件之后立刻检查信号。下一次读取会在处理下一个缓存事件之前，用调用方自己的取消原因抛出去；
`AgentClient` 在它的读取循环无错结束时再检查一次信号：取消的 run 永远不会被报成完成。构造参数、线上记录、
磁盘格式与端点都没变；读到结尾的流与以前完全一致。

## 细节

- `packages/amsp/src/sse.ts`：`yield event` 之后 `if (signal?.aborted) throw signal.reason` ——
  挨着 `reader.read()` 的那次检查看不到生成器挂起期间发生的取消，而调用方的循环体恰好在那一刻运行。
- `packages/amsp/src/client.ts`：`AgentRun.#drive` 在读取循环之后、`collector.result()` 之前检查
  `control.signal.aborted` —— 缓存的 `[DONE]` 让循环不带任何错误地结束，既有的 `catch` 根本看不到它。
- `packages/amsp/test/sse.test.ts`：两条取消用例（同一数据块两条事件之间取消、缓存 `[DONE]` 之前取消），
  外加一条契约守卫：正文最后一条事件交付之后取消，下一次读取仍要抛。
- `packages/amsp/test/client.test.ts`：一个数据块里同时带 `run.done` 与 `[DONE]`，在循环体里取消 ——
  迭代与 `result()` 都以 `signal.reason` 拒绝。

## 兼容性

- 不改依赖、接口、线上协议与已存数据。流正常结束之后才发生的取消仍不会撤销已完成的 run；
  只有落在流结束之前的取消，现在优先于它恰好走到的那个结果。
