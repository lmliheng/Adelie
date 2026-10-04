# CHANGELOG

## 未发布 — 自检方法与发布产物清理

### 新增：应用体检（`node scripts/audit.mjs`）

一条命令回答「这个应用现在有没有毛病」。它替人干的是「该看哪儿」这件**可枚举**的事，
剩下需要判断的才是人的活。规则与用法见 `docs/audit.md`（`pnpm run audit` 也行 ——
裸的 `pnpm audit` 是 pnpm 自带的依赖漏洞扫描，两回事）。

- 十二条检查，每条都对应一类**已经发生过**的事故：三个闸门（typecheck / test / build）、
  契约路由与代码一一对应、前端请求路径都在契约里、错误码与契约 §8 对齐、权限表每一行
  对着真路由、issue 草稿合规、源码里的欠账标记、提供方没绕开模型目录、密钥卫生
  （值不进仓库/不进日志/文件 0600）、产物没有已删源的残渣、版本与 workspace 依赖声明、
  文档里自认未验证的结论。
- 只报告、不修东西；每条发现都带 `文件:行` 或命令作证据；`--fail-on` 决定哪一档开始挡
  发布（默认 P1，CI 用 P2），**已经记进草稿的发现不挡门槛**（由 issue 跟踪，把 CI 一直
  挂红只会让人开始忽略它）。
- 挂进 CI（`.github/workflows/ci.yml`）：`--no-gates --fail-on=P2`。三个闸门 CI 本来就
  单独跑，体检补的是它们看不见的那一半。

### 修复：构建不再把已删源的文件留在发布包里

`tsc` 只写不删：删掉 `anthropic.provider.ts` / `gemini.provider.ts` 之后，
`packages/providers/dist/` 里那四个 `.js` / `.d.ts` 还活着，而 `package.json` 的 `files`
就是 `["dist", "README.md"]` —— 它们会跟着发布包发出去。

- 新增 `scripts/clean-dist.mjs`：各包的 `build` 先清 `dist` 再编译（core / providers /
  tools / runtime / cli）。CLI 也需要它：SSR 构建下 vite 默认不清 `outDir`。
- 脚本自己带护栏：只肯删 `packages/<包名>/dist`，其余路径一律拒绝退出（一个被
  `pnpm build` 顺带调用的删除脚本，写错一个变量的代价太大）。
- 这条原本是 `docs/issues/release-build-does-not-clean-dist.md` 草稿（还没同步到
  GitHub），修完即删：它属于这次提交与这份 CHANGELOG。
- 体检里的「产物与源码一致」那一项就是它的回归检查。

## 未发布 — 重构 P1–P3（对照 penguin-harness 的设计）

分六期重构（方案见 docs/redesign.md）。P1、P2、P3 已落地并通过全仓验证。

### P1 — 模型目录与多厂商

- `adelie-core/src/config/model-catalog.ts`：一张表登记四家提供方（deepseek / openai /
  kimi / qwen）—— 端点、密钥环境变量、可选模型；`PROVIDER_NAMES`、
  `PROVIDER_ENV_KEYS`、`DEFAULT_PROVIDER`、`providerGroup`、`envKeyForProvider`、
  `defaultBaseUrlForProvider`、`defaultModelForProvider` 都从它派生。
- 新增 `adelie-providers` 的 `kimi.provider.ts`（`MOONSHOT_API_KEY`）与
  `qwen.provider.ts`（`DASHSCOPE_API_KEY`，DashScope 兼容模式）；`Provider.ts` 的密钥表
  与工厂改为从目录派生，加一家厂商 = 加一组。
- CLI 的 `--provider` 合法值与默认模型走目录；服务端 `writeApiKey` 与 CLI
  `writeUserEnvKey` 写出的 `.env` 权限收到 **0600**（对已存在的文件也 `chmod`）。
- 删掉两个 0 字节的 `anthropic.provider.ts` / `gemini.provider.ts`。
- 新增 26 个测试（core 7 / providers 13 / server 6）。

**未验证**：kimi / qwen 的模型 id 取自公开文档，本机没有密钥，**从未发过真实请求**。

### P2 — 模型引用贯穿全局

- `adelie-core/src/types/ModelRef.ts`：`{ provider, model }` 一条引用，配
  `formatModelRef`（只用于显示）、`parseModelRef`（只切第一个斜杠）、`sameModelRef`、
  `isModelRef`（会话头/事件流是 `unknown`，走判据而非断言）。
- 它现在贯穿三处：**配置**（`ServerSettings.model` / CLI `SessionSettings.model`）、
  **会话头**（`SessionStore` 的 `SessionMeta.model`）、**run 事件头**
  （`task_started.payload.model`）。用量与成本将来按它归属。
- 服务端：`GET /api/models` 新增（groups 带 id/label/envKey/hasApiKey/models，**不含
  端点**），成为界面下拉框的唯一出处；`PATCH /api/config` 收 `model` 对象，`model` 省略
  时「同家沿用、换家落默认」；保留 0.1 客户端的平铺 `provider` 兼容字段。
- 会话视图新增 `model`（建的时候）与 `lastModel`（最近一轮实际用的，来自最后一条
  `task_started`）—— 两者不一致就是中途换过模型。
- CLI：`/model 提供方/模型` 或只给型号；`/status`、密钥状态、provider 构造都读当前模型
  的提供方。
- Web：设置弹窗从 `GET /api/models` 渲染提供方下拉（换家自动落到新家默认模型）与模型
  `datalist`（可手填），并显示该配哪个环境变量、配没配。

**未接入**：`packages/cli/src/vue-tui/composable/useAgent.ts` 仍硬编码 `DeepSeekProvider`
（CLI 的实验 TUI 路径，P2 未动）。

### P3 — 用户、两档角色与会话分区

- `adelie-server/src/users/db.ts`：`~/.adelie/adelie.db`（`node:sqlite`，无原生依赖，
  `busy_timeout` 5s）。表：`users`（播种内置 `admin`，初始无口令）、`auth_sessions`
  （**只存令牌的 sha256**，30 天）、`sessions`（会话 id → 归属 + 工作区）、`user_settings`。
- `users/passwords.ts`：scrypt + 随机盐 + `timingSafeEqual`，参数写进哈希串。
- `identity.ts`：身份解析 **Cookie → Bearer →（回环且未配 token ⇒ 主机管理员）**，
  配一张**路由权限表**（`none` / `user` / `admin`，最长前缀优先，兜底「要登录」）。
  判定只在这一个中间件里。401 `unauthorized` 与 403 `admin_required` 分得很清。
- 新增 `/api/auth/me|login|logout|password` 与 `/api/users[...]`（整片管理员专用）。
  用户不存在与口令不对回同一个 401（否则是账号枚举器）；**改口令作废该账号的所有令牌**；
  内置 `admin` 不能删、不能改角色，不能删自己、不能把自己降级。
- `PATCH /api/config`：`workspace` / `baseUrl` / `provider` / `apiKey` 四个字段管理员专用
  （403），`model` 与 `limits` 人人可改；`GET /api/config` 多回一个 `identity`。
- **密钥分文件**：主机身份沿用 `<home>/.adelie/.env`（升级不丢配置），登录用户各写
  `secrets/<id>.env`（0600）；读时用户身份优先看自己的文件，主机身份保持「环境变量优先」。
- **会话按人分区**：内置 admin 用共享根（0.1 的会话原地不动），其余每人
  `sessions/users/<id>/`；归属只从索引读，读别人的回 404；`?scope=all` 只对管理员有效。
  CLI 建的会话在列之前补进索引，所以它在网页里看得见。
- Web：身份门（连不上服务端时**不**显示登录页）、登录页（含连接设置）、用户管理弹窗、
  顶栏身份胶囊、设置弹窗按 `lib/permissions.ts` 置灰无权字段。新增 6 个纯函数测试。
- 桌面壳**没有改**：它绑回环、不带凭证，走的就是主机管理员那条路 —— 见 docs/redesign.md §12
  的「一处有意偏离」。
- 修一个做 P3 时暴露出来的构建缺陷：tsup 默认把 `import 'node:xxx'` 改写成裸标识符，
  而 `node:sqlite` 只认带前缀的形式，改写后服务端产物一 import 就崩、桌面端连构建都过不去。
  两个 tsup 配置加 `removeNodeProtocol: false`。
- 修一处界面文案：登录时口令输错原本提示「服务端地址不对、token 无效」，把人引去改连接
  设置；现在直接说「用户名或口令不对」。

**验收**：全仓 **703 通过 / 7 跳过**，`typecheck` / `test` / `build` 三绿；另用构建产物起
服务、Playwright 走了一遍真实的登录流程（匿名 → 主机 → 建号 → 用户登录 → 权限置灰 →
退出），细节见 docs/redesign.md §12。

**未完成**（都记在 `docs/issues/`）：非管理员仍共用管理员的工作区；登录接口没有速率限制；
PWA 跨源场景下 Cookie 失效那条路没有真机验过。

## 0.1.0 — 2026-10-04

第一个版本：把 AgentCode 里的 agent 应用迁到 Adelie，并给它加上三种新外壳。

### 引擎（从 AgentCode 迁入并改名）

- `adelie-core` / `adelie-providers` / `adelie-tools` / `adelie-runtime`：ReAct 循环、计划与
  真 replan、审批（默认拒绝 + 决定入事件流）、多重预算与 token 闸门、上下文折叠、
  交付物断言与回归验收、会话持久化 / 恢复 / 导出、MCP stdio 客户端、fs-guard 边界。
- 用户级配置目录 `~/.adelie/`；工作区指令文件认 `ADELIE.md` / `AGENTS.md` / `CLAUDE.md`。
- 迁移验证：类型检查与构建通过，**557 个测试通过 / 7 个跳过**（core 66、providers 37、
  tools 190、runtime 149、cli 115）。

### 新增

- `adelie-server`：HTTP + SSE 后端（会话、对话流、工具审批、取消、静态托管），契约见 docs/api.md。
- `adelie-web`：React + Vite 的对话界面，移动优先，含工具时间线、审批卡、设置与用量；可安装 PWA。
- `adelie-desktop`：Electron 壳（Windows）：挑端口、内置服务端、单实例、优雅退出；NSIS 安装包与免安装版。
- `adelie` CLI 新增 `--version`。
- 品牌：名字 Adelie 与图标（brand/BRAND.md）。
