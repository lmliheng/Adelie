# adelie-server

Adelie 的后端：会话存储、SSE 对话流、工具审批、Web 产物托管。契约是仓库根下的
[`docs/api.md`](../../docs/api.md)，本包只实现它，不发明第二套形状。

四种形态（CLI 里的会话、桌面壳里的服务器、浏览器 Web、手机 PWA）共用这一套接口。

## 起服务

```bash
# 开发（源码直跑，改动即重启）
pnpm --filter adelie-server dev

# 构建 + 生产
pnpm --filter adelie-server build
node packages/server/dist/main.js
```

默认监听 `127.0.0.1:7370`。

| 环境变量 | 作用 |
| --- | --- |
| `PORT` | 监听端口，默认 `7370`（给 `0` 由系统分配） |
| `ADELIE_HOST` | 监听地址，默认 `127.0.0.1`。填 `0.0.0.0` 时会给所有请求生成一个随机 token |
| `ADELIE_TOKEN` | 显式指定 token；设了它，连回环请求也要带凭证 |
| `ADELIE_WEB_DIST` | 覆盖前端构建产物目录 |

启动时会打印监听地址与 token（有 token 时直接给一条带 `?token=` 的 URL，手机/PWA
拿那条 URL 就能连）。

## 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, name, version, uptimeMs }` |
| GET | `/api/config` | 当前工作区 / 提供方 / 模型 / `hasApiKey` / 限额 |
| PATCH | `/api/config` | 改工作区、提供方、模型、`baseUrl`、密钥、限额；`apiKey` 只写不读 |
| GET | `/api/tools` | 工具清单（名字、描述、是否需要审批） |
| GET | `/api/sessions` | 当前工作区的会话列表 |
| POST | `/api/sessions` | 建会话（`workspace` 可选）→ 201 |
| GET | `/api/sessions/:id` | 会话详情：`{ session, runs, events }` |
| DELETE | `/api/sessions/:id` | 删会话 → 204（正在跑的那条先取消或等它结束） |
| GET | `/api/sessions/:id/markdown` | 事件流导出为 Markdown |
| POST | `/api/sessions/:id/messages` | 发一条消息 → `text/event-stream` |
| POST | `/api/sessions/:id/cancel` | 中止当前这一轮 → 202 |
| POST | `/api/sessions/:id/approvals` | 审批决定 `{ actionId, decision: approve\|deny }` |
| POST | `/api/shutdown` | 优雅关闭 → 202 `{ ok: true }`（**仅回环地址可调用**，否则 401） |

错误一律是 JSON：`{ "error": "<code>", "message": "<人读的话>" }`，已知 code 为
`unauthorized` / `not_found` / `busy` / `stale_approval` / `bad_request` / `internal`。
唯一的例外是 401：契约要求它的响应体「固定」，所以只有 `{ "error": "unauthorized" }`。

### SSE 事件

`run_started` → `delta`* / `event`* / `approval_request`* → `run_finished` → `done`。
`event` 承载运行时的状态迁移（`decision` / `observation` / `approval` /
`plan_updated` / `context_folded` / `stopped` / `verification`）。

同一条会话同时只能跑一轮：再发一条返回 409 `busy`。

### 取消与审批

- `POST /cancel` 把该轮的停止原因写成 `user_interrupted` 并结束这一轮；没有在跑的
  轮次时也回 202（幂等）。
- 审批超时（运行时默认 5 分钟）按拒绝处理，`actionId` 会被清掉；重复决定或用过期
  的 `actionId` 一律 409 `stale_approval`。决定本身由运行时写进 `approval` 事件。
- 客户端断开 SSE 连接会中止本轮运行（不会让一个看不见的循环继续烧 token）。

## 认证

| 场景 | 规则 |
| --- | --- |
| 请求来自回环地址，且没有显式设置 `ADELIE_TOKEN` | 放行 |
| 绑定了非回环地址，或设置了 `ADELIE_TOKEN` | 必须带 `Authorization: Bearer <token>`（或 `?token=<token>`） |

静态资源不设认证：浏览器得先拿到应用外壳，才有机会在后续请求里带上 token。
`POST /api/shutdown` 额外要求请求来自回环地址 —— 远程客户端拿着有效 token 也不能
关掉服务。

## 静态托管

查找顺序：

1. `ADELIE_WEB_DIST`（指不到目录时按「没有前端」处理，不回退）；
2. `packages/web/dist`（相对本包定位，源码与构建产物两种跑法都指得对）。

命中文件就回文件；无扩展名的路径在请求要 HTML 时回落 `index.html`（SPA 路由）。
两者都没有时，`/` 与其它非 `/api/*` 路径回一页说明（200），`/api/*` 照常工作。

## 测试

```bash
pnpm --filter adelie-server typecheck
pnpm --filter adelie-server test
```

集成测试会真的起一个 http 服务，注入一个脚本化的假 provider（不发起网络请求），
用临时目录当工作区与会话根，把建会话、SSE、审批、取消、回放、401/404/409 以及
优雅关闭都走一遍。
