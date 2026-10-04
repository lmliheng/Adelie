# Adelie HTTP / SSE 契约（v1）

四种形态共用这一个后端：`adelie` CLI 内部的会话、桌面壳里跑的服务器、浏览器里的 Web 应用、
手机上的 PWA —— 说的是同一套接口。**改动这里等于同时改四个形态**，所以先把它钉死再写代码。

- 服务端：`packages/server`（Node + Hono），默认 `127.0.0.1:7370`，`PORT` 可覆盖。
- 前端：`packages/web`（Vite 开发时把 `/api` 代理到 7370），构建产物由服务端静态托管。
- 传输：请求/响应用 JSON；对话流用 **SSE**（`text/event-stream`），不用 WebSocket —— 单向足够，
  且 `EventSource` 自带断线重连。

## 0. 认证与暴露面

单用户、本机优先，没有账号体系。

| 场景 | 规则 |
| --- | --- |
| 请求来自回环地址（127.0.0.1 / ::1），且 token 不是用户显式配的 | 放行，不需要凭证 |
| 远程请求，或 `ADELIE_TOKEN` 已显式设置 | 必须带凭证（回环也一样，用户说了要凭证就要） |
| 凭证怎么带 | `Authorization: Bearer <token>`，或 `?token=<token>`（EventSource 设不了请求头，手机 PWA 走这条路） |
| token 从哪来 | `ADELIE_TOKEN` 环境变量；没设时服务器启动时随机生成并打印一次（含带 token 的 URL） |

401 响应体固定为 `{ "error": "unauthorized" }`。手机 PWA 连局域网里的服务端时用带 token 的 URL。

## 1. 基本

```
GET /api/health   → 200 { "ok": true, "name": "adelie", "version": "0.1.0", "uptimeMs": 1234 }
```

## 2. 配置

```
GET /api/config → 200 {
  "workspace": "/abs/path",
  "provider": "deepseek",
  "model": "deepseek-chat",
  "baseUrl": null,
  "hasApiKey": true,
  "approvalPolicy": "auto-reject",
  "limits": { "maxIterations": 50, "maxTokens": null },
  "version": "0.1.0"
}

PATCH /api/config
  body: { "workspace"?: string, "provider"?: "deepseek"|"openai"|"kimi"|"qwen",
          "model"?: string, "baseUrl"?: string|null, "apiKey"?: string,
          "maxIterations"?: number, "maxTokens"?: number|null }
  → 200  同 GET 的形状
```

- 提供方只有这四个 id，它们同时也是 `adelie-core` 的模型目录（`config/model-catalog.ts`）
  里的组 id：端点、密钥环境变量、可选模型都写在那张表里，加一家厂商 = 加一组。
  `kimi` 是 Moonshot、`qwen` 是阿里云 DashScope 的兼容模式，两者都走
  `/chat/completions`，与 `openai` 同协议、只是端点与密钥变量不同。
  引擎不认识 `--base-url` 之外的厂商细节：`model` 一律作为裸字符串透传，不校验。

- `apiKey` 只写不读：写进 `<home>/.adelie/.env`，键名按提供方查模型目录
  （`DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `MOONSHOT_API_KEY` / `DASHSCOPE_API_KEY`），
  文件权限收到 **0600**（写下去的是明文密钥，同机其他用户不该读得到），
  响应里只回 `hasApiKey`。**任何响应体里都不出现密钥。**
- `workspace` 变更后，会话列表与新建会话都以新工作区为准。

```
GET /api/tools → 200 { "tools": [ { "name": "read_file", "description": "...", "requiresApproval": false } ] }
```

## 3. 会话

```
GET    /api/sessions                → 200 { "sessions": [ { "id", "workspace", "createdAt", "lastActiveAt", "taskCount", "title" } ] }
POST   /api/sessions                body { "workspace"?: string } → 201 { "session": {...} }
GET    /api/sessions/:id            → 200 { "session": {...}, "runs": [ RestoredRun ], "events": [ StoredSessionEvent ] }
DELETE /api/sessions/:id            → 204
GET    /api/sessions/:id/markdown   → 200 text/markdown（导出，见 core 的 renderSessionMarkdown）
```

`id` 不存在 → 404 `{ "error": "not_found" }`。

## 4. 对话（SSE）

```
POST /api/sessions/:id/messages
  body: { "text": "把 README 里的错别字改掉" }
  → 200 text/event-stream
```

事件（`event:` 名 + JSON data，逐条 `\n\n` 分隔）：

| event | data | 说明 |
| --- | --- | --- |
| `run_started` | `{ "runId": "...", "task": "..." }` | 这一轮开始 |
| `delta` | `{ "kind": "content"\|"reasoning", "text": "..." }` | 模型增量，原样转发自 `onStreamDelta` |
| `event` | `{ "type": "<SessionEventType>", "payload": {...}, "timestamp": 123 }` | 运行时的状态迁移事件（decision / observation / plan_updated / approval / stopped / verification / context_folded） |
| `approval_request` | `{ "actionId": "...", "action": PendingAction }` | 需要人工拍板，等第 5 节的决定 |
| `run_finished` | `{ "runId", "stopReason", "verification", "usage": { promptTokens, completionTokens, totalTokens }, "fileChanges": [...], "iterations" }` | 这一轮结束 |
| `error` | `{ "message": "..." }` | 运行之外的失败（装配、provider 构造）。运行期失败由 `run_finished.stopReason` 表达 |
| `done` | `{}` | 流结束标记，客户端据此收尾 |

- 运行时的 `task_started` 事件不单独转发（它就是 `run_started`）；其余事件类型原样出现在 `event` 帧里。
- 同一条会话同时只能有一轮在跑：再发 → 409 `{ "error": "busy" }`（删除正在跑的会话同样是 409）。
- `POST /api/sessions/:id/cancel` → 202，中止当前轮。收尾原因为 `user_interrupted`
  —— core 的 `StopReason` 里没有 `cancelled` 这一项，这是语义对应的那个。取消在**下一个循环边界**生效：
  此刻若正卡在一次模型请求或工具执行上，要等它返回才停下来。
- 审批超时（默认 5 分钟）按拒绝处理，`approval_request` 之后仍会收到 `event`/`approval` 记录。

## 5. 审批

```
POST /api/sessions/:id/approvals
  body: { "actionId": "...", "decision": "approve" | "deny", "remember"?: false }
  → 200 { "ok": true }
```

- `actionId` 不匹配（已超时 / 已决定）→ 409 `{ "error": "stale_approval" }`。
- 决定同时写进会话事件流（`approval` 事件），所以 trace 能回答「谁在什么时候批准了什么」。

## 6. 关停

```
POST /api/shutdown → 202 { "ok": true }
```

先回响应，再优雅关停（停止接收新连接、等在跑的轮次落盘、退出进程）。**非回环地址一律 401**，
即使 token 有效 —— 这是一个只给本机用的逃生口。

为什么要它：Windows 上 Electron 的 `child.kill()` 是硬终止，而会话事件是追加写的，
硬杀会把最后一条事件截成半行。桌面壳因此走「先请求优雅关停，超时再杀」。

## 7. 静态资源

- `GET /` 与任何非 `/api/*` 路径 → Web 构建产物（SPA：找不到文件回落到 `index.html`）。
- 构建产物目录：`ADELIE_WEB_DIST` 覆盖；否则按 `packages/web/dist` 找。

## 8. 错误

所有错误都是 JSON：`{ "error": "<code>", "message": "<人读的话>" }`。
已知 code：`unauthorized` / `not_found` / `busy` / `stale_approval` / `bad_request` / `internal`。
