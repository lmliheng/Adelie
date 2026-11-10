# 被丢掉的响应体不再让整条命令崩掉

- **日期:** 2026-11-11
- **类型:** 修复
- **范围:** `cli`
- **破坏性变更:** 否

[English](2026-11-11-cli-discarded-body-cancel.md)

CLI 里有五处这样丢掉一个没人会读的响应体：`request()` 的空答复、`401` 后的换 token、`human_required` 重试的
两半，以及 `penguin server` 等监听器时每一下就绪探测。`cancel()` 在流**已经出错**时自己会拒绝 —— 连接中途
断掉、响应体已被超时中止 —— 而 CLI 没有装 `unhandledRejection` 处理，Node 的默认行为就此结束整个进程：
一条只想把响应体丢掉的命令，会死在自己的拒绝上，报错里还看不出是哪里。

这五处现在都走一个 `discardBody(res)`，把这个拒绝吞掉。服务端自己的丢弃点（`model-balance`、
`plugin-download`、`theme-download`、`proxy-probe`）一直是这么写的，CLI 的 SSE 读取器也是；漏掉的正是这五处。

窗口很窄 —— 丢弃紧跟响应头，流要在这一瞬间已经出错 —— 但不是空的：`401` 那条在响应到达与丢弃之间读一次
token 文件，`human_required` 重试那条在中间读一次克隆体。

## 验证

`test/discard-body.test.ts`（新增，4 条）与 `test/serve.test.ts` 里的一条，按「真正到进程的东西」来钉这些
丢弃点：出错的身体、正常取消的身体、没有身体的响应、`content-length: 0` 且身体已出错的 `request()`、以及
身体被留成出错状态的就绪探测 —— 它们都正常返回，而 `unhandledRejection` 监听器手里一条都没有。退回改前的
写法，其中两条正以这条逃逸变红。
