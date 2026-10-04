# PenguinHarness：用户 / 角色 / 私密数据设计研究

> 只读研究，未修改 `/root/penguin-harness` 与 `/root/Adelie`。所有路径为仓库相对真实路径。
> 行文中**未读取、未打印** 任何 `.vault.toml` / `.project_config.toml` 的内容，只描述格式、字段名与文件权限。

## 0. 结论先行

| 问题 | PenguinHarness 的答案 |
| --- | --- |
| 有没有「用户」 | **有**。SQLite `web.db` 的 `users` 表，`user_id` 即登录名，无自助注册，管理员建号 |
| 有没有角色 | **只有两档且是布尔**：`users.is_admin`。`admin` 是启动时播种的内置账号；组织/协作层是另一套：Project `owner` / `member` |
| 鉴权方式 | 双凭证：`Authorization: Bearer <本地 API token>` → 恒等于内置管理员；或 `penguin_session` HttpOnly Cookie → `auth_sessions` 行 |
| 回环是否放行 | **不放行**。所有 `auth:"user"` 路由组在 `/api/*` 上统一过 `authMiddleware`，与绑定地址无关 |
| 密钥存哪 | 两张表 + 两个文件：Project 级模型密钥内联在 `<root>/.project_config.toml`（0600）；Agent 级环境变量保险柜 `<root>/agents/<id>/agent_state/.vault.toml`（0600）；OAuth refresh 材料在 web.db `model_provider_auth_tokens` |
| 密钥进模型上下文吗 | **值不进，键名进**。值只注入 `exec_command` / `input_command` 子进程环境；Prompt 里展开的是 `{{VAULT_KEYS}}`（只有名字） |
| 每 Agent 一份密钥 | **是**（vault 按 agent 分文件）；但模型 API key 是 **Project 级共享** |
| 桌面端 | 单用户。Electron 壳 + 内嵌 server，一次性 token 换 admin 会话；多用户管理路由整片 403 `desktop_single_user` |

**最值得 Adelie 抄的一条不变量**：*能读到数据根目录的文件系统权限 == 管理员权限*（`packages/server/src/auth/api-token.ts` 明写为「授权模型而非意外」）。它把「谁是管理员」这个问题从产品里消掉了。

---

## 1. 服务端的身份与权限

### 1.1 鉴权入口（真实签名）

`packages/server/src/auth/middleware.ts`：

```ts
export const SESSION_COOKIE = "penguin_session";
export function cookieOptions(c, ttlMs, trustProxy) // httpOnly + sameSite:"Lax" + path:"/" (+ secure 仅当 proto=https)
export function authMiddleware(auth: Auth, trustProxy: boolean): MiddlewareHandler<AppEnv>
export function currentUser(c: { var: { user: UserRow } }): UserRow
export function bearerToken(header: string | undefined): string | null
export const jsonOnlyWrites: MiddlewareHandler   // CSRF：写请求只收 application/json|gzip|octet-stream
```

流程：Bearer 优先 → `auth.authenticateApiToken(token)` → 失败即 401（**不回落 Cookie**，避免掩盖错配）；否则读 Cookie → `auth.authenticateWithMeta(token)` → 顺带滑动续期（原位更新 `expires_at`，token 值不变）。

### 1.2 路由挂载：权限是「数据」

`packages/server/src/http/app.ts` 的 `HttpModule.setup()`：每个模块以数据形式贡献路由组

```ts
routes: Slot<{ prefix: string; auth: "user" | "none"; order: number }, Hono<AppEnv>>
```

拼装时**第一个** `auth:"user"` 组之前一次性 `app.use("/api/*", authMiddleware(...))`；非 `/api` 前缀的受保护组（机器代理 `/server/`）单独在自己的前缀上加门。加一个接口 = 在某模块的 manifest 里加一行。

### 1.3 「用户」与「角色」的真实结构

`packages/server/src/db/schema.ts`：

```sql
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,          -- 语义 id 兼登录名 ^[a-z][a-z0-9_-]{1,31}$
  password_hash TEXT NOT NULL,       -- scrypt$N$r$p$salt$hash(base64)
  is_admin INTEGER NOT NULL DEFAULT 0,
  password_is_initial INTEGER NOT NULL DEFAULT 0,
  display_name TEXT, avatar TEXT, created_at TEXT NOT NULL);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,       -- sha256(token)；Cookie 只存原始 token
  user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TEXT, expires_at TEXT,  -- 30 天滑动续期
  via TEXT);                         -- password|desktop|setup|cli
```

`packages/server/src/auth/service.ts` 的硬事实：

- `ADMIN_USER_ID = "admin"`；`seedAdmin()` 在 users 为空时播种，密码 `randomBytes(24).base64url`，**哈希后即丢弃、从不显示**，靠 `mintFirstLogin()` 打印的一次性链接认领（`packages/server/src/initial-password.ts` 的 `renderFirstLoginNotice`）。
- `export type SessionVia = "password" | "desktop" | "setup" | "token"`；`loginDesktop()` 免密发 admin 会话。
- 登录节流：`LOGIN_FREE_ATTEMPTS = 5`，之后 1s 起指数退避至 60s；未知账号也走一次 dummy hash，不做账号存在性预言机。
- `authenticateApiToken()`：常量时间比较；持 token 即 admin。

`packages/server/src/http/routes/auth.ts`：`POST /api/auth/login|logout`、`GET /api/auth/claim?token=`（桌面壳一次性 token → 或首次登录链接），组前缀 `auth: "none"`、`order: 5`。

### 1.4 两套授权维度

| 维度 | 载体 | 判据代码 |
| --- | --- | --- |
| 全局管理员 | `users.is_admin` | `packages/server/src/mechanisms/identity.ts` 的 `Auth.isAdmin(userId)`；`auth/service.ts` 末段 |
| Project 归属 | `projects.owner_user_id` + `project_members` 表 | `packages/server/src/mechanisms/projects.ts` 的 `Access.requireProjectAccess / requireProjectOwner` |

管理员专属检查点（真实位置）：`http/routes/admin.ts:32`、`admin-settings.ts:83`、`admin-plugin-config.ts:23`、`machines.ts:56`、`version.ts:61,100`（回滚）、`plugins.ts:123`、`plugins-installed.ts:176`、`machines/service.ts:1564`、`machines/terminal-relay.ts:101`、`usage.ts`（`includeGlobalErrors`）。Project 所有者专属：`http/routes/vault.ts`（写）、`command-policy.ts:113`（写）、`members.ts`（增删成员，服务层校验）。

### 1.5 绑定非回环时的行为

`packages/server/src/config.ts`：`const host = env.HOST ?? "127.0.0.1"`，端口 `7364`；`desktopToken !== null && host 非回环` → **直接抛错**（桌面模式必须绑回环）。除此之外**没有任何"回环免鉴权"分支**——`/api/*` 一律过 Cookie/Bearer 门，这是它与 Adelie 最大的差别。`trustProxy`（`PENGUIN_TRUST_PROXY`）单独把关 `x-forwarded-proto → Secure Cookie`，防止 HTTP 绑定下发一个浏览器永不回传的 Cookie。

`packages/server/src/index.ts` 的 `appHost()` 把 `0.0.0.0`/`::` 显示成 `localhost`（通配地址不是可访问地址）；回环绑定时额外监听 `::1`；`packages/server/src/app.ts` 的 canonical-host 守卫：预览用回环对偶主机名，该主机上的 `/api/*` 直接 401，别的一律 302 回 App 主机（防预览 HTML 同源冒充用户）。

### 1.6 单用户模型的边界与代价（桌面模式）

- 边界：`packages/server/src/http/routes/desktop.ts` 的 `rejectInDesktopMode(deps)` 让 `/api/admin/users` 与成员路由返回 `403 desktop_single_user`（**不是 404，且数据不动**）。`AuthService.loginDesktop()` 让壳拿到 admin 会话。
- 代价：桌面模式写死了「只有一个账号，且它永远是管理员」；`members`、`admin users`、组织级协作全部不可用。域模型仍能承载多用户，只是 UI/路由被关——这是**产品决定**，不是数据模型限制。

---

## 2. Agent 的权限 / 审批

### 2.1 命令策略：Project 拥有、先于一切审批

`packages/core/src/internal/command-policy.ts`：

```ts
export function evaluateCommandPolicy(cmd: string, policy?: CommandPolicyConfig): CommandPolicyVeto | null
export function vetoForToolCall(toolName: string, argsJson: string, policy?): CommandPolicyVeto | null
export type CommandPolicySource = () => CommandPolicyConfig | undefined
export function withCommandPolicy(approve: ApproveFn, source?: CommandPolicySource): ApproveFn
```

- 规则是**数据**：`{ name, pattern, description, enabled }`，存 `.project_config.toml` 的 `[command_policy]`；出厂集在 `packages/core/src/state/command-policy-defaults.ts`，随建 Project 播种，之后从不改写。
- 命中即 `"forbidden"`，**审批模式（含 allow-all）与任何 Hook 都无法放行**。
- 覆盖 `exec_command` 的 `cmd`/`command` 与 `input_command` 的 `chars`（否则守卫只有一层解释器深）；单独一个 `\u0003` 豁免（那是 SIGINT）。
- 源码注释明写：**这是防误操作的护栏，不是安全边界**；真正的边界是 confinement（bubblewrap / dsh）。MCP 工具不在范围内。

### 2.2 审批模式与工具权限级别

- 审批档位（Project 级 `[default_chat]`）：`packages/core/src/state/project-config.ts` 的 `CHAT_APPROVAL_MODES = ["allow-all","deny-all","read-only","always-ask"]`，默认 `allow-all`。
- MCP 工具权限：`packages/core/src/environment/mcp/config.ts` 的 `permission?: "auto" | "r" | "rw"`——只决定该 Server 的工具上报给审批层的级别，**不构成隔离**。
- 回调注入点：`ApproveFn`，`packages/core/src/interfaces/shared.ts`；`Session.run` 用 `withCommandPolicy` 包住它。

### 2.3 Hooks：三个挂载点 + 两条硬边界

`packages/core/src/hooks/index.ts` 导出：

```ts
runPreToolUseHooks(hooks, input): Promise<PreToolUseOutcome>   // tool-hook.ts
runStopHooks / runUserPromptHooks                              // stop-hook.ts / prompt-hook.ts
runHookScript / scriptPreToolUseHook ...                       // script-hook.ts
```

`PreToolUseHookResult = { decision?: "allow" | "deny"; reason?; output? }`，第一个决定生效；抛错的 Hook 记为「无意见」。两条边界由构造保证（`tool-hook.ts` 头注释）：

1. Project 命令策略**压过** Hook 的 `allow`（Hook 包住在 Agent 可写状态里，不能覆盖 Project 的安全配置）；
2. `deny` 只能收窄。

**谁能改**：Hook 装进 `<agent>/agent_state/hooks/`（Agent 自己可写）；命令策略走 `GET/PUT /api/projects/:p/command-policy`——读要 access，写要 **owner**（`http/routes/command-policy.ts:107,113`）。

---

## 3. 私密数据

### 3.1 存哪、什么形式

| 数据 | 路径 | 形式 / 字段 | 权限 |
| --- | --- | --- | --- |
| Agent 环境变量保险柜 | `<root>/agents/<agent_id>/agent_state/.vault.toml` | TOML 单层表 `KEY = "value"`，键名须匹配 `^[A-Za-z_][A-Za-z0-9_]*$`，值长 ≤ `VAULT_VALUE_MAX_LENGTH = 8192` | 0600（`atomicWriteFile(..., { mode: 0o600 })`） |
| Project 模型凭证 | `<root>/.project_config.toml` | `[[models]]` 条目内联 `api_key`、`base_url`、`api_key_written_at` | 0600 |
| 模型 OAuth refresh | web.db `model_provider_auth_tokens` | `refreshToken` / `accessTokenExpiresAt`，注释明写「never returned to the frontend」 | DB 文件 |
| 本地 API token | `<root>/api-token` | 每次启动新铸（32B base64url） | 0600 |
| CLI 登录态 | `<root>/cli-session.json` | `{ server, userId, token, expiresAt }` | 0600，经 `packages/server/src/secret-file.ts` 的 `writeSecretFile`（unlink + `O_EXCL|O_NOFOLLOW` + fd `chmod`）|

保险柜 API（`packages/core/src/state/agent-vault.ts`）：`loadAgentVault / saveAgentVault / setVaultEntry / removeVaultEntry`，文件不存在视为空表，清空即删文件。

实测数据根（`/root/.penguin/data/sjaaj`，只 `ls` 未读内容）：`.project_config.toml` 为 `-rw-------`；`agents/default_agent/agent_state/.vault.toml` 为 `-rw------- (289 bytes)`，同目录还有 `system_config.yaml`（普通 0644，故配置与密钥分离）。

### 3.2 密钥如何注入

链路：`packages/core/src/agent.ts:532` `loadAgentVault(root, projectId, agentId)` → 每个模型上下文重建 `Environment`（`environment/environment.ts:319` `this.commandSessions.setVault(config.vault)`）→ `packages/core/src/environment/tools/command/session-manager.ts` 每次 spawn 时按优先级展开：

```ts
{ ...hostEnv, ...this.vault, ...controlEnv }   // 后者覆盖前者：vault > host，controlEnv > vault
```

`controlEnv`（`packages/server/src/runtime/session-manager.ts:2609`）注入 `PENGUIN_API_URL` / `PENGUIN_API_TOKEN` / Session 坐标，是「受控注入」而非密钥。

### 3.3 怎么保证不进上下文 / 不回传

- **上下文**：`packages/core/src/agent.ts:515` 明写「值只进子进程环境，只有**键名**进 Prompt」。渲染在 `packages/core/src/state/agent-state.ts` 的 `vaultSection()`：`{{VAULT}}` → `vault.prompt`，其内 `{{VAULT_KEYS}}` → 每行 `- KEY`。`vault.enabled=false` 只关小节，值照旧注入。
- **API 回传**：一律遮罩。`packages/server/src/services/project-config-service.ts:125` `maskApiKey()`（≤12 字符 → `***`，否则 `****` + 后 4 位），被 `agent-config-service.ts:433`（vault 只回 `valueMasked`）、`plugin/config.ts:247`、`messaging-channels.ts:97` 复用；CLI 侧同名函数在 `packages/cli/src/i18n.ts:2867`。
- **日志**：**没有**通用的脱敏层（`redact` 在 core/server 源码里 grep 不到，只有 thinking 块的语义用法）。防护靠「值从不流经模型/接口」这一构造性质，而不是事后过滤。这是 Adelie 抄的时候要补的短板。

### 3.4 隔离粒度

- 保险柜：**每 Agent 一份**文件（`state/paths.ts` 的 `agentVaultPath`）。
- 模型 API key：**每 Project 共享**，所有 Agent 共用同一张 `[[models]]` 表；`packages/core/src/state/model-catalog.ts` 的 `resolveModelCredential(entry, env = process.env)` 决定用内联 key、环境变量回退（`modelEnvFallback`），或直接抛 `ModelCredentialError`。
- 运维口子：`penguin config model add --api-key`、`penguin config vault set --key --value [--agent-id]`（`packages/cli/src/commands/config.ts:352-411`）、`penguin auth token --mark`（`packages/cli/src/commands/auth.ts`，授权依据同样是「能读数据根」）。

---

## 4. 桌面端

`packages/desktop/src/main.ts`（816 行）事实：

- Electron，`requestSingleInstanceLock()`；一个 `BrowserWindow`（`nodeIntegration:false, contextIsolation:true, sandbox:true`），加载 `http://localhost:<port>`；外链一律 `shell.openExternal`。
- 服务端是 `utilityProcess` 子进程（`packages/desktop/src/server-process.ts`），端口取 `0`（临时端口）+ userData 里 `server-port` / `preferred-port` 记忆；就绪探测 + `POST /api/desktop/shutdown` 优雅退出。
- 登录：壳启动时 `mintApiToken()`，窗口打开 `/api/auth/claim?token=…`——**一次性**换 admin Cookie（`packages/server/src/services/desktop-service.ts` 的 `redeemLoginToken`，仅一次为真）；同一 token 对 `POST /api/desktop/shutdown` 可重用（`verifyToken`）。**没有登录界面、没有账号输入**。
- 页面侧能力网关：`sessionVia === "desktop"` 才允许 updater / tray / privacy-settings；attach 模式（已有活 server 占着数据根）复用它。
- 角色概念：**无**。运行时唯一的身份就是内置 `admin`；用户/成员管理路由整片 403（`rejectInDesktopMode`）。

对比：PenguinHarness 的 Web（浏览器访问自托管 server）才是多用户形态；桌面壳是它的单用户子集。

---

## 5. 对照 Adelie 的差距

Adelie 现状（真实代码）：

```ts
// packages/server/src/auth.ts
export function isLoopbackAddress(address): boolean
export function isLoopbackRequest(c: Context): boolean          // 拿不到地址 → 按本机
export function createAuthMiddleware(options: AuthOptions)      // { token, alwaysRequireToken }
export function presentedToken(c): string | null                // Bearer 或 ?token=
```
```ts
// packages/server/src/index.ts
function resolveToken(explicit, host) {                         // 非回环且未配置 → 随机 24B
  return explicit ?? (isLoopbackHost(host) ? null : randomBytes(24).toString('base64url')); }
```
```ts
// packages/server/src/settings.ts
export function apiKeyFor(provider): string | undefined         // 读 process.env
export function hasApiKey(provider): boolean
export function writeApiKey(provider, key): void                // 写 ~/.adelie/.env，无 mode，无 chmod
```

| 维度 | Adelie 现在 | PenguinHarness | 差距性质 |
| --- | --- | --- | --- |
| 用户表 | **无**（零账号、零 DB） | `users` + `auth_sessions`（SQLite） | 结构性缺口 |
| 角色 | 无 | `is_admin` 布尔 + Project owner/member | 结构性缺口 |
| 回环请求 | **直接放行**（`isLoopbackRequest && !alwaysRequireToken → next()`） | 一律过门 | 语义不同，非缺陷 |
| 凭证 | `ADELIE_TOKEN`（可选），Bearer 或 `?token=`；无 Cookie、无过期、无吊销 | Cookie 会话 + `sha256` 行 + 30 天滑动续期 + Bearer API token | 中等 |
| 密钥文件 | `~/.adelie/.env` 单文件，`writeFileSync` 默认权限（**通常 0644**） | 0600 + `atomicWriteFile` / `writeSecretFile`（`O_EXCL|O_NOFOLLOW`） | **廉价可立即修** |
| 密钥粒度 | 全局（进程级 env），无 Project / Agent / User 隔离 | Project 级模型密钥 + Agent 级 vault | 结构性缺口 |
| 密钥回传 | 只回 `hasApiKey`（已对） | 遮罩 `maskApiKey` | 差距小 |
| 密钥入上下文 | 不适用（无子进程注入概念，key 只在 provider 调用里） | 值注入子进程、键名进 Prompt | 设计差 |
| 审批 | 每工具静态 `requiresApproval`（`packages/tools/src/*.ts`），`ApprovalHub` 挂起/裁决（`packages/server/src/approvals.ts`），`configView()` 报 `approvalPolicy: 'auto-reject'` | 工具静态 + Project 级命令策略（数据、先于审批）+ Hook 三层 | 缺「策略层」 |
| 桌面端 | 同款薄壳，固定 `ADELIE_HOST=127.0.0.1`，**完全无认证** | 一次性 token → admin 会话；多用户路由 403 | 差距小，改动集中 |

### 5.1 可执行差距清单（按性价比排序）

1. **[S] 密钥文件权限**：`packages/server/src/settings.ts:writeApiKey` 与 `packages/cli/src/cli.ts:writeUserEnvKey` 的 `writeFileSync` 补 `{ mode: 0o600 }`，并在写入前 `chmodSync`（既有文件 mode 不会自动变）。两处重复实现建议合并进 `core`。
2. **[S] 每用户/每工作区密钥文件**：把 `~/.adelie/.env` 降级为「导入/导出用的用户级文件」，新密钥写 `~/.adelie/secrets/<userId>.env`（0600），`loadUserEnvFile` 增加按 userId 加载。
3. **[M] 引入 SQLite + 用户表**：`~/.adelie/adelie.db`，表 `users(user_id PK, password_hash, is_admin, created_at)`、`auth_sessions(token_hash PK, user_id, via, expires_at)`；复用 Penguin 的 scrypt 与「播种 admin + 一次性认领链接」。
4. **[M] 会话归属**：`packages/core/src/persistence/paths.ts` 现在把会话放在 `~/.adelie/sessions/ws-<hash>/`（**按工作区**，不按用户）。加一层 `users/<userId>/`，`SessionStore` 的路径函数加 userId 参数；否则「用户隔离」只是摆设。
5. **[M] 审批策略层**：把 `requiresApproval: true` 从工具源码里提出来，做成 `~/.adelie/policy.toml` 的 `[[rules]]`（`{name, pattern, enabled}`），在审批边界前先否决——照抄 `withCommandPolicy` 的形状。
6. **[L] 桌面端两档**（下一节）。

---

## 6. 最后一段：Adelie 桌面端加「用户 / 管理员」两档，最小设计

**谁是管理员**：沿用 PenguinHarness 已被验证的公理——**能读到 Adelie 数据根（`~/.adelie`）的人就是管理员**。落到产品上是「第一次启动这个安装的人」：桌面壳首次运行时播种 `admin`（随机密码哈希后丢弃，界面走一次性认领，无需用户记密码），`is_admin = 1`。管理员后续在设置页创建普通用户（用户名 + 一次性初始密码）。不引入邀请、不改邮箱。

**权限差异只落在 6 个动作上**（多一个都是过度设计）：

| 动作 | admin | user |
| --- | --- | --- |
| `PATCH /api/config` 的 `apiKey` / `provider` / `baseUrl` | ✅ 写 `~/.adelie/secrets/*.env` | ❌ 403 `admin_required`（密钥是安装级共享资源，普通用户只能用已配好的） |
| 用户管理（建号 / 重置密码 / 删号） | ✅ | ❌ |
| 选择 / 切换工作区根 `workspace` | ✅ 任意目录 | ⚠️ 仅自己名下的工作区分区（或只读：管理员预置） |
| 看见「全部会话」vs「我的会话」 | ✅ 全部 | ⚠️ 仅 `users/<userId>/` 下的会话 |
| 删号 / 导出 / 删除他人会话、清空事件流 | ✅ | ❌（只能删自己的） |
| 审批策略、`ADELIE_HOST` / `ADELIE_TOKEN` / 桌面壳开机自启 | ✅ | ❌ |

其余一切（对话、工具审批、模型选择、工作区文件读写）**两档完全一致**——桌面端本来就是「自己的机器」，把聊天能力也分级只会让人困惑。

**状态存哪**：

```
~/.adelie/
  adelie.db                  # SQLite：users / auth_sessions / (可选) user_settings
  secrets/<userId>.env       # 0600；admin 的 provider key 写这里，普通用户无此文件
  sessions/users/<userId>/ws-<hash>/...   # 会话按用户 → 工作区分区
  sessions/users/<userId>/index.json
```

- 鉴权复用 Adelie 现有中间件形状：`Cookie: adelie_session`（HttpOnly，SameSite=Lax）优先，`Authorization: Bearer` 次之（给 CLI / 桌面壳），回环**不再无条件放行**——桌面壳在启动时用一次性 token 换 Cookie（照抄 `desktop-service.ts` 的 `redeemLoginToken` 一次性语义 + `POST /api/desktop/shutdown` 可重用语义）。这一步把 Adelie 的回环放行换成和 Penguin 一致的「Cookie 门」，同时保住桌面壳的无感登录。
- 路由分组按 Penguin 的做法写成数据：`{ prefix, auth: "user" | "none", role?: "admin" }`，`admin` 判定集中在一条中间件里（现成模板：`packages/server/src/http/routes/admin.ts` 的 6 行 `isAdmin` 检查）。
- 会话路径的 userId 必须从**会话行**读，而不是当前请求——否则用户 A 拿到用户 B 的 sessionId 就能读。

**最小落地路径（4 步，每步都可独立发布）**：
1. `writeFileSync(..., { mode: 0o600 })` + 既有文件 chmod（1 小时，先堵明文 0644）。
2. 引 SQLite + `users` / `auth_sessions` + 播种 admin + 一次性认领链接 + Cookie 门；桌面壳先用 admin 自动登录，功能不变（用户可见的零变化）。
3. 会话目录按 `users/<userId>/` 分区，加 `role: "admin"` 中间件与用户管理路由（对桌面模式不 403——桌面正是要这个）。
4. 把密钥写入与 `apiKey` / `provider` 改动收到 admin，普通用户界面隐藏这些控件。

第 1、2 步做完即已是「有用户、有管理员、密钥不进 0644」的最小可用形态，第 3、4 步才真正产生权限差异。
