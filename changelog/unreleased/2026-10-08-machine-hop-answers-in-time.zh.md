# 机器：通往机器的这一跳在浏览器放弃之前作答

- **Date:** 2026-10-08
- **Type:** fix
- **Scope:** `server`

[English](2026-10-08-machine-hop-answers-in-time.md)

本服务器转发给机器的请求（`/server/<id>/api/…`），在那台机器不服务时不再无限等待。机器上的 server
没有在监听时，请求立即失败并说明原因；ssh 会话停住时，请求在 8 秒内失败，并点名是 SOCKS 那一层；
机器收下连接却不作答的读请求，15 秒后得到 504。此前这些请求可能一直得不到答复：浏览器 20 秒后放弃并
重发，而重发的请求同样挂住，直到 Chromium 对所有新请求都报 `ERR_INSUFFICIENT_RESOURCES`。本次从上游
PenguinHarness 移植（分支 `fix/machine-hop-answers-in-time`，提交 `a2801c8d`），此前本 fork 没有这一条。

## 细节

- 到机器的每一条 TCP 连接，都是经 ssh 会话 `-D` 端口发起的一次 SOCKS CONNECT。远端端口上无人监听时，
  OpenSSH 不回失败码，而是直接关闭连接。拨号此前不处理「应答之前连接被关」，握手计时器又随 socket
  一起停掉，所以拨号永不落定。现在它立即以「会话在应答之前关闭了到 127.0.0.1:<port> 的通道——那边没有
  在监听，或者会话正在断开」失败（英文原句见英文版），转发出去的请求把这句原话带回浏览器
  （`server_unreachable`，502）。
- SOCKS 握手期限改为 8 秒（原为 20 秒）。会话停住时，现在以「the session's SOCKS handshake timed out」
  失败，早于代理自己的期限，也远早于浏览器的 20 秒。
- 转发的 `GET` 或 `HEAD` 在 15 秒内（含拨号）收不到响应头时，以 `504 machine_not_answering` 作答：
  上游请求被放弃，机器列表的 `api` 事实记下这次失败。写请求不截断：写可能合法地慢，截断后浏览器重发
  会重复它的副作用。
- 已经开始的答复不受影响：响应头一到，响应体照常以流的形式传回，没有期限。
- 本 fork 的转发只有一条路径（代理这一处），所以这份移植落在 `machines/proxy.ts` 与
  `machines/transport/socks.ts`；上游同时改到的中继层不在本树里。
