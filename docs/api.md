# Adelie HTTP / SSE 契约（v1）

四种形态共用这一个后端：`adelie` CLI 内部的会话、桌面壳里跑的服务器、浏览器里的 Web 应用、
手机上的 PWA —— 说的是同一套接口。**改动这里等于同时改四个形态**，所以先把它钉死再写代码。

- 服务端：`packages/server`（Node + Hono），默认 `127.0.0.1:7370`，`PORT` 可覆盖。
- 前端：`packages/web`（Vite 开发时把 `/api` 代理到 7370），构建产物由服务端静态托管。
- 传输：请求/响应用 JSON；对话流用 **SSE**（`text/event-stream`），不用 WebSocket —— 单向足够，
  且 `EventSource` 自带断线重连。

## 0. 身份与暴露面

这台机器上可以有几个人：一个**主机管理员**，以及管理员建出来的若干**账号**。每次请求
「是谁」由 `packages/server/src/identity.ts` 一次算清，放进 `c.get('identity')`。

三种进门的方式，按优先级：

| 顺序 | 凭证 | 结果 |
| --- | --- | --- |
| 1 | Cookie `adelie_session`（HttpOnly，登录时下发，30 天） | 某个账号 |
| 2 | `Authorization: Bearer <token>`，或 `?token=`（EventSource 设不了请求头，手机 PWA 走这条） | 主机 token → 主机管理员；登录令牌 → 某个账号 |
| 3 | 请求来自回环地址（127.0.0.1 / ::1），且这台机器**没显式配** token | **主机管理员** |

第 3 条是这套设计里唯一的公理：**能读到 `~/.adelie` 的人就是管理员**。桌面壳的窗口、
`adelie serve` 之后本机浏览器打开的那一页走的都是它 —— 于是单机用户永远看不到登录界面。
它同时也意味着，多操作系统用户的机器上别人的浏览器也能访问这个回环端口。设
`ADELIE_TOKEN` 就关掉这条路：那时所有请求（本机也算）都必须带凭证，唯一的豁免是
`/api/auth/*`（取得身份的入口，堵上它等于把所有人锁在门外）。

Token 从哪来：`ADELIE_TOKEN` 环境变量；没设时服务器启动时随机生成并打印一次（含带 token 的 URL）。

**路由权限表**（前缀 → 要求，最长前缀优先；代码里是数据，判定只在一个中间件里，
不散在各 handler 的 `if (user.isAdmin)` 中 —— 散开之后加一条路由忘了判断就是一次越权）：

| 前缀 | 要求 |
| --- | --- |
| `/api/health`、`/api/auth/*` | `none` |
| `/api/users`、`/api/shutdown` | `admin` |
| 其余 `/api/*` | `user`（要登录 —— 默认拒绝，新增路由忘了登记的结果是「要登录」而不是「对所有人敞开」） |

| 状态码 | 响应体 | 什么时候 |
| --- | --- | --- |
| 401 | `{ "error": "unauthorized" }` | 没有身份 |
| 403 | `{ "error": "admin_required", "message": "这个操作需要管理员" }` | 有身份，但这一档不够 |

两者必须分开：混成一个 401 会让界面把「你没权限」显示成「请重新登录」，用户会一直重登。

静态资源（`/`、`/assets/*`）**公开**：浏览器要先拿到应用外壳，才谈得上登录。认证只罩 `/api/*`。

## 1. 基本

```
GET /api/health   → 200 { "ok": true, "name": "adelie", "version": "0.1.0", "uptimeMs": 1234 }
```

身份这一组是唯一能拿到身份的地方，所以它们自己不要求身份（§0 的表里是 `none`）：

```
GET  /api/auth/me       → 200 { "authenticated": true, "user": {
                                "kind": "host"|"user", "name": "本机"|"alice",
                                "isAdmin": true, "id": "…"|null, "hasPassword": true } }
                        （匿名 → 200 { "authenticated": false }，**不是** 401：
                          界面靠它决定显示登录页还是主界面，它也就不该是一次报错日志）
POST /api/auth/login    body { "name": "alice", "password": "…" }
                        → 200 { "user": {…} } + Set-Cookie: adelie_session=…（HttpOnly、SameSite=Lax、30 天）
                          用户不存在与口令不对返回**同一个** 401（区分开等于送对方一个账号枚举器）
POST /api/auth/logout   → 204（Cookie 与同一个 Bearer 令牌一起作废 —— 那个令牌既能当
                          Cookie 也能当 Bearer，只清 Cookie 等于「退出」之后它还活着）
POST /api/auth/password body { "current"?: "…", "password": "…"|null } → 200 { "user": {…} }
                          改自己的口令（`null` 清空）；账号已有口令时必须给对 `current`。
                          **改口令会作废该账号的所有登录令牌**（服务端顺手删 auth_sessions）
```

用户管理整片是管理员专用（§0 的表里 `/api/users` → `admin`）：

```
GET    /api/users              → 200 { "users": [ { "id", "name", "isAdmin", "hasPassword",
                                      "createdAt", "isSelf", "sessionCount" } ] }
POST   /api/users              body { "name", "password"?, "isAdmin"? } → 201 { "user": {…} }
DELETE /api/users/:id          → 204（令牌与**会话索引**一起清掉；磁盘上的事件流仍留着）
POST   /api/users/:id/password body { "password": string|null } → 200 { "user": {…} }
POST   /api/users/:id/role     body { "isAdmin": boolean } → 200 { "user": {…} }
```

- 用户名 1–32 个字符，字母 / 数字 / `_` `.` `-`；重名 → 409 `conflict`。
- 内置账号 `admin` 是**接管这台机器的那把钥匙**：不能删、不能改角色。也不能删自己、
  不能把自己降成普通用户 —— 会把自己锁在外面。
- 口令至少 6 位；建号时可以不带口令（先由管理员代管），之后由本人（§1 的 `/api/auth/password`）
  或管理员（这一组）设。
- **两档角色**：管理员能管账号、改端点与密钥、设工作区；普通用户其余一切照旧 ——
  自己的会话、自己的模型偏好、自己的密钥、同一个对话引擎。

## 2. 配置

```
GET /api/config → 200 {
  "workspace": "/abs/path",
  "model": { "provider": "deepseek", "model": "deepseek-chat" },
  "baseUrl": null,
  "hasApiKey": true,
  "approvalPolicy": "auto-reject",
  "limits": { "maxIterations": 50, "maxTokens": null },
  "version": "0.1.0",
  "identity": { "kind": "host"|"user", "name": "本机"|"alice", "isAdmin": true }
}

PATCH /api/config
  body: { "workspace"?: string, "baseUrl"?: string|null, "apiKey"?: string,
          "model"?: { "provider": "deepseek"|"openai"|"kimi"|"qwen", "model"?: string },
          "maxIterations"?: number, "maxTokens"?: number|null }
  → 200  同 GET 的形状

GET /api/models → 200 {
  "default": "deepseek",
  "groups": [ { "id": "deepseek", "label": "DeepSeek", "envKey": "DEEPSEEK_API_KEY",
                "hasApiKey": true,
                "models": [ { "id": "deepseek-chat", "label": "对话（默认）", "default": true },
                            { "id": "deepseek-reasoner", "label": "推理" } ] } ]
}
```

- **「用哪个模型」是一条引用 `{ provider, model }`，不是两个平铺字段。** provider 是
  有穷联合（写错编不过），模型名是自由字符串（各家迭代太快，不由我们认证）。
  core 的 `types/ModelRef.ts` 定义形状，`formatModelRef` 给人看的
  `deepseek/deepseek-chat` **只用于显示**，要从字符串反解请用 `parseModelRef`（只切第一个
  斜杠，模型名自己允许带斜杠）。
- 提供方只有这四个 id，它们同时也是 `adelie-core` 的模型目录（`config/model-catalog.ts`）
  里的组 id：端点、密钥环境变量、可选模型都写在那张表里，加一家厂商 = 加一组。
  `kimi` 是 Moonshot、`qwen` 是阿里云 DashScope 的兼容模式，两者都走
  `/chat/completions`，与 `openai` 同协议、只是端点与密钥变量不同。
  引擎不认识 `--base-url` 之外的厂商细节：`model` 一律作为裸字符串透传，不校验。
- `PATCH` 里 `model` 的三种写法：
  1. 对象 `{ provider, model }` —— `provider` 必给；`model` 省略时，提供方没变就沿用
     当前的模型名，变了就落到新家的默认值（把 deepseek 的名字发给 Moonshot 几乎必然
     换来一次 400）。
  2. 裸字符串 —— 只换模型名，提供方不动（0.1 的客户端就是这么发的）。
  3. 兼容字段 `provider`（平铺）—— 等价于 `{ provider }`，留给手机上缓存了旧前端的
     PWA。等线上没有 0.1 客户端后删。
  其它形状 → 400 `bad_request`。`baseUrl` 与 `apiKey` 都按**当前的** provider 生效。
- `apiKey` 只写不读，键名按提供方查模型目录
  （`DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `MOONSHOT_API_KEY` / `DASHSCOPE_API_KEY`），
  文件权限收到 **0600**（写下去的是明文密钥，同机其他用户不该读得到），
  响应里只回 `hasApiKey`。**任何响应体里都不出现密钥。**
  写哪个文件按身份分：主机身份沿用 `<home>/.adelie/.env`（CLI 与桌面壳都读它，升级时不丢配置），
  登录用户写 `~/.adelie/secrets/<用户 id>.env`。读的时候反过来 —— **用户身份先看自己的文件**，
  主机身份保持「环境变量优先」这条老规矩。
- **`workspace` / `baseUrl` / `provider` / `apiKey` 是管理员的，`model` 与 `limits` 是每个人的。**
  非管理员改前四个 → 403 `admin_required`（换 provider 连着端点与密钥一起换，所以也算管理员的）。
  界面照这条把字段置灰并写清原因（`packages/web/src/lib/permissions.ts`），
  免得用户点了保存才吃一个 403。配置**按身份存**：主机一份，每个账号各一份。
- `GET /api/models` 是界面里那两组下拉框的唯一出处（以前抄在 Web 里，加一家厂商要改
  两处，漏掉的那处表现为「服务端支持、界面里选不到」）。它**不含端点**：`envKey` 是环境
  变量**名**（界面用它提示密钥配在哪），不是秘密。`hasApiKey` 按**当前身份**算。
- `workspace` 变更后，会话列表与新建会话都以新工作区为准。

```
GET /api/tools → 200 { "tools": [ { "name": "read_file", "description": "...", "requiresApproval": false } ] }
```

## 3. 会话

```
GET    /api/sessions                → 200 { "sessions": [ { "id", "workspace", "createdAt", "lastActiveAt", "taskCount", "title", "model"?, "lastModel"?, "owner"? } ] }
                                       ?scope=all → 所有账号的（**只有管理员**，普通用户传了也只得到自己那几条）
POST   /api/sessions                body { "workspace"?: string } → 201 { "session": {...} }
GET    /api/sessions/:id            → 200 { "session": {...}, "runs": [ RestoredRun ], "events": [ StoredSessionEvent ] }
DELETE /api/sessions/:id            → 204
GET    /api/sessions/:id/markdown   → 200 text/markdown（导出，见 core 的 renderSessionMarkdown）
```

- `model` 是这个会话**建的时候**用的模型（会话头），`lastModel` 是最近一轮**实际**用的
  （最后一条 `task_started`）。两者不一致说明会话中途换过模型。老会话（0.1 建的）可能
  两个都没有，所以都是可选的 —— 界面不能假设它一定在。
- **会话按人分区**：内置 admin 用共享根（v0.1.0 的会话原地不动），其余每人
  `~/.adelie/sessions/users/<用户 id>/`。归属**只从索引（`sessions` 表）读**，不看请求里带的 id；
  读别人的会话回 404 而不是 403（403 等于告诉对方「这个 id 存在」）。
  命令行建的会话在列表之前会被补进索引，所以它在网页里看得见。

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
即使 token 有效 —— 这是一个只给本机用的逃生口；回环之外还要过 §0 的权限表（`/api/shutdown` → `admin`）。

为什么要它：Windows 上 Electron 的 `child.kill()` 是硬终止，而会话事件是追加写的，
硬杀会把最后一条事件截成半行。桌面壳因此走「先请求优雅关停，超时再杀」。

## 7. 静态资源

- `GET /` 与任何非 `/api/*` 路径 → Web 构建产物（SPA：找不到文件回落到 `index.html`）。
- 构建产物目录：`ADELIE_WEB_DIST` 覆盖；否则按 `packages/web/dist` 找。

## 8. 错误

所有错误都是 JSON：`{ "error": "<code>", "message": "<人读的话>" }`。
已知 code：`unauthorized` / `admin_required` / `forbidden` / `conflict` / `not_found` /
`busy` / `stale_approval` / `bad_request` / `internal`。
