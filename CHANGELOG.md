# CHANGELOG

## 未发布 — 计划与验收不再由运行时代管（改学 penguin）

用户看过界面后问：为什么「初始计划」卡在那儿不动（每一步都是 ⏳），penguin 的计划是怎么做的；
验收机制 penguin 也没体现，不需要就删掉。查证与改动：

**问题在哪。** 运行时原来有一套计划状态机：进入循环前先跑一个规划轮，要求模型用
`request_replan` 提交步骤列表；步骤状态（pending / completed / …）**由模型自己维护**。
但全仓库除了重放时的 `filter`，**没有任何地方写过 `completed`** —— 短任务不会调那个入口，
于是任务明明 `task_completed`，界面上的计划还停在 `0/N 步`。这不是显示 bug，是设计里缺一条闭环：
状态机要求模型维护状态，而运行时没有任何机制保证它维护。

**penguin 怎么做。** 全仓没有 `plan_updated` 事件、没有 `PlanState`、没有 `request_replan` 工具；
计划只是提示词里的一句话（`packages/core/src/state/default-config.ts`）：长任务先把计划写进
Session scratchpad 的 `PLAN.md`，每完成一步就更新它，**验证过再勾掉**。验收同理 —— 守则里写的是
「用项目自己的命令验证」，没有运行时验收子系统。

**于是删掉两套自造机制：**

- 计划：规划轮、`request_replan` 工具、`PlanStep` / `PlanState`、`plan_updated` 事件、版本号与
  依赖图、兜底计划、Web 的 `PlanCard` 全部删除。改为 `AgentRuntimeConfig.scratchpadDir`
  （新增）+ 提示词里给出计划文件的**绝对路径**：server 传会话目录（`store.dir`），CLI 传
  `session.dir`；该目录同时进 `allowedPaths`，模型才写得了。计划文件刻意放在工作区**之外** ——
  它是过程不是交付物，不该脏了用户的 `git status`。
- 验收：`verifyTask()`、`TaskVerificationResult`、交付物断言（`deliverables.ts`）、`verification`
  事件、`run_finished.verification`、Web 的 `VerificationCard`、CLI 的验收结论渲染全部删除。
  一轮「成功」现在只有一条判据：`stopReason.type === 'task_completed'`。
- 「自动重规划」改名「回灌失败上下文」（`shouldNudgeAfterFailures`）：行为不变，文案改成
  「换一种做法再试……换过三种不同的做法还是同一个错就停下来」，不再提规划。

**顺带修掉一个被规划轮掩盖的顺序 bug。** 契约要求 `run_started` 是流里的第一帧；规划轮的决策是
`Replan`（不产正文），所以第一帧一直是对的。规划轮一删，第一轮就可能同步流出 `delta` ——
`run_started` 还没推出去（要等 `run()` 把控制权交回调用方）。现在 `run_started` 之前的帧先排队
（`packages/server/src/turn.ts` 的 `pushOrQueue`），出队后顺序不变。

**老会话仍然读得出来。** 重放把认不得的事件类型跳过（不计成坏行），界面把它渲染成一行
「未识别的事件类型：plan_updated（这份历史来自另一个版本）」—— 不静默丢，也不崩。

**验收**：全仓 `typecheck` / `test` / `build` 三绿，**762 通过 / 7 跳过**（删掉的是专门测这两套
机制的用例：runtime 的 initial-plan / replan / verification / deliverables、core 的 deliverables、
CLI 的 8 条验收用例、Web 的 3 条计划与验收用例）；`node scripts/audit.mjs --with-e2e` 全绿
（端到端真浏览器跑完一条任务：`runs=1`、事件 6 条、`stopReason: task_completed`、console 无 error）；
另外在真部署（4000）上核对了旧会话的渲染与新导航，无 console 报错。

## 未发布 — 桌面壳对齐（端口记忆 / 托盘 / 日志 / 自带 CLI）

对照 penguin 桌面端的功能清单（`docs/research/penguin-desktop-features.md`，71 条）补齐第一批，
逐条状态与后续顺序见 `docs/desktop-parity.md`。这一批的共同点是**都不需要原生模块或外部服务**，
因此能在没有图形界面的机器上真跑验证（Linux + Xvfb，见下）。

### 端口记忆：界面状态不再每次重启就丢

壳原来每次启动都向内核要一个新的随机端口，而界面（连接设置、主题、侧栏开合）是按 `origin`
存在浏览器里的 —— 端口一变就是另一个站点，用户看到的是「我设过的全没了」。

- `port-memory.ts` 补上 `isPortAvailable` / `choosePort`：先试上次那个端口，绑不上才让内核
  分配；最终端口写进 `<userData>/port.json`（0600）。
- 真跑两次确认：第二次的日志是「端口 36931（沿用上次）」。

### 窗口尺寸与位置

- 新增 `window-state.ts`：解析 / 序列化 + `stateFromBounds` + `clampToWorkArea`。读回来的坐标
  **永远**先夹进某块屏幕的 `workArea` —— 换了显示器、拔了外接屏之后，上次那组坐标可能整个在
  可见区之外，症状是「点了图标没反应」。
- 关窗 / 拖拽 / 改尺寸时落盘（400ms 合并），用 `getNormalBounds()` 而不是 `getBounds()`：
  最大化时后者是整屏，存下来就把原始尺寸丢了。

### 托盘与菜单

- `tray-prefs.ts` / `tray-menu.ts`（纯逻辑）+ `tray.ts`（Electron 胶水）：菜单**每次弹出前重建**，
  Linux 认常驻菜单而 Windows / macOS 左键唤起窗口；图标与「关窗留守」偏好存
  `<userData>/tray.json`。
- 关窗留守要**三个条件同时成立**（没在退出中、托盘图标真的在、偏好是开的）：否则会造出
  「没窗口也没托盘图标、进程还在跑」这种用户逃不出去的状态。托盘创建失败（精简的桌面环境里
  `new Tray` 会抛）只记日志、不阻断启动 —— `hasIcon()` 因此回 false，关窗就真的退出。
- 新增 `app-menu.ts`：文件（数据目录 / 日志 / 退出）、编辑与视图（复用 `role`）、帮助（关于）。

### 日志

- 新增 `desktop-log.ts`：每行一条 ISO 时间戳，超过 5 MB 轮换成 `.1`，**写失败就静默关掉**
  （日志坏了不能影响应用）。渲染进程崩溃、无响应、加载失败各落一行，内置服务端的
  stdout/stderr 接进同一个文件。
- 启动失败的对话框带上日志路径 —— 用户报「打不开」时能直接把文件发过来。

### 自带 CLI：装了桌面版，终端里就能敲 `adelie`

- `cli-link.ts` / `cli-install.ts` + `main.ts` 启动时调一次。启动脚本用
  `ELECTRON_RUN_AS_NODE=1` 把应用自带的运行时当 Node 跑自带 CLI，因此**用户不需要装 Node**。
- 两条「绝不」：不覆盖不是我们写的 `adelie`（判据是脚本里的 marker），不从 dmg 挂载点 /
  AppTranslocation 装（那两个位置写出去的链接会悬空）。
- 打包时把 `packages/cli/dist` 整份搬成 `<app>/cli-dist`，**不用 tsup 再打一遍**：那份产物已经
  过 CLI 自己的构建与 npm 安装验证，里面 `assets/`、`web-dist/` 的相对位置都是它预期的。
- 每次启动自修复（应用搬过家会留下悬空链接）；POSIX 上 `~/.local/bin` 不在 PATH 时写进日志
  提醒，Windows 上把目录并进**用户** Path（走 `[Environment]`，不用会截断的 `setx`）。

### 外链与导航

- 新增 `links.ts`：`sameOrigin` 与 `isOpenableUrl`（只放行 `http` / `https` / `mailto`）。
- 主窗口补上 `will-navigate` 守卫：界面是 SPA（路由走 `pushState`），所以「要导航离开本站」
  一定是外链或误点 —— 交给系统浏览器，窗口原地不动。少了这条，一个普通 `<a href>` 就能把
  应用窗口顶成别人的网页，而且没有后退键。

### 修复：开发态的窗口图标一直是空的

取图标时找的是 `brand/icons/icon.png`，而仓库里只有 `128x128/256x256/512x512.png` ——
`existsSync` 一路为假，`BrowserWindow` 与（新加的）托盘都拿不到图标。现在按「存在的文件」
取；打包后仍走 `<app>/icon.ico`。

### 验证

- desktop 包新增 77 个单测（合计 767 通过 / 7 跳过）；`node scripts/audit.mjs` 无新增发现。
- **真机冒烟（Linux + `xvfb-run`，`--no-sandbox`）**：启动 → 端口沿用 → 内置服务端就绪 →
  页面加载无失败 → 托盘图标建起来 → CLI 装到 `~/.local/bin/adelie` 并能跑出 `adelie 0.1.0`
  → `SIGTERM` 后走正常退出序列（`before-quit` 收尾、窗口状态落盘、无残留进程）。
- 顺带纠正一处认识：**Electron 自己**接住 SIGINT / SIGTERM 并走正常退出序列，主进程里的
  `process.on("SIGTERM")` 不会被调用（已实测），所以没有为信号加监听器。
- **没验证**：Windows 打包后的形态（`cli-dist` 的实际布局、写注册表那条路）——
  `docs/issues/desktop-windows-cli-unverified.md`。

## 未发布 — 自检方法与发布产物清理

### 新增：应用体检（`node scripts/audit.mjs`）

一条命令回答「这个应用现在有没有毛病」。它替人干的是「该看哪儿」这件**可枚举**的事，
剩下需要判断的才是人的活。规则与用法见 `docs/audit.md`（`pnpm run audit` 也行 ——
裸的 `pnpm audit` 是 pnpm 自带的依赖漏洞扫描，两回事）。

- 十三条检查，每条都对应一类**已经发生过**的事故：三个闸门（typecheck / test / build）、
  端到端冒烟（`--with-e2e`：真服务端 + 真引擎 + 假模型 + 真浏览器）、
  契约路由与代码一一对应、前端请求路径都在契约里、错误码与契约 §8 对齐、权限表每一行
  对着真路由、issue 草稿合规、源码里的欠账标记、提供方没绕开模型目录、密钥卫生
  （值不进仓库/不进日志/文件 0600）、产物没有已删源的残渣、版本与 workspace 依赖声明、
  文档里自认未验证的结论。
- 缺条件就**跳过并说明**，不当成失败（比如本机没装浏览器）：一句「跳过」比一条假的
  缺陷有用得多 —— 假的报几次，这种报告就没人看了。
- 只报告、不修东西；每条发现都带 `文件:行` 或命令作证据；`--fail-on` 决定哪一档开始挡
  发布（默认 P1，CI 用 P2），**已经记进草稿的发现不挡门槛**（由 issue 跟踪，把 CI 一直
  挂红只会让人开始忽略它）。
- 挂进 CI（`.github/workflows/ci.yml`）：`--no-gates --fail-on=P2`。三个闸门 CI 本来就
  单独跑，体检补的是它们看不见的那一半。

- 修 `scripts/e2e.mjs` 的一处取材限制：它现在也认 `playwright-core`（那里只用
  `chromium.launch()`，两者 API 一致），于是没有 `@playwright/test` 的机器也能跑端到端。
  体检第一次带 `--with-e2e` 的通过就是用它跑出来的：任务完成、工作区里真的落了文件、
  console 无 error、回放 events=8。

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
