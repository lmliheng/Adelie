# 网络面板的事件流页能读到服务端写了什么

- **日期：** 2026-11-27
- **类型：** 新功能
- **范围：** `server`, `web`

[English](2026-11-27-network-stream-writes.md)

对话侧边栏「网络」面板在一条流的「事件流」页上画两个数：服务端写出了多少、浏览器收到了多少。后一个来自本页自己的记录，前一个写着「未采集」，并注明「随后续版本补上」——于是一条安静下来的流提出的那个问题没有答案：是没写，还是写了没送到。

现在服务端记下自己写出的每一帧。页面打开流的时候用一个 `requestId` 查询参数给这条连接起个名字（`EventSource` 设不了请求头），这个 id 下写出的每一帧都连事件名、SSE id、字节数与时刻一起记下。面板打开这一页时读回来，连接还在写的时候按时重读，所以读者盯着的是一条数会动的流。

这个数是记录能担保的下限，不是猜的：记录的头被服务端的环形挤掉时会写明丢了几帧，并且不再拿它跟浏览器那一侧做比较；浏览器那一行的计数还没结算时也不比。

## 细节

- `packages/server/src/services/stream-writes.ts`（新）：内存里的有界环，最近 50 条连接，每条保留最近 500 帧并记下挤掉的条数；被挤掉的连接不会被后续写入复活（只剩尾巴的记录会被读成整条）。不落盘。
- `packages/server/src/http/sse.ts`：认 `requestId` 查询参数，写出每一帧时记账（心跳也算），连接起止各盖一个时刻。
- `packages/server/src/http/routes/sessions.ts`：`GET /api/sessions/:sessionId/stream-writes?requestId=`，只答这个会话自己的读者；`record: null` 就是「这个 id 下什么都没采到」。
- `packages/web/src/api/sse.ts` 用网络面板自己那一行的请求号给连接命名；`api/endpoints.ts` 读回记录；`features/network/stream-write-view.ts`（纯逻辑）把它化成条数、差额与相对连接开始时刻的行（两个时钟，所以不画绝对时间）；面板画出条数、两句差额、一句部分记录说明，以及新的在上的帧列表。
- 用例：`packages/server/test/stream-writes.test.ts`（环的语义，以及从真流读回来、别的用户读不到）、`packages/web/test/stream-write-view.test.ts`、`packages/web/e2e/network-panel.spec.mjs` 多一条。

## 兼容

新增一个只读接口；既有流的协议没变，没起名字的流不产生记录（CLI 与 Agent 自己的工具不受影响）。没有新依赖；记录只活在内存里，重启即清空，面板会写明这一点。
