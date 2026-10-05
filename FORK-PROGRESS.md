# fork 推进台账（`fork/penguin-base`）

> Adelie 从 2026-10-04 起改用 PenguinHarness 的整棵代码树当基座（用户定的「B」方案）。
> 决定原文与背景在 `FORK.md`；这份文件是**这条分支上的工作量台账**，与 `main` 上那两本
> （`docs/engine-progress.md`、`docs/web-progress.md`，都是旧 Adelie 的）无关 —— `main` 是旧的、
> 自写的 Adelie，已经冻结，不再往上加东西。

## 纪律（每轮开工前读一遍）

- 在 `git worktree` 检出的 `/root/adelie-fork` 里干活，**不要在 `/root/Adelie` 的工作区切分支**：
  `adelie-web.service` 直接读 `/root/Adelie/packages/{server,web}/dist`，切过去会把线上那个
  旧 Adelie Web 换成另一份服务端。
- `/root/penguin-harness` 只读，是 `upstream` remote 的来源；`main` 不动。
- Apache-2.0 义务照 `FORK.md`：保留 `LICENSE` 与 `THIRD-PARTY-NOTICES.md`、不留上游商标做我们的
  名号，改动要看得出来（台账 + 提交说明）。
- 每一条都要有可复现的命令与输出才算完成；卡在需要用户拍板或需要新凭证时，**停在那一项上写清卡点**，
  不要猜着改。
- 不要切版本号、不发 npm、不发安装包、不发邮件（发布链路是最后一步，届时单独定）。

## 待办

### 2. 自有化（改名、数据根、端口）

- [x] 2.1a **界面品牌名**：`appName` 换成 "Adelie" —— 顶栏标题与浏览器标签页标题都由它来
      （`packages/web/src/lib/strings.ts`、`strings-en.ts`、`index.html` 的 `<title>`），
      端到端断言里的角色名跟着改。验收：起服务后标签页是 `Chat · Adelie`，顶栏右上角写 Adelie。
- [x] 2.1b **图标**（2026-10-05）：用旧 Adelie 自己的标志替掉企鹅图案 —— 资产取自
      `/root/Adelie/brand/adelie-icon.svg`（阿德利企鹅，眼周白环 + 蓝色轨道），落到
      `packages/{web,docs,ui-gallery}/public/adelie-icon.svg`，删掉三份 `penguin-logo.svg`；
      引用点全部改掉（favicon、登录页、新建对话页空态、完成通知图标、端到端断言、
      文档站与画廊的 favicon/topbar、desktop 的 `render-icon.mjs`、README 的 logo）。
      `packages/ui` 里的组件与文件 `PenguinLogo` / `penguin-logo.tsx` → `AppLogo` / `app-logo.tsx`。
      **待用户定**：这个标志的 `desc` 里写着「蓝色轨道是 PenguinHarness 画在 agent 外面的那道」，
      图形上也确实借了那道环 —— 那是旧 Adelie 已经发布过的品牌（设计页 / PWA / 安装包都用它），
      所以这次照搬没改；哪天要彻底避开上游母题，得重画那道环。
- [x] 2.1c **产品名全仓统一**（2026-10-05）：140 个文件里 `PenguinHarness` → `Adelie` —— 源码字符串
      与注释、README、CI、安装脚本、issue 模板、示例、`package.json` 的 description 都在内。
      **有意没动的**：`LICENSE` / `THIRD-PARTY-NOTICES.md`（法律原文）、`changelog/`（历史）、
      `.agents/`（上游的开发技能文档）、`packages/docs/`（留作内部参考）、`scripts/ui-migrate.json`
      （一次性迁移清单）、`packages/ui/src/fonts/misans/README.md`（字体授权记录）、
      `packages/core/test/fixtures/toggles-generation-system-prompt.txt`（**冻结的旧模板字节**，
      改了会让内核哈希的「重建证明」失效 —— 已实测踩到并还原）。
- **连带必须做的一件事：推进内核版本**。默认 system prompt 里就写着产品名，改名必然改它的哈希：
      按 `packages/core/src/state/kernel-history.ts` 里写好的流程把 `KERNEL_VERSION` 提到 `2026-10-05`、
      旧 prompt 哈希追加进 `KERNEL_SUPERSEDED_TAB_HASHES.prompt`、写入新哈希，并在生成列表里记一行。
      另一个坑：`packages/server` 的测试从 **core 的 dist** 读模型目录，改完 core 源码不重建，
      服务端测试会看到旧名字 —— 先 `pnpm --filter …core build` 再跑测试。
- 遗留（不在这条里）：`~/.penguin`、`PENGUIN_*` 环境变量、`penguin` 命令名（2.2 / 2.3），
      npm scope `@prismshadow/*`（4.1），以及 `penguin.ooo` 那几个上游服务地址（不能瞎改，见下）。
- [ ] 2.2 **数据根**：`~/.penguin` → `~/.adelie`；`PENGUIN_HOME` 等环境变量名是否跟着改，先定口径
      （建议：变量名改成 `ADELIE_*`，并在 `resolveRoot()` 里兼容读一次旧名，方便旧数据迁过来）。
- [ ] 2.3 **端口与 profile 默认值**：服务器默认端口、CLI 默认端口（现在是 7369）与旧 Adelie 的
      4000 / 7370 对齐，避免两个产品抢端口。
- [ ] 2.4 **README 与包元数据**：根 `README.md` 换成 Adelie 自己的说明 + 「基于 PenguinHarness」的
      来源声明（`FORK.md` 已有，README 里指过去即可）。
- [x] 2.5 **上游 `landing` / `docs` / `ui-gallery` / `hmr` 的去留（2026-10-05 定，用户「看你」）**：
      - **删 `packages/landing`**（官网 + 博客 + 下载页，163 文件 / 3.0M）：整站都是上游产品的宣传
        与 `penguin.ooo` 链接，对 Adelie 没有一处价值。连带删掉只为它存在的
        `scripts/build-site.mjs` 与 `.github/workflows/pages.yml`（把落地页 + 文档站组装成
        penguin.ooo 那一个 Pages 站），并清理各处引用：README 的 logo、root scripts 的
        `dev:landing` / `build:site`、CI 的过滤器、`scripts/test-installer.sh` 里那段
        「penguin.ooo 转发器」用例（转发器没了，被测对象也就没了）、`.oxlintrc` 的 `.blog-assets`、
        `.gitignore` / `.dockerignore` 的忽略项、`packages/core` 端口表里的 7366 行、
        两个安装脚本注释里的指向。
      - **留 `packages/docs`**：它是引擎的配置 / 接口 / 快速开始文档（双语），不是宣传；留作内部参考，
        不发布、不改品牌 —— 品牌改写与要不要上线，等发布期一起定。
      - **留 `packages/ui-gallery`**：改界面时的组件参照工具；依赖没装就不装。
      - **留 `packages/hmr`**：`packages/server` 的 workspace 依赖，删了服务端起不来。

### 3. 把旧 Adelie 已经做过的东西接回来

- [ ] 3.1 审批口径三档（旧 Adelie 的行为约定）对照上游的审批模型，能删就删。
- [ ] 3.2 模型目录（deepseek / kimi / qwen）与费率表。
- [ ] 3.3 用量与成本页（旧 Adelie `web` 台账第 4 条那一套：`/api/usage` + 成本中心）。
- [ ] 3.4 用户与两档角色、会话归属。
- [ ] 3.5 桌面壳：上游 `penguin-desktop` 与旧 Adelie 那个取一个。
- [ ] 3.6 用真模型发一条消息（需要 key；这是步骤 1 唯一没验完的一条）。

### 4. 发布链路

- [ ] 4.1 npm scope：`@prismshadow/penguin-*` → Adelie 自己的 scope（旧包是 `@lmliheng/adelie`、
      `adelie-core` / `adelie-server` / `adelie-web` / `adelie-desktop` 等）。**只和发布一起做** ——
      内部改名 968 个文件、零功能收益，放到这里一次做完。`@prismshadow/agenthub` 是**外部**包
      （见下），改名时不能碰。
- [ ] 4.2 GitHub Pages（PWA）、设计站、Windows 安装包三条流水线按新仓库结构重写
      （上游那条 Pages 流水线已随 `landing` 删掉）。
- [ ] 4.3 **旧的四件产物要更新**（用户 2026-10-05 定：按新基座重发新版，不是下架）。

## 本机部署（2026-10-05）

| | |
| --- | --- |
| 单元 | `adelie-app.service`（`/etc/systemd/system/`）—— 新基座的 Web 服务端 |
| 端口 | **3004**（`HOST=0.0.0.0`，ufw 与 `/root/egress-whitelist/config.json` 都已登记） |
| 数据根 | `/root/adelie-data`（工作区 `/root/adelie-data/workspace`） |
| 代码 | `/root/adelie-fork` 的 `packages/server/dist/index.js` + `packages/web/dist` |
| 首次登录 | 启动输出里的 claim 链接（同内容也写在 `/root/adelie-data/首次登录链接.txt`，0600）；打开它认领内置管理员 `admin` 并设密码。忘了密码：停服务后 `penguin server reset-admin-password` |
| 旧地址 | 上游设计规格页已从 3004 让到 **3003**（`adelie-design.service`，同步改了单元与端口表）；旧 Adelie Web 仍在 4000（`adelie-web.service`） |

要跑真任务还得在这个新实例里配模型 key（数据根独立，读不到旧实例的 `.project_config.toml`）。

**重启的代价**：服务端自己改了什么（字符串、core 的 dist）**要等一次重启才生效** —— 而重启会换发
首次登录链接（`/root/adelie-data/首次登录链接.txt` 里那条就作废了）。所以**在用户认领之前不要
重启**：前端产物是每次请求从磁盘读的，重建 `packages/web/dist` 即时生效，不用重启。

## 两个运行时事实（改名时别踩）

- **`@prismshadow/agenthub` 是外部 npm 包**（0.4.15，Apache-2.0，「AgentHub — the LLM API Hub for
  the Agent era」）：`packages/core` 与 `packages/cli` 的依赖，提供 `AutoLLMClient`，把
  OpenAI / Anthropic / Gemini / Bedrock 各家的 SDK 抹平成一个接口。不是我们的代码，
  scope 改名时必须排除（另有 `@prismshadow/example-*`、`penguin-plugin-sandbox-*` 要按归属分别判断）。
- **上游自有网关是代码里的默认端点**：`https://token.penguin.ooo/api`（`PENGUIN_GO_BASE_URL`）、
  `https://go.penguin.ooo/modelscope`、`https://penguin.ooo/`。这些是**他们的服务**，
  哪天关掉就会影响 Adelie —— 发布前要么确认继续可用，要么改成自己的（用户本来就走
  deepseek / kimi / qwen 直连 key 的路线）。
- **字体授权要落实**：`packages/ui/src/fonts/misans/README.md` 记的是 MiSans（小米）授权给
  「PenguinHarness 应用」使用。这份记录我按原样保留了（它是一份授权事实），但 **fork 后用同一个
  字体是否覆盖 Adelie，得看授权条款** —— 要么确认覆盖，要么换字体。这条要用户/法务拍板。

## 已拍板（2026-10-05，用户）

- **A. 上游四个包**：见 2.5 —— 用户「看你」，按上面办（删 `landing`，留 `docs` / `ui-gallery` / `hmr`）。
- **B. 旧的四件产物**：**更新**（按新基座重发新版），不下架。
- **C. 仓库落点**：仍是 `lmliheng/Adelie`。`main` 现在是旧 Adelie，新基座长在 `fork/penguin-base`；
  何时把新基座变成默认分支、旧 `main` 怎么留档，等发布期一起定。

## 已完成的轮次

| 日期 | 条目 | 做了什么 | 验证 | 提交 |
| --- | --- | --- | --- | --- |
| 2026-10-04 | 0 | 建 `fork/penguin-base` = 上游 `develop` @ `18d7c137`，加 `upstream` remote，`git worktree` 检出到 `/root/adelie-fork` | `git log -1`、`git remote -v`；已 `push origin fork/penguin-base` | `f30a91b8` |
| 2026-10-04 | 1 | 写 `FORK.md`（来源、许可证义务、要改什么、旧 Adelie 在哪） | 文件存在，随基座一并推送 | `f30a91b8` |
| 2026-10-04 | 1 | 本机装、构建、起服务、真浏览器看一眼 | 安装 3.2s 全 hard-link；`pnpm -r build` 全绿（web 2.58MB JS / 787KB gzip）；`PORT=7391` 起来后 Playwright 截图 `fork-look/01-app.png`，console 无 error | 无（环境动作） |
| 2026-10-05 | 1 | 复跑基座测试 | ui 999 / core 1346+5skip / server 2552+2skip / cli 509 / web 2886+2skip，合计 **8292 passed / 9 skipped / 0 failed**，`EXIT=0` | 无（环境动作） |
| 2026-10-05 | 2.1a | 界面品牌名换成 Adelie（appName ×2 + `index.html` 标题 + 4 个端到端断言） | web typecheck 过；`pnpm --filter …web test` 236 文件 / 2886 通过；重建 dist 后在 7391 起服务，Playwright：标签页 `Chat · Adelie`、顶栏可见 `Adelie`、console 无 error | 见本行提交 |
| 2026-10-05 | 2.5 | 删掉上游官网 `packages/landing`（163 文件）与只为它存在的 `scripts/build-site.mjs`、`.github/workflows/pages.yml`，并清理 README / CI / 安装测试 / 端口表 / 忽略文件里的引用 | `pnpm lint` 0 警告；六个包 typecheck 过；`pnpm install --lockfile-only` 刷新锁文件（-93 行）；`sh scripts/test-installer.sh` 通过；core 1346 / ui 999 / cli 509 / web 2886 全绿；server 先因 `dist/install.sh` 副本过期报 2 条失败，重建 server 后 **179 文件 / 2552 通过 / 2 跳过**；`pnpm format:check` 干净 | 见本行提交 |
| 2026-10-05 | 部署 | 新 Adelie 起在 **3004**（`adelie-app.service`，数据根 `/root/adelie-data`）；上游设计规格页让到 3003 | `curl` 127.0.0.1 与外网地址都 200；Playwright 打开 3004 是 `Sign in · Adelie`、唯一 4xx 是登录前的 `/api/me` 401（预期）；`ss` 确认 3004 绑 0.0.0.0；ufw 与运维面板端口表已登记 3003/3004 | 无（环境动作） |
| 2026-10-05 | 2.1b | 界面图标换成 Adelie 自己的标志（三份 `penguin-logo.svg` → `adelie-icon.svg`，组件 `PenguinLogo` → `AppLogo`，全部引用点跟上） | ui 999 / web 2886 全绿；ui / web / docs / ui-gallery typecheck 过；`pnpm format:check` 干净；重建 web 产物后 **3004 现网**已供新图标（favicon 200、`<title>Adelie</title>`），Playwright 看登录页：阿德利企鹅标志 + 标题 Adelie，唯一 4xx 仍是 `/api/me` 401 | 见本行提交 |
| 2026-10-05 | 2.1c | 产品名全仓统一成 Adelie（140 文件），并推进内核版本 `KERNEL_VERSION` → `2026-10-05` | `pnpm lint` 0 警告；八个包 typecheck 过；`pnpm format:check` 干净；`sh scripts/test-installer.sh` 通过；测试 **8485 通过 / 7 跳过 / 0 失败**（docs 62 · core 1346 · ui 999 · server 2552 · cli 509 · web 2886 · ui-gallery 131）；3004 现网重建后登录页再无旧名字，Playwright 复核正常 | 见本行提交 |
