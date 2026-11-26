# 桌宠通话失败时，说的是这个窗口的语言

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `web`, `server`

[English](2026-11-26-pet-call-failure-words.md)

打不通的通话此前用错的语言说明原因，甚至不说原因。中继自己的那句话（语音服务以 HTTP 401 拒绝了连接）是服务端写的英文，中文窗口于是看到英文；传输层的兜底句是写死在代码里的中文，英文窗口于是看到中文；而在这两者之上，socket 的关闭原因又会被当成一句话写进舞台 —— 屏幕上只剩一个 `upstream`，把刚说过发生了什么的那句覆盖掉。

## 细节

- 通话的失败句子进了两本词典（`S.pet.callConnectFailed`、`callClosed`、`callServiceError`、`callServiceFailed`、`callUnreachable`、`callRejected(detail)`、`callNoMic`），在显示的地方读取，中文窗口与英文窗口各得各的。最常见的那条 —— 拿不到麦克风 —— 也在其中。
- 传输层（`realtime-client.ts`）不再自己造句：握手没成功就以带 `connect_failed` / `closed` 的 `RealtimeConnectError` 拒绝，由通话自己的模块（`call-failure.ts`）把它变成文案。
- 中继的 `proxy.error` 帧在原有一句话之外，带上 `code`（`upstream_rejected` / `upstream_unreachable`）与 `detail`（供应商的答复，如 `HTTP 401: …`），由页面据此组句。只认旧形状的客户端不受影响：那句话照旧显示。
- socket 的关闭原因不再上屏。它是中继或供应商给出的记号（`upstream`、`bye`）；已经说过原因的通话保留那句话，没说过的用页面自己的话（见 `closedCallText`）。
- 一次通话只报一次拒绝：握手被拒时上游 socket 也会结束，而一个在握手前就关掉的 `ws` 会另报一条错误 —— 那条更含糊的答复此前最后到达，成了第二条 `proxy.error`。

## 验证

- `packages/web/test/pet-call-failure.test.ts`（10 条）与 `pet-call-transport.test.ts`（4 条）钉住两种语言、两个代码、兜底与「关闭原因不上屏」；`packages/server/test/realtime.test.ts` 钉住帧里的 `code` / `detail`，以及只发一次拒绝。
- 真服务端 + 真浏览器，两个替身供应商（一个回 401，一个端口上什么都没有）：改前四种组合的舞台上都是 `upstream`；改后中文窗口是「语音服务拒绝了这次连接（HTTP 401: no）」/「连不上语音服务。」，英文窗口是 "The speech service refused the connection (HTTP 401: no)." / "Could not reach the speech service."，console 无错误。
