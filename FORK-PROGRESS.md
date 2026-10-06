# Adelie 推进台账（`main`）

> Adelie 从 2026-10-04 起改用 PenguinHarness 的整棵代码树当基座（用户定的「B」方案）。
> 决定原文与背景在 `FORK.md`；这份文件是**主线上的工作量台账**。
>
> **分支口径（2026-10-05 起）**：主线就叫 **`main`**（仓库默认分支）—— 它是新基座，
> 2026-10-05 从原来的 `fork/penguin-base` 并过来、旧名已删。**旧的、自写的 Adelie 现在叫
> `legacy/main`**（尖端 `7fb74262`），工作区在 `/root/Adelie`，已经冻结，不再往上加东西；
> 旧 Adelie 那两本台账（`docs/engine-progress.md`、`docs/web-progress.md`）在 `legacy/main` 上。
> 这份文件里 2026-10-05 之前的记录写的是 `fork/penguin-base`，指的正是今天的 `main`。

## 纪律（每轮开工前读一遍）

- 在 `git worktree` 检出的 `/root/adelie-fork` 里干活（**分支 `main`**），**不要在 `/root/Adelie`
  的工作区切分支**：那个工作区挂在 `legacy/main`（旧 Adelie）上，而 `adelie-web.service` 直接读
  `/root/Adelie/packages/{server,web}/dist`，切过去会把线上那个旧 Adelie Web 换成另一份服务端。
- `/root/penguin-harness` 只读，是 `upstream` remote 的来源；`legacy/main` 不动。
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
- [x] 2.2a **数据根与安装目录**（2026-10-05）：`~/.penguin` → `~/.adelie`，变量 `PENGUIN_HOME` →
      `ADELIE_HOME`（旧名仍读一次，作兼容别名）。逐处：`core/src/state/paths.ts` 的 `resolveRoot()`
      （导出 `ROOT_ENV` / `LEGACY_ROOT_ENV` 两个常量，避免别处再写一遍字符串）；`server/src/config.ts`
      从**传入的** env 对象里按同一优先级取（导入那两个常量）；`install.sh` / `install.ps1` 的默认安装目录
      → `~/.adelie`（`PENGUIN_INSTALL_DIR` 这个变量名本轮不动，见 2.2b）；`cli/src/commands/update.ts` 的
      `defaultInstallDir`；**两个启动脚本** `scripts/launchers/penguin{,.cmd}` 导出
      `ADELIE_HOME="${ADELIE_HOME:-${PENGUIN_HOME:-$DIR/data}}"` —— 安装器的「数据根在程序目录下的
      `data/`」这一约定因此保住，升级不会把旧装的数据「变没」（旧装仍在 `~/.penguin`，装的又是老启动脚本，
      所以新版本必须自己会算这个路径）；`core` 把子进程环境的剥离规则从「`PENGUIN_` 前缀」扩成
      「`PENGUIN_` / `ADELIE_` 两前缀」（不扩的话 `ADELIE_HOME` 会漏进 Agent 跑的命令，而它指的正是服务端
      自己在用的那个根 —— 启动脚本会把它导出来）。CLI 文案 / 注释、`packages/core` 里的端口表、示例
      `examples/self-improving-agent/*` 里写死的 `~/.penguin/data` 一并改。
- [x] 2.2b **控制面变量改名**（2026-10-05）：把 Adelie 自己产、自己消的那批 `PENGUIN_*` 环境变量改成
      `ADELIE_*` —— 25 个名字 / 77 个文件：`AGENT_ID`、`SESSION_ID`、`PROJECT_ID`、`ORG_ID`、`API_URL`、
      `API_TOKEN`、`API_PROXY`、`LANG`、`SHELL`、`TERMINAL`、`SUPERVISED`、`SERVE_CHILD`、`TRUST_PROXY`、
      `PREVIEW_ORIGIN`、`UPDATE_CHECK`、`PASSWORD`、`SEED_ADMIN_PASSWORD`、`ADMIN_PASSWORD`，加上测试脚手架
      （`E2E`、`TEST_HELPER`、`TEST_CHROMIUM`、`RUNNER_MARK`、`VAULT_ADDED`、`VAULT_TEST_KEY`、
      `SOME_FUTURE_SETTING`）。源码注释、zh/en 文案、`plugins/*/skills/*/SKILL.md` 里的契约说明、
      `docker/compose.yaml` 的示例环境一并跟上。
      **旧名不再生效**（2.2a 的 `PENGUIN_HOME` 除外）：这批变量的两端都是本仓库自己的代码，没有外部所有者，
      因此不设兼容别名 —— 升级后 shell rc / systemd 里请改用新名。`core` 的子进程剥离规则**仍保留两个前缀**：
      边界面那批（见 2.2c）今天仍写作 `PENGUIN_*`，且既有部署的单元文件还在设它们。
- [ ] 2.2c **边界面变量名**（每一个的另一端都在本仓库之外；**读侧已做，见下**）：
      - **读侧已做（2026-10-06，第六轮，提交 `83acbdf0`）**：台账给的第二条路 —— 服务端 / CLI / core
        的读侧同时认两个名字。core 新增 `src/state/boundary-env.ts`：一张 `ADELIE_*` ← 旧
        `PENGUIN_*` 的表（`PROFILE` / `WEB_DIST` / `WEB_DB` / `CLI_ENTRY` / `PORT_FILE` /
        `DESKTOP_TOKEN` / `BUNDLED_SHELL`）加一个读取函数，**新名优先、旧名仍读**（与数据根的
        `ROOT_ENV` / `LEGACY_ROOT_ENV` 同一规则）。读侧接上的地方：`server` 的 `config.ts`（那五个）、
        `http/routes/version.ts` 的 `CLI_ENTRY`、`machines/layout.ts` 的 `PROFILE`、CLI 三个命令的
        `WEB_DB`、core 的 `BUNDLED_SHELL`；`packages/server/README.md` 的环境表与各处注释跟上。
        **写侧一个都没改**（理由见下），所以这一条还不能勾掉 —— 到 2026-10-06 第七轮才把**不是桌面壳
        写的那两处**改掉（见下一条）。
      - **写侧做了一半（2026-10-06，第七轮）**：**不是桌面壳写的那两处已经改用 Adelie 的名字** ——
        两个启动脚本 `scripts/launchers/penguin{,.cmd}` 现在导出 `ADELIE_WEB_DIST`（显式的旧名
        `PENGUIN_WEB_DIST` 仍照办：新名 > 旧名 > 本安装的 `web/`，与 `ADELIE_HOME` 同一写法）与
        `ADELIE_BUNDLED_SHELL`；`penguin server|web`（`packages/cli/src/commands/serve.ts`）导出的入口
        改叫 `ADELIE_CLI_ENTRY`。读侧本来就两个都认，新旧搭配都跑得通（实测见「已完成的轮次」）。
      - **写侧又补一处（2026-10-06，第八轮）**：`machines/commands.ts` 的 `remotePenguin()`——就是第七轮
        那处「有意留着、等语义定下来」的写点——选了**两个都写**这一条路：远端命令现在同时给出
        `ADELIE_HOME` / `PENGUIN_HOME` 与 `ADELIE_PROFILE` / `PENGUIN_PROFILE`，**Adelie 的名字在前**、
        两侧取值相同。理由：这条命令最终落到哪一版 CLI 手上，取决于那台机器 hmr store 里被推过的那一份
        （`dist/penguin-hmr.js` 只负责把它取出来），而 store 里可能仍是更早的发行推上去的、只认旧名的
        那一份；读侧本来就两个都认（核心 `state/boundary-env.ts`，新名优先），所以两个都写就等于
        对两侧都成立。另一条路（探测远端版本）要花一次握手 —— 这个文件从头到尾都在数握手次数 —— 而且
        store 里同时可能存在改名两侧的版本，探出来也不一定对。细节与实测见「已完成的轮次」最后一行。
      - **还差什么（做这一条时要一起收的尾）**：
        1. **写侧剩下的全在桌面壳一侧**：`packages/desktop/src/{server-process,launcher,web-dist}.ts`
           仍导出 / 传 `PENGUIN_PROFILE` / `PENGUIN_CLI_ENTRY` / `PENGUIN_WEB_DIST` / `PENGUIN_DESKTOP_TOKEN` /
           `PENGUIN_PORT_FILE` / `PENGUIN_BUNDLED_SHELL`（读侧两个都认，所以今天也跑得通）。桌面壳按纪律
           本机没碰（依赖没装、3.5 才决定取哪个桌面壳），这一批等那一步一起改。
           （`machines/commands.ts` 的远端命令写点 2026-10-06 第八轮已改，见上。）
        2. **本机部署**：`adelie-app.service`（3004，已 stop + disable）仍设 `PENGUIN_HOME` /
           `PENGUIN_WEB_DIST` / `PENGUIN_CLI_ENTRY`；读侧现在两条都认，所以不改也能跑，要在发布版
           里换新名得连单元一起改（发布动作）。
        3. 桌面壳自己的开关 `DESKTOP_SMOKE` / `DESKTOP_SMOKE_SHOT` / `NO_LOGIN_SHELL_ENV` /
           `UPDATE_FEED_URL` / `BB_SMOKE_BUNDLE`：只在桌面壳里读，与它同一批改。
      - **桌面壳 / 启动器 / 既有部署**：`PROFILE`、`WEB_DIST`、`WEB_DB`、`CLI_ENTRY`、`PORT_FILE`、
        `DESKTOP_TOKEN`、`BUNDLED_SHELL`、`DESKTOP_SMOKE`、`DESKTOP_SMOKE_SHOT`、`NO_LOGIN_SHELL_ENV`、
        `UPDATE_FEED_URL`、`UPDATE_SOURCE`、`UPDATE_SPEED_PROBE`、`BB_SMOKE_BUNDLE` —— `packages/desktop`
        本机按纪律没碰（3.5 才决定桌面壳取哪个），而且 `adelie-app.service` 这类既有单元现在仍设
        `PENGUIN_HOME` / `PENGUIN_WEB_DIST` / `PENGUIN_CLI_ENTRY`。要在服务端 / CLI 的读侧同时认两个
        名字 —— **这半条 2026-10-06 已做完，见上**。
      - **安装器与发布协议**：`VERSION` / `INSTALL_DIR` / `ARCHIVE` / `DOWNLOAD_BASE_URL` /
        `DOWNLOAD_FALLBACK_BASE_URL` / `DOWNLOAD_SOURCE` / `DOWNLOAD_SPEED_PROBE` / `COMMAND`，
        以及 build 戳 `__PENGUIN_RELEASE_VERSION__` / `__PENGUIN_BUILD_GIT__` —— `install.sh` 是运行中的 CLI
        从 Releases 现下的脚本，旧 CLI × 新脚本要各说各话，属 4.x 的发布链路。
        （注：另一条线 2026-10-05 已经把桌面壳的 bundle id / 打包坐标换成 Adelie 自己的
        ——`a59342b4`——但**没有动环境变量名**，所以上面那批仍按原样留在桌面壳里。）
      - **上游服务**：`PENGUIN_GO*`（`token.penguin.ooo` 的 provider id 与环境键），不是我们的服务，不动。
      - 顺带记录：`PENGUIN_HINT` / `PENGUIN_KEEP_ATTRS` 是注入页脚本里的局部变量、`PENGUIN_FAMILY` 是 HMR
        family 常量，都不是环境变量，未动；`packages/docs/`、`.agents/`（= `.claude/` 软链）、`changelog/`
        三个文档面按 2.5 的口径不动 —— `.agents/` 是上游自己的开发技能文档，那里的 `PENGUIN_*` 对上游而言是对的。
- [ ] 2.3 **端口与 profile 默认值**：服务器默认端口、CLI 默认端口（现在是 7369）与旧 Adelie 的
      4000 / 7370 对齐，避免两个产品抢端口。
- [x] 2.4 **README 与包元数据**（2026-10-05）：根 `README.md` 与 `README.zh.md` 重写成 Adelie 自己的
      说明 + 「基于 PenguinHarness」的来源声明 —— 头部换成 Adelie 图标 / 名字 / `built on
      PenguinHarness`、一张 `fork of PenguinHarness` 徽章，去掉上游的下载按钮、npm / Pages 徽章与
      penguin.ooo 那一串渠道徽章，正文加 `> [!IMPORTANT]` 声明（来源、商标归属、上游渠道是上游的）；
      「安装」一节改成**本仓库实测过的从源码运行方式** + 明确「Adelie 还没有自己的产物」，
      `> [!WARNING]` 说明上游那些安装方式装出来的是 PenguinHarness；路线图 / 贡献者 / 引用 / 协议
      四节改标为「上游的」，引用里的 bibtex 名字改回 `PenguinHarness`。包元数据（`package.json`
      的 name / version）归 4.1，本版没动。
      **发布说明**：`RELEASE-v0.2.0.md`（仓库根）是 v0.2.0 的发布正文（基于哪个上游 commit、
      这一版改了什么、怎么跑、许可证义务、待办）。
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
- [ ] 4.2 发布流水线重写：上游三条都还是上游的 —— `.github/workflows/release.yml`（tag 触发，
      **已改成只能手动触发**，见下）负责安装包与 npm；`docker.yml` 的 `push: branches: [main]`
      **已删**（它会以 `hiyouga/penguinharness` 这个上游镜像名与账号推 Docker Hub，本仓没凭据只能
      失败），保留 PR 冒烟与手动 dispatch；`desktop-build.yml` 的 `push: release/**`；Pages 那条已
      随 `landing` 删掉。
      **另外**：`ci.yml`（22 个 job）的触发面是 `main`，而主线就是 `main`，所以每次推送都真跑 ——
      2026-10-05 的 run `37264190544`（`1ac076f7`）**22 个 job 全绿**，含此前唯一红的
      `installer-windows`。README 里那条 CI 徽章仍按撤掉的状态（要按 Adelie 自己的仓库结构重写
      流水线仍属 4.x）。
- [ ] 4.3 **旧的四件产物要更新**（用户 2026-10-05 定：按新基座重发新版，不是下架）。

## 发布 v0.2.0（2026-10-05）

用户要求「先发布最新版本到 GitHub，说明是基于 penguin harness 做的」。这一版是**源码版**：

| | |
| --- | --- |
| tag | `v0.2.0`（接在旧 Adelie 的 `v0.1.0` 之后；旧 `v0.1.0` 指向旧 Adelie 的 `ae9da1c9`） |
| 分支 | `fork/penguin-base` |
| 发布正文 | `RELEASE-v0.2.0.md`（仓库根；发布正文用中文） |
| 产物 | **没有**。npm 包 / 安装包 / Docker 镜像 / 下载页都属于 4.x |

**推上去后核对过的远端状态**（用匿名 GitHub API 读公开信息）：分支头 = 发布提交、tag `v0.2.0`
指向同一个提交（注解 tag）、仓库里已有一条旧 Release `v0.1.0`（旧的 Adelie）、`actions/runs`
总数在推 tag 前后都是 26 条且最新一条仍是 2026-10-04 的 main 推送 —— **推 tag 没有触发任何工作流**。
另外用真浏览器（playwright-core + 本地 chromium）打开
<https://github.com/lmliheng/Adelie/blob/fork/penguin-base/README.md> 看过渲染：图标、标题、
`built on PenguinHarness` 副标题、三张徽章与 IMPORTANT 声明都正常显示，无 4xx（两段上游录屏的
mp4 被本机出口白名单挡了，与仓库无关）。

**为发布做的一件安全动作**：`.github/workflows/release.yml` 原本 `on: push: tags: ["v*"]`，
推任何 `v*` tag 都会去构建 `penguin/` 安装包并把 `@penguinharness/*`、`@prismshadow/penguin-*`
发到 npm（上游产物，从我们的 fork 发出去是错的）。已把它改成只剩 `workflow_dispatch`
（文件头加注释说明缘由），所以推 tag 不会触发任何工作流。其余工作流的触发面已逐份核对：
`ci.yml` push/PR 只对 `main`，`docker.yml` push 只对 `main`，`desktop-build.yml` push 只对
`release/**`，`oss-staging.yml` 与 `release.yml` 只有手动。

**Release 已建（2026-10-05）**：用户把 `GH_TOKEN`（`lmliheng` 的 PAT，带 `repo` / `workflow` /
`admin:org`）加进了本 agent 的 vault；`POST /repos/lmliheng/Adelie/releases` 建出
<https://github.com/lmliheng/Adelie/releases/tag/v0.2.0>（release id `403323149`，
`tag_name: v0.2.0`、`target_commitish: fork/penguin-base`、非草稿、`make_latest` 为真 —— 现在
`/releases/latest` 就是它，旧的 `v0.1.0` 还在）。正文取自 `RELEASE-v0.2.0.md`，只是**去掉了开头
那行一级标题**（GitHub 已经把发布标题显示在正文上方，留着会重复）。**没有资产**（assets 0）——
这一版就是源码版。

**注意 vault 的生效时机**：`penguin config vault set` 提示「新对话马上生效，运行中的对话要等下一次
压缩」，所以本轮是直接拿用户给的 token 值调 API 的，没等着环境变量注入。下一轮起用 `$GH_TOKEN`
即可（`env | grep GH_TOKEN` 验证）。**token 值是用户贴在对话里的**，建议用完就轮换/撤销。

**待用户定 → 已拍板（2026-10-05，用户「按你的来」，随后又「按你的改进，把主仓库改成main」）**：
分支口径最终定为 **主线就叫 `main`**，仓库默认分支也是 `main`。做过的事按顺序：先把旧 Adelie 的
`main`（尖端 `7fb74262`）另存成 `legacy/main` 推上去（`main` 本身没动）；把新基座提交并进 `main`
（`git checkout -B main` + `git push --force origin main`；旧历史在 `legacy/main` 里，什么都没丢）；
`PATCH /repos/lmliheng/Adelie` 把 `default_branch` 设成 `main`；删掉旧名分支 `fork/penguin-base`
（本地 + 远端，提交全在 `main` 上）。随后把仓库 About 也改成 fork 的说法：描述
「本地优先的多智能体应用开发平台，构建在 PenguinHarness（Apache-2.0）之上 · A local-first
multi-agent app development platform, built on PenguinHarness」，话题加
`penguin-harness` / `multi-agent` / `llm` / `local-first` / `agent`。

**中途撞上的一件事**：用户 2026-10-05 02:55Z 在网页上直接编辑了 `README.md`（提交 `fba193a3`
「Update README.md」），**把正文删到只剩头部**（图标、标题、`built on PenguinHarness` 副标题、
三张徽章、IMPORTANT 声明、中英切换，共 28 行；`## Why Adelie` 及其后的 180 行全删了）——
那次编辑落在当时的默认分支 `fork/penguin-base` 上，已随 ff 并进 `main`（**没有还原，那是用户的编辑**）。
后果：**README 里现在没有任何安装说明**。要不要补一段指向 3003 下载站的短说明，等用户发话。

**还没接的**：CI（`.github/workflows/ci.yml`，11 个 job）的触发面仍只写 `main`，
新主线 `fork/penguin-base` 上的推送不会跑 CI —— README 里那条 CI 徽章当时一并撤掉了，所以
不存在「徽章说绿实际没跑」的假象。要不要把它接到新主线（并让它真跑绿），归 4.2 一起定。

## 本机安装包与 3003 下载站（2026-10-05）

用户：「把安装包放到3003端口，我好安装，不用给别人用」。v0.2.0 的 GitHub Release **没有附件**
（源码版），所以安装包是**在本机按上游 `release.yml` 的步骤现打**的，落在 3003 那台静态站上
（v0.2.1 同样处理，见下面「v0.2.1」一节）：

| 产物 | 目标 | 说明 |
| --- | --- | --- |
| `adelie-linux-x64.tar.gz`（107 MiB） | Linux x64 | 自带 Node 24.18.0；解开 → `./install.sh` |
| `adelie-win32-x64.zip`（142 MiB） | Windows x64 | 自带 Node + MinGit；解开 → `install.cmd` |
| `adelie-universal.tar.gz`（53 MiB） | 任意平台 | 不带运行时，目标机器要有 Node ≥ 24 |

包落在本机开发区那台静态站上（页面「下载」一节从 `/downloads/index.json` 渲染，v0.1.0 旧
Adelie 那三件原样保留，清单里三版并列）—— **那是开发机，地址不写进任何文档，也不对外
分发**。**装完的命令与数据根仍是
上游拼写**（`penguin`、`~/.penguin`）—— 改名归 2.2 / 2.3，这里不动。

**怎么重打（可复现，脚本在本会话 scratchpad，未入库）**：

```bash
# 1) 装配程序目录（上游 release.yml 的同一步）
pnpm --config.node-linker=hoisted --filter @prismshadow/penguin-cli --prod deploy "$PWD/out/penguin/lib"
cp -r packages/web/dist out/penguin/web
install -D -m 755 scripts/launchers/penguin out/penguin/bin/penguin
node scripts/build-plugins.mjs --out out/penguin/lib/plugins
# 2) 版本戳（照上游 Stamp release version 那步）：临时把 packages/core/src/index.ts 的
#    VERSION/BUILD_DATE/BUILD_COMMIT 改成 0.2.0 / 2026-10-05 / <当前 sha>，重建 core/server/cli/web，
#    构建完 git checkout 还原 —— 装出来的 penguin version 报 v0.2.0（release 通道），
#    而仓库源码里的包版本仍是上游的 0.2.13（版本号统一归 4.1）
# 3) 每个目标加运行时（nodejs.org 官方包 + MinGit）后 tar/zip 成 payload
# 4) 封成上游那种扁平包（安装脚本 + payload + payload 校验和），外层命名 adelie-*
# 5) 拷到 /opt/adelie-design/downloads/v0.2.0/ 并重生成 downloads/index.json
```

**验证过的**（不是推测）：三个包的外层 `sha256` 自检通过；**把 linux-x64 包在隔离 HOME 里
真离线装了一遍** —— `install.sh` 认到同目录的 payload、校验通过、装出 `bin/lib/web/node`，
`penguin version --json` 报 `{"version":"0.2.0","channel":"release","buildDate":"2026-10-05",
"commit":"fba193a3…","node":"24.18.0"}`；用装出来的 `bin/penguin web` 在 7399 起服务，`/` 返回
302 到 `localhost:7399` 后是 `<title>Adelie</title>`，数据根里落了 `web.db` / `api-token`
（用完已停掉该进程）。Windows 包只做了结构与内容抽查（`node/node.exe`、`git/usr/bin/sh.exe`、
`git/etc/profile`、`bin/penguin.cmd`、`package-manifest.json` 写着 `win32-x64`），**没在真 Windows
上装过**；darwin / arm64 两个目标没打（本机装不到）。

**两个副产物**：
- `.gitignore` 加了 `out/` —— 本机打包会在仓库里生成 `out/`，不忽略的话 `git status` 就脏了，
  自主推进那轮会因此收工。
- 3003 页面「下载」那段的说明文字改了（原来只讲旧 Adelie 的 Electron 壳与 Web 包）。**那份页面的源
  在旧仓库 `brand/site`（现在的 `legacy/main`）**，已冻结不再维护，所以部署副本从这一刻起与源分叉；
  改动前的文件备份在 `/opt/adelie-design/index.html.bak-20261005`。

**2026-10-05 重打（用户「重新打安装包，不动线上服务，3004 可以停止了」）**：第三轮收尾提交
`1ac076f7` 之后按同样步骤重打了三件，覆盖 `/opt/adelie-design/downloads/v0.2.0/` 并按新包重生成
`index.json`（v0.1.0 旧 Adelie 那三件原样保留）。版本戳 `VERSION=0.2.0`、`BUILD_DATE=2026-10-05`、
`BUILD_COMMIT=1ac076f7` —— **没有升版本号**：GitHub 上那个 v0.2.0 Release 也没有资产，升 v0.2.1 得先
建 tag + Release，否则 `penguin update --check` 会「报得出新版却装不了」。三件体积
`adelie-linux-x64.tar.gz` 107.0 MiB / `adelie-win32-x64.zip` 141.1 MiB / `adelie-universal.tar.gz`
52.3 MiB。

验证（都不是推测）：三件 `sha256sum -c` 通过；linux-x64 在隔离 HOME 里真离线装 ——
`penguin version --json` 报 `{"version":"0.2.0","channel":"release","buildDate":"2026-10-05",
"commit":"1ac076f7…","node":"24.18.0"}`，`penguin update --check` 报 `Installed 0.2.0 · latest 0.2.0`
（证明更新源确已指向 Adelie），`bin/penguin web` 在 7398 起得来（`/` 302 → `<title>Adelie</title>`，
用完已停）；win 包结构抽查（外层 `install.cmd`/`install.ps1`/`payload.zip`/`payload.zip.sha256`，
payload 内 `node/node.exe`、`git/usr/bin/sh.exe`、`git/etc/profile`、`bin/penguin.cmd`、
`package-manifest.json` 写着 `win32-x64`）；包内 `install.sh` 已确认是新版（`REPO=lmliheng/Adelie`、
`auto | github`、无 OSS 字样）；3003 的 `/downloads/index.json` 与三个资产都 200，页面 200。**3003 与
4000 两个服务全程没停**（这次只停了 3004，见「本机部署」一节）。中间物 `out/` 用完已清理。

## v0.2.1：工作区新建文件夹、侧栏下拉与插件手动更新（2026-10-05，用户点单）

用户原话四件：**①「3004 关闭自启动」②「Agent 不用自动装插件，要手动更新，用户才能自己管控插件」
③「你看能不能优化一下这个左侧的下拉按钮，原本下拉有点丑」④「工作区创建里没有创建目录的功能」**，
另加 **⑤「为什么不升级 0.2.1，你升级」**。提交 `301b80a6`（功能）+ `1e3c7c5c`（画廊 mock）+
`19ea80fa`（发布说明），tag **`v0.2.1`** = `19ea80fa`。

### ① 3004 关掉开机自启 —— 环境动作

`systemctl disable adelie-app.service` → 打印
`Removed "/etc/systemd/system/multi-user.target.wants/adelie-app.service"`；`is-enabled` = `disabled`、
`is-active` = `inactive`（服务此前已 stop）。**单元与数据根 `/root/adelie-data` 都留着**，
要再起用 `systemctl start adelie-app`。

### ② 插件保持手动 —— 不动代码，只拍板

用户这句是**替现有产品行为拍板**，不是报缺陷：现在就没有「自动装插件」这回事。三层各自的行为是
（见「主线三件事」一节）：

| 层 | 谁更新 | 怎么更新 |
| --- | --- | --- |
| 应用本体（`bin`/`lib`/`web`/`node`） | `penguin update` | 用户跑；只换程序，不碰数据根 |
| 插件库 → Agent 上的副本 | **用户手动** | 插件页标出哪些 Agent「落后于库」，一键或批量重装（覆盖该 Agent 的本地改动） |
| Agent 内核（`system_config.yaml`） | **用户手动** | Agent 设置「内核」一节推进，且只推进仍等于默认值的 tab |

所以**代码没动**，只把「要不要更自动」那个待问事项关掉。

### ③ 侧栏下拉不再截断（WORKSPACES 那排的列表选项）

那个下拉的面板宽度写死 `w-40`（160px），而 `Group by workspace` 一行放不下 —— 面板里显示成
`Group by work…`，这就是「有点丑」在哪。`packages/web/src/components/layout/sidebar.tsx` 里把这个
Dropdown 的 `menuClass` 改成按内容自适应：`w-max min-w-40 max-w-[calc(100vw-2rem)]`（与 Finder 自己
那个右键菜单同一写法）。面板是 `portal={{direction:"down",align:"right"}}` 出去的，不受侧栏
`overflow-hidden` 裁剪；重建 web 产物后在浏览器里实测「Group by workspace」完整显示、面板右缘与
触发图标对齐。

> **左侧栏顶部那个 Project 切换下拉（`default_project ▾`）没动，是有意的**：它的面板是
> `left-0 right-0`（与触发按钮同宽），因为 `<aside>` 是 `overflow-hidden`，面板一旦比触发按钮宽就会
> 被裁掉，所以不能也改成内容自适应宽度。若用户指的其实是它，要另做方案（例如把面板 portal 出去）。

### ④ 工作区创建可以新建文件夹

**服务端**（`packages/server/src/http/routes/dirs.ts`）：新增 `POST /api/projects/:p/dirs`
`{ parent, name }`。

- 只建一层，**不递归**：`parent` 写错是 404，不会悄悄长出一棵树。
- `name` 必须是**单个名字**：空 → `dir_name_empty`；含 `/` 或 `\`、`.`、`..`、NUL →
  `dir_name_invalid`。名字由路由自己 `path.join`，调用方无法用分隔符走出当前目录（新增
  `dirNameError`）。
- 失败各有其码（新增 `dirCreateError`）：`EEXIST` → 409 `dir_exists`、`ENOENT`/`ENOTDIR` → 404、
  `EACCES`/`EPERM` → 403 `dir_permission_denied`、`EINVAL`/`ENAMETOOLONG` → 400，其余 500
  `dir_create_failed`。新类型 `DirCreateResponse`。

**前端**（`packages/web/src/features/chat/workspace-finder.{tsx,model.ts}`、`api/endpoints.ts`）：

- 工具栏多一个「新建文件夹」（folder-plus）；手机上工具栏放不下，那一项在**列表空白处的右键菜单**里
  （和「刷新」一样，`finderMenuItems` 的 `here` 一支多了 `newFolder`）。
- 列表首行是内联命名框：Enter 创建、Esc 只关输入框（不关弹窗）、失焦放弃、请求在飞时不重复建；
  空文件夹里也显示这个框（不再显示「此文件夹为空」）。
- 建成后重读该目录并**选中新文件夹**；同名等失败给一条 toast 并保留输入的名字。
- **只对本机服务器提供**：`machine !== null`（ssh 浏览的机器）时不出现这一项 —— 那边的
  `listDirs` 只列目录，服务端没有对应的建目录能力。
- 文案 zh/en：`newFolder` / `newFolderName` / `newFolderHint` + 四个新错误码。
- 画廊的 mock API 也补了这条路由（`packages/ui-gallery/src/app/mock/routes.ts`），否则
  `mock-api.test.ts`「每个 wrapper 都有 mock 路由」那条会红。

**验证（都不是推测）**：server 新增 5 条用例（建成并可见 / 非法名不动盘 / 409 与 404 / 相对路径 /
跨 Project 拒绝）；web 的 `finderMenuItems` 用例更新。浏览器里真跑了一遍：地址栏进
`/tmp/adelie-nf-check` → 工具栏「新建文件夹」→ 输入 `made-in-adelie` → Enter → **磁盘上真的建出来了**、
列表里新文件夹被选中；再输入已存在的 `existing` → toast「That name is already taken.」且输入框保留；
Esc 只关输入框、弹窗还在；空白处右键菜单里有「New folder」。

### ⑤ 升级到 0.2.1

- 建 tag `v0.2.1`（= `19ea80fa`）并推送到 `origin`；建 GitHub Release **v0.2.1**
  （正文取 `RELEASE-v0.2.1.md` 去掉一级标题，非草稿、latest，**仍不带资产**）。
- 按同样步骤重打三件安装包，落 `/opt/adelie-design/downloads/v0.2.1/`，版本戳 `VERSION=0.2.1`、
  `BUILD_DATE=2026-10-05`、`BUILD_COMMIT=19ea80fa`；顶层 `/downloads/index.json` 现在按
  **v0.2.1 → v0.2.0 → v0.1.0** 排列（生成脚本改成"本次在最前 + 其余按版本号从新到旧"，旧的两个
  版本目录原样保留）。
- 3003 页面下载区的导语原来写死「Adelie **v0.2.0**」，改成不写版本的「Adelie（新基座…）的安装包，
  每版一列，最新一版在最前面」（改动前的文件备份成 `index.html.bak-20261005-v021`）。

**v0.2.1 三件的验证（都不是推测）**：三件 `sha256sum -c` 通过
（linux `46641faf…` · win `0f7c76d2…` · universal `3af7cd1c…`）；linux-x64 在隔离 HOME 里真离线装 ——
装完打印 `Adelie v0.2.1 installed`、`payload checksum OK`，`penguin version --json` 报
`{"version":"0.2.1","channel":"release","buildDate":"2026-10-05","commit":"19ea80fa…","node":"24.18.0"}`，
`penguin update --check` 报 `Installed 0.2.1 · latest 0.2.1`（证明更新源确已指向 Adelie 且报得出这一版），
`bin/penguin web` 在 7399 起得来（`/` → `<title>Adelie</title>`，用完已停），且装出来的
`lib/node_modules/@prismshadow/penguin-server/dist/index.js` 里确有 `dir_create_failed` /
`dir_name_invalid` / `dir_exists`（**新建文件夹真的进了包**）；win 包结构抽查（外层
`install.cmd`/`install.ps1`/`payload.zip`/`payload.zip.sha256`，payload 内 `node/node.exe`、
`git/usr/bin/sh.exe`、`git/etc/profile`、`bin/penguin.cmd`、`package-manifest.json` = `win32-x64`，
外层脚本里的 `EmbeddedReleaseVersion = "v0.2.1"`）；3003 内网与外网都 200，
`/downloads/index.json` 三个版本各 3 件，v0.2.1 三个资产都 200，页面下载区渲染出 v0.2.1 卡片在前。
中间物 `out/`、`/tmp/adelie-pack`、`/tmp/adelie-verify*`、`/tmp/adelie-win` 已清，磁盘回到 2.4G。

## v0.2.2：默认项目名 default、中文文案、手机上的导入 Trace 与草稿（2026-10-05，用户点单）

用户原话六件：「初始 project 名改成 default」「新建 project 按钮改成新建项目」「项目管理也一样」
「谁做的新建 project，一半中文一半英文的」「设置里导入 trace 部分 移动端不适配，出现了按钮覆盖」
「还有草稿生成了无法删除」。提交 `e960d0b1`（修复）、`2d6abe83`（`RELEASE-v0.2.2.md`），tag
**`v0.2.2`** = `2d6abe83`。

### ① 初始 Project 名叫 `default`（不是 id `default_project`）

- 采纳（不是创建）共享的那个 `default_project` 时从来没写过显示名，`/api/projects` 的
  `ProjectSummary.name` 于是缺省，前端 `projectDisplayName` 回落到 id —— 侧栏顶部、新建对话页、
  导入 Trace 的项目选择器里显示的都是 `default_project`。
- 修法：core 新增 `DEFAULT_PROJECT_NAME = "default"`；`ProjectConfigService.ensureDisplayName(projectId, name)`
  只在「该 Project 已有配置文件、且没有名字」时写入（`readTable` 为 null 直接返回，**绝不凭空空建
  Project**）；两处调用：`provisionInitialProject` 的采纳分支，以及 **`Startup.setup()` 的启动扫描** ——
  后者是给已有安装的：那种根的 admin 早就存在，`seedAdmin` 会直接 early-return，只在采纳路径补名字
  就永远补不上。
- 非 admin 那条路径不动（`<username>-default_project`，显示名 = 用户名，`auth.test.ts` 一直钉着）。
- 测试三条：采纳后名字是 `default` 且文件里有 `name = "default"`；**已经带名字的（操作者/旧 CLI 起的）
  不被覆盖**；**老根下一次启动后补上**、且启动本身在空根里不会建出任何 Project。

### ② 中文界面里的 `Project` 一律改「项目」

- `strings.ts`（zh）里 68 处 `Project` 译成「项目」：侧栏菜单「新建项目 / 项目设置」、新建对话框
  「项目 ID / 留空则使用项目 ID 作为名称」、项目设置各处、删除项目、模型页「项目默认」、插件页、
  用量页、组织、报错码，全一并去掉中英混排；`default_project` 这类 id 字面量不翻译，英文字典不变。
- 文件头的文案规矩也改了：Project 的界面名与 Agent 的「智能体」同级。**CLI 的 zh 文案（`cli/src/i18n.ts`）
  这轮没动**（用户说的是界面；要一起改的话另开一轮）。

### ③ 设置 → 通用 → 导入 Trace：手机宽度不再压住

- 症状：390px 下三个控件（项目 / Agent / 选择文件）压在行标题上，最右的「选择文件」还切出屏幕。
- 根因在 `PrefRow` 本身：默认主题的 `ui-field` 是**不换行** flex，控制槽 `shrink-0`，控制组再
  `flex-wrap` 也没有可用宽度可用（geek 主题自己有 grid + `max-width:100%`，所以只有默认主题中招）。
- 修法：行改 `flex flex-wrap … gap-x-4 gap-y-2`，控制槽加 `ml-auto max-w-full` —— 放不下整行落到下一行
  并靠右，被 `max-w-full` 卡住后控制组自己再换行。桌面宽度不变；这一改对其它设置行同样有效。

### ④ 草稿会话在触摸屏上删不掉

- 草稿行的删除按钮原本只有 `group-hover` 才显形；触摸屏没有 hover，按钮永远 opacity 0 —— 而它是
  这一行唯一的出口（Session 行还有右键/长按菜单）。桌面鼠标悬停其实点得到，所以只在手机上是死路。
- 修法：改成 `opacity-100 sm:opacity-0 sm:group-hover:opacity-100`（sm 以下常显，sm 以上悬停/聚焦显形），
  与消息脚注的复制按钮同一条规则。

### ⑤ 升级到 0.2.2 与安装包

- tag `v0.2.2` = `2d6abe83` 已推 `origin`；GitHub Release **v0.2.2**（正文取 `RELEASE-v0.2.2.md` 去掉
  一级标题，非草稿、latest、**无资产**）。
- 三件安装包按同样形状重打，落 `/opt/adelie-design/downloads/v0.2.2/`，版本戳 `VERSION=0.2.2`、
  `BUILD_DATE=2026-10-05`、`BUILD_COMMIT=2d6abe83`；顶层 `/downloads/index.json` 现在
  **v0.2.2 → v0.2.1 → v0.2.0 → v0.1.0**。
- **打包脚本这轮换了写法（`pack-assemble-022.sh` / `build-payloads-022.sh` / `build-bundles-022.sh`，
  都在会话 scratchpad，未入库）**：磁盘当时只剩 2.3G，而上一版一次要 ~1.5G 峰值，于是改成**边做边清** ——
  每个 target 建完 payload 就删它的 stage 与下载物、每个 bundle 封好就删它的 stage 与 payload、
  拷进下载目录后再删 `out/bundles`。实测峰值只到 ~0.3G（`out/penguin` ~250M 常驻），打完清掉 `out/`
  后磁盘仍有 **2.0G**；Downloads 目录从 814M 涨到 1.1G。**下轮要打包照这个顺序做。**
- 验证（实测）：三件 `sha256sum -c` 通过；linux-x64 在隔离 HOME 里真离线装 —— `penguin version --json`
  = `0.2.2` / release / `2026-10-05` / `2d6abe83…` / node 24.18.0，`penguin update --check` 报
  `Installed 0.2.2 · latest 0.2.2`，装出来的实例在 7398 起得来（`<title>Adelie</title>`），
  **全新认领后 `/api/projects` 直接报 `{"projectId":"default_project","name":"default"}`**，
  装出的 `web/assets/*.js` 里有「项目 ID」（文案修复确实进包）；win 包外层
  `install.cmd`/`install.ps1`/`payload.zip`/`payload.zip.sha256`，payload 26078 项含
  `bin/penguin.cmd`、`git/usr/bin/sh.exe`、`package-manifest.json`，脚本里没有残留占位符且写的是 0.2.2；
  3003 页面渲染出 v0.2.2 三件在前，内外网地址都 200。
- 浏览器实测（本机临时实例 + **改动之前就建好的数据根**）：项目切换器与导入 Trace 的项目选择器都显示
  `default`（升级路径）；菜单「新建项目 / 项目设置」；新建对话框全中文；390px 下导入行标题与三个控件
  分两行、右缘不出屏；触摸手机上草稿删除按钮 `opacity=1`、点开确认后草稿与「草稿」分组一起消失；
  桌面端静止 `0` / 悬停 `1`，行为与从前一致。

## 主线切到 main 之后：CI / Docker 的真实现状（2026-10-05）

把新基座并进 `main` 之后，`ci.yml`（11 个 job）与 `docker.yml` 的 `push: main` 第一次真的跑起来了。
结果与处置：

| 结果 | job | 原因 | 处置 |
| --- | --- | --- | --- |
| ❌ → ✅ | `test (core)` / `test-macos (core)` / `test-windows (core)` | `core/test/plugins.test.ts`：**README 里找不到插件分类表**（用户当天把 README 正文删到只剩头部） | **已修**（用户选 b）：给 `README_TABLES` 加 `optional`，根 README 没表就跳过，`plugins/README.md` 与 `README.zh.md` 仍必查；CI `37261735096` 三条**实测转绿**（提交 `7cf248d4`） |
| ❌ | `test (rest)` / `test-windows (rest)` / `test-macos (rest)` | `packages/desktop/test/launcher.test.ts` 的夹具还写着 `penguinharness`，而代码算出来的目录名已是 `Adelie` —— 2.1c 改名漏了这个夹具 | **已修**（夹具改成 `Adelie`，本地 `vitest run --root packages/desktop` 308 全绿；改前该文件确有一条红） |
| ❌ | `test-macos (server)` | `test/workflows.test.ts`「notices an Agent's FIRST workflow」在 macOS 上返回 `{}` —— **同一个测试在 Linux 与 Windows 上都是绿的**，看着像 macOS 跑机的抖动 | 记录，暂不动 |
| ❌ → ✅ | `installer-windows` | `scripts/test-installer.ps1`：`forwarder-oss returned an unexpected result` —— 那条转发器用例读的是 `packages/landing/public/install.ps1`，而 `packages/landing` 早在 2.5 就删了（**不是改名引起的**） | **已修**：第三轮把整组转发器用例连同旧安装脚本的 OSS/探针用例一起重写掉；CI run `37264190544` 实测转绿 |
| ❌ | `Docker` | `push: main` 会把镜像**以 `hiyouga/penguinharness` 的名义推到 Docker Hub**（上游的镜像名与账号），而本仓没有 Docker Hub 凭据，只能失败 | **已处置**：删掉 `push: branches: [main]` 这条触发（带注释说明），保留 PR 的构建冒烟与手动 dispatch |

**2026-10-05 复核（CI `37261735096`，支线 `main` @ `7cf248d4`）**：22 个 job 里 20 个绿，
README 插件表那三条已闭，macOS 那条重跑即绿（确系跑机抖动）—— **只剩 `installer-windows` 一条红**
（以及汇总 job `ci` 随之红）。这正是台账 4.2 里「把 ci.yml 接到新主线并让它真跑绿」那一条要收的尾，
现在它只剩一个具体目标了。

**2026-10-05 再复核（CI `37264190544`，`main` @ `1ac076f7`）**：**22 个 job 全绿**，
`installer-e2e` 与 `installer-windows` 都过 —— 4.2 里「让 `ci.yml` 真跑绿」这半条到此收尾。

## 主线三件事（2026-10-05，用户点单）

用户原话三条：**①「删除模型里的官方推荐」 ②「插件，agent升级，是怎么做的，我下载最新版都要更新」
③「最新版更新指向 adelie，不再是 penguin」**，另加一句「b」——README 那条断言取放宽方案。

### b. README 插件表断言放宽（用户选 b）

`core/test/plugins.test.ts` 的 `README_TABLES` 给每份文件加了 `optional` 标志：根 `README.md` 标
`optional: true` —— 你 02:55Z 把正文删到只剩头部，是你自己的编辑，**不还原**，所以它没有表就跳过
这条守卫；`plugins/README.md` 与 `README.zh.md` 仍是必查。**表放回来就自动重新生效**（只有"没有
表"这一种情况被容忍）。**已用 CI 复核**：`7cf248d4` 推上去后 `test (core)` / `test-macos (core)` /
`test-windows (core)` 三条转绿（run `37261735096`）。

### ① 模型库里的「官方推荐」删掉了

- `core/src/state/model-catalog.ts`：删 `ModelProviderInfo.recommended` 字段与 TokenDance 上的
  `recommended: true`，顺序注释改成「TokenDance leads」。
- `web/src/features/models/models-page.tsx`：删掉分组标题栏上那枚金色「官方推荐」胶囊（连同它那段
  配色注释）；`strings.ts` / `strings-en.ts` 的 `recommendedGroup` 文案一起删。
- 测试改成反向守卫：`MODEL_PROVIDERS.some((p) => "recommended" in p)` 必须为 `false`；
  `model-group-expansion` 那条「首组展开」不再靠 `recommended` 断言，仍钉 `tokendance` 在首位。
- `docs/content/models.{en,zh}.md`：两处「The recommended group / 推荐分组」与分组说明里那句
  「TokenDance 分组带有官方推荐标签」一并删掉。
- **默认分组顺序没有动**（TokenDance 仍在最前），变的只是把它标成「官方」的那块 UI。

### ③ 更新链路指向 Adelie

只动了**用户手上这套安装**（CLI + server + Web）里决定「去哪找新版、装哪个包」的地方：

- `cli/src/commands/update.ts`：`REPO_SLUG` → `lmliheng/Adelie`；**删掉 OSS 镜像那一整条臂**
  （`OSS_ORIGIN` / `OSS_RELEASE_ROOT` / `parseOssLatestManifest` / `fetchOssLatestRelease` 与
  `installerCandidates` 的 oss 候选），`DownloadSource` / `ReleaseDiscovery` 收成 `auto|github` /
  `pinned|github`，`resolveRelease` 不再需要 source 参数。理由是那个 OSS 桶是**上游自己的镜像**：
  留着它，两边同名 tag（都有 `v0.2.0`）下会把**上游的 payload** 装进 Adelie。自己搭镜像的运维仍有
  `PENGUIN_DOWNLOAD_BASE_URL` 可用。
- `cli/src/i18n.ts`：`InstallerSource` 去掉 `"oss"`、删 `ossUnavailable` 文案，
  `invalidDownloadSource` 改成「必须是 auto 或 github」，`installerFetchFailed` 去掉 oss 分支。
  刻意**保留** `PENGUIN_DOWNLOAD_SOURCE` 的校验：写 `oss` 直接报错，而不是放行到子进程里让
  `install.sh` 按它去取上游的包。
- `server/src/services/update-check-service.ts`：`REPO_SLUG` → `lmliheng/Adelie`（Web 那条
  「有新版本」提示的比对对象）。
- `web/src/lib/update-flow.ts`：`releaseUrlFor()` 的发布页链接 → Adelie 的 Releases。
- 验证：`pnpm typecheck` 八个包全过；`pnpm lint` 0 警告；`pnpm format:check` 干净；
  core 1346 · web 2886 · cli 505 · server 2552 · docs 62 全绿。

**这条的收尾（2026-10-05，第二轮，已做完）**：

| 项 | 做了什么 | 验证 |
| --- | --- | --- |
| `packages/desktop` 的更新源 | 删掉「速度探测 + OSS 镜像 feed」整套：`src/update-source.ts`（364 行）与 `test/update-source.test.ts`（612 行）删除；`update-support.ts` 只留 `updateSupport` / `feedUrlOverride`；`updater.ts` 单源化（自建镜像只剩 `PENGUIN_UPDATE_FEED_URL` 覆盖，去 OSS / 探针 / 回退 feed）；`RELEASES_URL`、`menu.ts` 的 `REPO_URL` 与 GitHub feed 的 owner/repo 全指向 Adelie | `npx tsc --noEmit -p packages/desktop/tsconfig.json` 退出 0；`vitest run --root packages/desktop` 22 文件 / 279 测试全绿（原 308，少的正是删掉的探针用例）；`PENGUIN_UPDATE_SOURCE` / 探针符号全仓 grep 为空 |
| 根目录 `install.sh` / `install.ps1` | `REPO` → Adelie，删 `OSS_ORIGIN` / `OSS_RELEASE_ROOT`；删速度探测整套（`SPEED_PROBE_*` 常量、`load_release_download_manifest` / `probe_*` / `select_speed_probe_source` / `speed_probe_release_sources` 及 PS 侧同名函数）；`PENGUIN_DOWNLOAD_SOURCE` 收成 `auto\|github`（写 `oss` 直接报错）；不再读 `PENGUIN_DOWNLOAD_SPEED_PROBE`；在线路径只剩 GitHub（stamped 用自身 tag，unstamped 走 latest），`PENGUIN_DOWNLOAD_BASE_URL` 及其 fallback 仍可自建镜像。`scripts/test-installer.{sh,ps1}` 同步重写：删掉共享常量守卫、探针用例与 `packages/landing` 转发器用例（那个目录 2.5 已删，CI 的 `installer-windows` 正是红在这里） | `sh scripts/test-installer.sh` 通过；`pnpm typecheck` 八包过、`pnpm lint` 0 警告、`pnpm format:check` 干净；重建 server 后 `dist/install.{sh,ps1}` 副本与根一致 |
| `server/src/plugin/builtin-index.json` 的四行 `repository` | 四行全改成 `https://github.com/lmliheng/Adelie`；同口径把 14 个 `plugins/*/package.json` 的 `repository.url` 也改成 Adelie（`scripts/check-plugin-versions.mjs` 显式排除三级路径的 `package.json`，不受影响） | core 1346 · server 2552 · cli 505 · web 2886 · desktop 279 全绿 |

**顺带补的一处（原 ③ 漏掉）**：`packages/web/src/components/account/update-modal.tsx` 的
`RELEASES_URL` 还是上游 PenguinHarness 的 Releases —— 更新弹窗「打开发布页」会把用户带到上游项目，
与 ③ 的目标相悖，改成 Adelie 的 Releases（web 2886 测试全绿，无用例钉这个常量）。

**仍未做完的部分**：

| 没做的 | 为什么没做 | 做完的判据 |
| --- | --- | --- |
| Adelie Release 没有资产 | 所以现在 `penguin update` 会答「已是最新」（v0.2.0 = 当前版本），不会去装任何东西 —— 这是对的行为；真要能升级，得按上游同名的资产形状（install.sh + payload + 校验和）发一版；用户「不想给别人用」的那套包在 3003 | 发一版带资产的 Release 后，`penguin update --check` 报得出新版本 |

### ② 插件与 Agent 的升级是怎么做的（答用户问）

三层，互相独立：

1. **应用本体**：`penguin update`（Web 的更新弹窗走 `POST /api/version/update`，后台跑
   `node <cli> update --yes`）。它从运行着的 CLI 自己的真实路径判断安装形态（tarball / npm 全局 /
   源码检出 / 桌面），**源码检出直接拒绝**，Windows 上的 npm 全局安装也拒绝并让你自己跑那条命令。
   升级只替换 `bin/lib/web/node`，**数据根 `~/.penguin/data` 不碰**。
2. **插件**：应用自带一个插件库（`plugins/*` 由 `scripts/build-plugins.mjs` 打包装进
   `lib/plugins`，索引是 `server/src/plugin/builtin-index.json`）。换新版本 = **库里的副本**换新。
   但 Agent 上装过的是**副本**（技能写进 `agent_state/skills/<name>/`、hook 包写进
   `agent_state/hooks/<plugin>/`），不会自己跟着换；插件页会**检测到「落后于库」**
   （`AgentSummary.pluginUpdates`）并给出更新入口：「update installs」旋转按钮 / 每个 Agent 一行，
   语义就是**重装一次** —— 会覆盖那个 Agent 上对插件内容的本地改动，确认框里写明了版本 old → new
   与这条代价，也支持多 Agent 批量更新。所以「下载最新版之后旧插件还在用旧内容」是设计如此、
   一键可修，不是 bug。
3. **Agent 的内核**：Agent 的 `system_config.yaml` 在创建时就烘焙好，**永不自动升级**。每个 tab 的
   哈希与内置默认值比对，Agent 设置页「内核」一节显示 `当前 <内核版本> · 最新 <当前代>`，
   手动点一次「升级内核」只推进**仍等于默认值**的 tab，用户改过的 tab 原样保留并在结果里列出来。
   `KERNEL_VERSION` 是日期串，内置默认值一变就得跟着推进（`core/test/kernel-version.test.ts` 钉哈希）。

**已拍板（2026-10-05，用户）**：第 2 层**保持手动**——用户原话「Agent 不用自动装插件，要手动更新，
用户才能自己管控插件」。也就是说**现在的产品行为就是对的，代码不动**：应用本体升级只换
`bin`/`lib`/`web`/`node`（不碰数据根），插件库随应用换新，但 Agent 上那份副本不自动跟着换，插件页
标出「落后于库」并由用户点一键（或批量）重装。上面那个「要不要更自动」的问题到此关闭。

## 本机部署（2026-10-05）

| | |
| --- | --- |
| 单元 | `adelie-app.service`（`/etc/systemd/system/`）—— 新基座的 Web 服务端 |
| 端口 | **3004**（`HOST=0.0.0.0`，ufw 与 `/root/egress-whitelist/config.json` 都已登记） |
| 数据根 | `/root/adelie-data`（工作区 `/root/adelie-data/workspace`） |
| 代码 | `/root/adelie-fork` 的 `packages/server/dist/index.js` + `packages/web/dist` |
| 首次登录 | 2026-10-05 用户自己设了管理员密码（值不进仓库），首次登录链接**已作废**；现在用 用户名 `admin` + 那个密码登录。忘了密码：停服务后 `penguin server reset-admin-password`，再启动会打印新的认领链接（步骤见 `/root/adelie-data/首次登录链接.txt`，0600） |
| 旧地址 | 上游设计规格页已从 3004 让到 **3003**（`adelie-design.service`，同步改了单元与端口表）；旧 Adelie Web 仍在 4000（`adelie-web.service`） |

> **2026-10-05（用户要求）**：`adelie-app.service`（3004）先 `systemctl stop`，随后按用户
> 「3004 关闭自启动」`systemctl disable` —— `is-enabled` = `disabled`、`is-active` = `inactive`，
> **重启机器不会再自己起来**。服务单元与数据根 `/root/adelie-data` 都留着，要再起用
> `systemctl start adelie-app` 即可。3003 / 4000 未动。

要跑真任务还得在这个新实例里配模型 key（数据根独立，读不到旧实例的 `.project_config.toml`）。

**重启的代价**：服务端自己改了什么（字符串、core 的 dist）要等一次重启才生效，而**重启会换发首次
登录链接**。2026-10-05 用户认领之后已经重启过一次，服务端与仓库同步了；此后重启不再打印链接
（只有 `adminPasswordIsInitial` 为真时才会打印）。前端产物是每请求从磁盘读的，重建
`packages/web/dist` 即时生效，不用重启。

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
- **C. 仓库落点**：仍是 `lmliheng/Adelie`。**2026-10-05 发布 v0.2.0 时定了后续两件并当场做完**：
  默认分支切到 `fork/penguin-base`（旧 `main` 另存 `legacy/main` = `7fb74262` 留档），仓库 About
  改成「基于 PenguinHarness」的说法。细节见「发布 v0.2.0」一节。

## 数据根改名：`~/.penguin` → `~/.adelie`（2026-10-05，条目 2.2a）

一次无人值守的自主推进，只做这一条：**本机数据根与安装目录换成 Adelie 自己的家，变量名跟上，旧名字继续认**。
19 个文件，都在仓库里，没有新依赖、没有切版本号、没发 npm、没发安装包。

### 口径（这条本来就写着「先定口径」）

| 东西 | 旧 | 新 | 兼容 |
| --- | --- | --- | --- |
| 数据根默认值 | `~/.penguin/data` | **`~/.adelie/data`** | 不存在旧默认值，是新装的默认 |
| 数据根变量 | `PENGUIN_HOME` | **`ADELIE_HOME`** | 旧名仍读；两个都设时新名赢 |
| 安装目录默认值 | `~/.penguin` | **`~/.adelie`** | `PENGUIN_INSTALL_DIR` 仍认（名字没改） |
| 其余 `PENGUIN_*` | — | — | **本轮不动**，见 2.2b |

**为什么必须连启动脚本一起改**：安装器的约定是「数据根在程序目录下的 `data/`」——于是默认装到
`~/.penguin` 的旧装，它的数据根就是 `~/.penguin/data`，而这个路径**不来自任何环境变量**，是
`resolveRoot()` 自己算出来的。新代码把默认值挪到 `~/.adelie/data` 之后，旧装里那份数据就会「找不到」
（文件还在，界面里像是空了）。所以 `scripts/launchers/penguin{,.cmd}` 现在导出
`ADELIE_HOME="${ADELIE_HOME:-${PENGUIN_HOME:-$DIR/data}}"`：**装在哪，数据根就是那里的 `data/`**，
与安装器原先的约定一致，升级换代时旧数据照旧读得到。

**为什么顺手扩了环境剥离规则**：`core` 把 `PENGUIN_*` 从 Agent 跑的命令里剥掉，就是为了别让
「服务端自己在用的那个数据根」漏进子进程（`core/src/environment/tools/command/session-manager.ts`）。
名字一改，规则不跟上就等于开了一个新口子 —— 而且漏出去的那个变量恰好是数据根。现在两个前缀都剥。

### 验证（都不是推测）

- **静态**：`pnpm --filter …core|server|ui|cli|web|hmr run typecheck` 六个包全过；`pnpm lint`
  0 警告 0 错误（2007 文件）；`pnpm format:check` 干净。
- **测试**：core **1350 通过 / 5 跳过**（比上轮 +4：`resolveRoot` 三个新用例 + 环境剥离的新前缀用例）·
  server **2563 / 2 跳过**（+4：数据根优先级、`web.db` 跟着根走）· cli **505** · ui **1000** ·
  web **2887 / 2 跳过** —— **0 失败**。200 来个只设旧名 `PENGUIN_HOME` 的用例全绿，等于整套兼容别名
  被真跑了一遍。
- **安装脚本**：`sh scripts/test-installer.sh` 通过（含它对两个启动脚本的守卫）。
- **启动脚本单独实测**（假程序目录 + 一个打印 `resolveRoot()` 的桩 CLI）：无变量 → `<程序目录>/data`；
  设 `ADELIE_HOME` → 用它；只设旧名 `PENGUIN_HOME` → 沿用；不经启动脚本的裸 `node` → `~/.adelie/data`。
- **真离线装一遍**：隔离 HOME，用**本仓库的** `install.sh --archive payload.tar.gz --universal`
  → 装进 `~/.adelie`，`~/.penguin` **没有被创建**；再把仓库的启动脚本放进那个真实布局跑一遍
  → 数据根解析为 `~/.adelie/data`；把同一棵树搬到 `~/.penguin` 形状（模拟改名前的安装）→
  `~/.penguin/data`，即旧数据仍然找得到。
- **真起服务**：`ADELIE_HOME=/tmp/… PENGUIN_PROFILE=dev PORT=7408 node dist/index.js`，用 Playwright +
  本机 chromium 打开：标题 `Sign in · Adelie`、登录页正常、**唯一 4xx 是登录前的 `/api/me` 401**；
  用旧名 `PENGUIN_HOME` 起的两个实例（7401 / 7404）同样照常服务 —— 兼容读旧名这条是跑出来的，不是推的。
- 中间物已清（`/tmp` 回到 2.0G 可用），3003 / 3004 / 4000 全程没碰。

### 一个没解释清楚的现象（留个记录，下一轮留意）

第一次起服务（全新数据根，7403）时，进程 4 分钟 83–91% CPU、端口在 LISTEN 但任何请求都不回；
**同一份代码、同一个根、同一套启动形状**随后重跑（7406 / 7407 / 7408）都是秒级应答，`--prof` 采样里
也没有热的 JS 函数（54% 落在 native/GC）。当时唯一特别的是上一次 Playwright 的 `networkidle` 超时把
chromium 丢在**导航中途**（没关掉）。没能复现，所以**没有改任何代码**，只记在这里。

### 与另一条线的交汇

本轮开工时 `git status --short` 是干净的（那时 `main` 头是 `2d6abe83`，台账里「已完成的轮次」最后一行
还是第四轮）。开工后一分钟（15:01）另一条线在这个 worktree 里提交了 `188990af`「记第五轮（…）与
v0.2.2」——它只加台账里 v0.2.2 那一节与两行表格，**跟本轮改的文件没有重叠**；本轮的改动都还在工作区里、
按本行的提交上去（`git diff` 只含本轮自己的内容）。下一轮开工时照纪律先看 `git status --short`。

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
| 2026-10-05 | 2.4 + 发布 | 两份 README 重写成「Adelie 是 PenguinHarness 的 fork」的诚实版（来源声明、上游渠道与商标归属、从源码运行的安装节、上游路线图/贡献者/引用/协议改标）；写 `RELEASE-v0.2.0.md` 当发布正文；把上游那条 tag 触发的 release 流水线改成只能手动触发 | `pnpm lint` 0 警告；`pnpm format:check` 干净；五份工作流用仓库自带 `yaml` 逐份解析通过，`release.yml` 的 `on` 只剩 `workflow_dispatch`；`git ls-remote` 复核远端分支与 tag | 见本行提交 |
| 2026-10-05 | 发布 | 建出 v0.2.0 的 GitHub Release（源码版正文、无资产、标为 latest），tag 与分支头同一提交 | `POST /repos/lmliheng/Adelie/releases` → 201；`/releases/latest` = `v0.2.0`；`actions/runs` 建 Release 前后都是 26 条（没有触发工作流）；真浏览器看发布页与仓库首页：正文渲染正常、绿 `Latest` 徽章、无 4xx | Release id `403323149` |
| 2026-10-05 | 发布 | 旧 `main` 留档成 `legacy/main`，仓库**默认分支切到 `fork/penguin-base`**；仓库 About（描述 + 话题）改成「基于 PenguinHarness」的说法 | `git push origin legacy/main` = `7fb74262`；`PATCH /repos/lmliheng/Adelie` `default_branch` → 200；`GET /repos` 复核 `default_branch=fork/penguin-base`、description/topics 已换；真浏览器看仓库首页：分支选择器是 `fork/penguin-base`、About 新描述、Releases 侧栏 v0.2.0 Latest、正文就是写明 fork 的 README，无 4xx | 见本行提交 |
| 2026-10-05 | 主线 | 默认分支定名 **`main`**（新基座并进 `main`、旧 Adelie 存 `legacy/main`、删 `fork/penguin-base`）；v0.2.0 安装包本机现打后放 **3003**；删 `docker.yml` 的 `push:main`；修 desktop 夹具 | `GET /repos` 报 `default_branch: main`；三个包 `.sha256` 自检 + linux 包在隔离 HOME 里真离线装（`penguin version --json` = `0.2.0`/release）；桌面测试 308 全绿；CI run `37258858438`：`test(rest)` 一族由红转绿、Docker 未触发 | 见本行提交 |
| 2026-10-05 | 主线 | README 插件表断言放宽（用户选的 b）+ 删掉模型里的「官方推荐」+ 更新链路指向 Adelie（CLI / server / Web） | 见「主线三件事」一节 | 见本行提交 |
| 2026-10-05 | 主线收尾 | 「主线三件事」的收尾：桌面更新源去 OSS/探针、根安装脚本去 OSS/探针并指向 Adelie、插件元数据 `repository` 指向 Adelie；顺带修 web 更新弹窗的上游 Releases 链接；`scripts/test-installer.{sh,ps1}` 同步重写 | `sh scripts/test-installer.sh` 通过；`pnpm typecheck` 八包过、`pnpm lint` 0 警告、`pnpm format:check` 干净；core 1346 · server 2552 · cli 505 · web 2886 · desktop 279 全绿 | 见本行提交 |
| 2026-10-05 | 第四轮 | 工作区选择器支持**新建文件夹**（server `POST /dirs` + Finder 工具栏/右键菜单/内联命名框）；侧栏列表选项下拉不再截断文案；画廊 mock 补 `createDir` 路由；写 `RELEASE-v0.2.1.md` | `pnpm typecheck` 八包过、`pnpm lint` 0 警告、`pnpm format:check` 干净；`pnpm -r test` **8837 通过 / 14 跳过 / 0 失败**（docs 62 · core 1346 · ui 999 · server 2557 · cli 505 · web 2887 · desktop 279 · ui-gallery 131 · 四个沙箱插件 71）；浏览器实跑建目录/重名/右键菜单 | `301b80a6` `1e3c7c5c` `19ea80fa` |
| 2026-10-05 | 第四轮 | 升级 **v0.2.1**：tag + GitHub Release（无资产）+ 重打三件安装包放 3003 `/downloads/v0.2.1/`（`BUILD_COMMIT=19ea80fa`）；3003 下载区导语不再写死版本；3004 `disable` | 见「v0.2.1：工作区新建文件夹、侧栏下拉与插件手动更新」一节 | tag `v0.2.1` = `19ea80fa` |
| 2026-10-05 | 2.2a | 数据根与安装目录改成 Adelie 自己的：默认 `~/.adelie/data` 与 `~/.adelie`、变量 `ADELIE_HOME`（旧名 `PENGUIN_HOME` 仍读，弹夹在 `resolveRoot()`）、两个启动脚本导出 `ADELIE_HOME=<程序目录>/data`（保住旧装的数据所在）、子进程剥离规则扩到两个前缀；CLI 文案/注释/示例跟上 | 六个包 typecheck 全过；`pnpm lint` 0 警告；`pnpm format:check` 干净；core 1350 / server 2563 / cli 505 / ui 1000 / web 2887 全绿；`test-installer.sh` 通过；启动脚本与「隔离 HOME 离线装进 `~/.adelie`」真跑过；新旧两种数据根各起服务 + 浏览器看过（唯一 4xx 是登录前 401） | 见本行提交 |
| 2026-10-05 | 第五轮 | 初始 Project 名补成 `default`（core 常量 + `ensureDisplayName` + 启动扫描 + 三条测试）；zh 字典 68 处 `Project` → 「项目」；`PrefRow` 手机宽度改为可换行、导入 Trace 不再压住；草稿行删除按钮在触摸屏上常显 | `pnpm typecheck` 八包过、`pnpm lint` 0 警告、`pnpm format:check` 干净；`pnpm -r test` **8840 通过 / 14 跳过 / 0 失败**（docs 62 · core 1346 · ui 1000 · server 2559 · cli 505 · web 2887 · desktop 279 · ui-gallery 131 · 四个沙箱插件 71）；浏览器实测四项（含**老数据根升级**、390px 触摸屏） | `e960d0b1` |
| 2026-10-05 | 第五轮 | 升级 **v0.2.2**：tag + GitHub Release（无资产）+ 重打三件安装包放 3003 `/downloads/v0.2.2/`（`BUILD_COMMIT=2d6abe83`），打包脚本改「边做边清」把峰值从 1.5G 压到 ~0.3G | 见「v0.2.2：默认项目名 default、中文文案、手机上的导入 Trace 与草稿」一节 | tag `v0.2.2` = `2d6abe83` |
| 2026-10-05 | 2.2b | 控制面环境变量改名：25 个名字 / 77 个文件 / 388 处 `PENGUIN_*` → `ADELIE_*`（会话、API、语言、终端、审批与测试脚手架那批；注释、zh/en 文案、插件技能契约、`docker/compose.yaml` 一起改）；`core` 的剥离规则注释补写「为什么仍留两个前缀」 | 六包 typecheck 过；`pnpm lint` 0 警告；`pnpm format:check` 干净（两处超宽行交给 prettier）；core **1350 / 5 跳过**、ui **1000**、web **2887 / 2 跳过**、cli **505**、server **2563 / 2 跳过**（首跑 1 条红是 `dist/install.ps1` 副本过期，重建 server 后转绿）—— 0 失败；运行时实测：`ADELIE_LANG=zh` 出中文帮助、旧名 `PENGUIN_LANG=zh` 不再生效、`ADELIE_SEED_ADMIN_PASSWORD` 起服务不再打印 claim 链接；浏览器（7431，数据根 `/root/adelie-fork-data`）标题 `Sign in · Adelie`、console 唯一 error 是登录前 `/api/me` 401；推送后 CI run `37302398244` **22 个 job 全绿**（含本机按纪律没跑的 desktop 一族，等于替桌面壳那半边也验了一遍） | 见本行提交 |
| 2026-10-06 | 2.2c（前半） | 边界面部署变量的**读侧**同时认 Adelie 的名字与旧名：core 新增 `state/boundary-env.ts`（`ADELIE_*` ← 旧 `PENGUIN_*` 的表 + 读取函数，新名优先）；接上 server 的 `config.ts`（WEB_DIST / WEB_DB / PORT_FILE / DESKTOP_TOKEN / CLI_ENTRY）、version 路由的 CLI_ENTRY、`machines/layout.ts` 的 PROFILE、CLI 三个命令的 WEB_DB、core 的 BUNDLED_SHELL，server README 的环境表与各处注释跟上。**写侧一个没改**（桌面壳按纪律没碰），所以 2.2c 仍未勾掉，「还差什么」写在条目里 | 六个包 typecheck 过；`pnpm lint` 0 警告、`pnpm format:check` 干净；core 1359 / 5 跳过 · server 2594 / 2 跳过 · cli 505 · ui 1000 · web 2877 / 2 跳过，**0 失败**；真起服务三次（数据根 `/root/adelie-fork-data/alias-*`，端口 7451 只用新名 / 7452 只用旧名 / 7453 两名并存）：三次都 302 → 登录页 `<title>Adelie</title>`，日志里的 SQLite 与 Web dist 都对，端口文件按各自的名字落盘；并存那次落的是新名的 `new.db` / `new.port`，旧名的 `old.db` / `old.port` 与 `PENGUIN_HOME` 指的旧根**一个都没建** | `83acbdf0` |
| 2026-10-06 | 2.2c（写侧的远端命令） | `machines/commands.ts` 的 `remotePenguin()` 改成**两个名字都写**：远端命令现在同时给出 `ADELIE_HOME` / `PENGUIN_HOME` 与 `ADELIE_PROFILE` / `PENGUIN_PROFILE`（Adelie 的名字在前、两个取值相同），注释里写明为什么不是「探测远端版本」（这条命令落地的 CLI 来自那台机器的 hmr store，可能是更早的发行推上去的、只认旧名；探测要花一次握手且探不准）。顺带把 `machines/layout.ts` 的数据根注释与 `machines.test.ts` 的注解跟上 | 六包 typecheck 过；`pnpm lint` 0 警告、`pnpm format:check` 干净；core **1359** / 5 跳过 · server **2601** / 2 跳过（+1 新用例，钉住两个名字与先后）· cli **505** · ui **1003** · web **2877** / 2 跳过，**0 失败**；把 `remotePenguin()` **真生成的那条命令**（不是复述）拿 `sh` 跑了一遍：假 HOME 下桩「node」换成 core 的 `resolveRoot()` / `boundaryEnv()`，四个变量都在且取值一致，解析出的根与 profile 都是这一侧的 dev（`reader-root=$HOME/.penguin-dev/data`、`reader-profile=dev`） | `16368121` |

> **2026-10-06 与另一条线的交汇（第六轮）**：本轮开工时 `git status --short` 是干净的；做完检查那一
> 步时工作区里多出**另一条线**的改动 —— 47 个 `package.json` 的 `version` 0.3.0 → 0.3.1、
> `packages/core/src/index.ts` 的 `VERSION`、以及未入库的 `RELEASE-v0.3.1.md`（都是 v0.3.1 的发布
> 准备）。本轮**一个都没碰**，`git add` 只列了自己的 22 个文件；那批改动仍在工作区里等它那条线自己
> 提交。

## 服务迁移：PenguinHarness → Adelie（2026-10-05，用户定的方案 A）

用户要求「把 penguin harness 的 service 迁到 Adelie」，在端口两案里选了 **A：Adelie 接管 7364** ——
已放行的设备与 `penguin` 命令都不用改配置。这是**环境动作**，仓库代码一行没动。

| | 迁移前 | 迁移后 |
| --- | --- | --- |
| 单元 | `penguin-server.service`（`/root/.penguin` 的 `penguin server`） | `adelie-server.service`（`/root/.adelie` 的 `penguin server`） |
| 端口 | 7364（`HOST=0.0.0.0`） | 7364（不变，ufw 一条都没改） |
| 程序 | `/root/.penguin` = PenguinHarness `v0.2.13-99-g18d7c137` | `/root/.adelie` = **Adelie v0.2.3**（`adelie-linux-x64` Release，离线装） |
| 数据根 | `/root/.penguin/data`（5.6G） | `/root/.adelie/data`（`mv` 过去，同一分区） |
| `penguin` 命令 | `/root/.local/bin/penguin` → `/root/.penguin/bin/penguin` | → `/root/.adelie/bin/penguin`（`install.sh` 自己改的） |

按顺序做的事：

1. **备份留证**到 `/root/migration-20261005/`：`sqlite3 … ".backup"` 的 `web.db` 一致性快照、
   四个单元文件、`/root/egress-whitelist/config.json`、数据根清单、`ufw status numbered`、
   bundle 的 sha256 自检（`9ba6e674…`，MATCH）。
2. **离线装 Adelie v0.2.3**：`tar -xzf /opt/adelie-design/downloads/v0.2.3/adelie-linux-x64.tar.gz` →
   `PENGUIN_INSTALL_DIR=/root/.adelie sh install.sh`（payload 校验和 OK，输出
   `Adelie v0.2.3 installed to /root/.adelie`）。
3. `systemctl stop penguin-server`（停之前核过：7364 上没有客户端连接）→
   `mv /root/.penguin/data /root/.adelie/data` → 旧路径留符号链接
   `ln -s /root/.adelie/data /root/.penguin/data`。**必须留这个链接**：`qq-webui-proxy.service` 的
   `ExecStart`/`Documentation` 与 napcat 容器的三个 bind mount（`…/qq-napcat/data/{config,qq,plugins}`）
   都写死了旧路径，链接一撤就断。
4. 新增 `/etc/systemd/system/adelie-server.service`（`Environment=ADELIE_HOME=/root/.adelie/data`、
   `ExecStart=/root/.local/bin/penguin server`、`SyslogIdentifier=adelie-server`）→ `daemon-reload` →
   `enable --now`；旧单元 `systemctl disable penguin-server` —— **单元文件与 `/root/.penguin` 安装都留着**。
5. `/root/egress-whitelist/config.json`：7364 那条的名字 `PenguinHarness` → `Adelie`、单元 →
   `adelie-server.service`，`penguin.tokenFile` → `/root/.adelie/data/api-token`；3004 那条改名
   「Adelie（3004 预览）」免得两条同名。重启面板后 `ufw status numbered` 与重启前逐字相同。

验证（都是真跑出来的）：

- `ss -tlnp`：`0.0.0.0:7364` 归 adelie-server 的 node；`is-active` / `is-enabled` = active / enabled。
- 起服务的 journal：`Data root: /root/.adelie/data` · `SQLite: /root/.adelie/data/web.db` ·
  `Web dist: /root/.adelie/web` · `Agent CLI: /root/.adelie/data/bin/penguin -> /root/.adelie/lib/dist/penguin.js`
  （服务端把自己那份 CLI 写进了数据根的 `bin/penguin`，不再是旧装那份）；无 error。
- HTTP：`127.0.0.1:7364/` 200、`<title>Adelie</title>`、`/api/me` 401（未登录，预期）；
  **从笔记本（ufw 已放行的那个出口）访问 7364 的外网地址也是 200 + `Adelie` 标题**。
- 数据：`PRAGMA integrity_check` = ok；`users 2 / projects 7 / agents 13 / sessions 2334`；
  `penguin project ls` 列出 admin 名下 6 个项目（第 7 个 `zhaoyukun-default_project` 归别人、对 admin 不可见，
  目录仍在）；`GET /api/projects/self_evolution/agents` 拿到 default_agent（17 技能 / 1 hook / 2 vault 键）；
  `GET /api/sessions/<sid>/messages` 读得出 20:32 那条会话的历史。`penguin version` = `v0.2.3`。
- 迁移前挂在旧服务 cgroup 里的那个 4000 预览进程（上一会话手工起的 Adelie，数据根 `/root/adelie-preview`）
  **随 `systemctl stop penguin-server` 一起收到 SIGTERM 退出**（它自己的日志 21:45:55
  `Received SIGTERM, shutting down…`）。它的数据副本原样留在 `/root/adelie-preview`，要再起来照原命令即可。

回滚：

```bash
systemctl disable --now adelie-server
rm /root/.penguin/data && mv /root/.adelie/data /root/.penguin/data
systemctl enable --now penguin-server
```

遗留：`qq-webui-proxy.service` 与 napcat 容器仍按旧路径工作（靠符号链接）。要彻底改成
`/root/.adelie/data`，得同时改那个单元并重建容器（会重连 QQ，这次没做）。

## 插件从 npm 导入（2026-10-05，用户点单）

### 问了什么

「插件那里能不能支持 npm，把我的 penguin harness 插件仓库转移到 npm，然后 npm 导入插件，可以吗。」

### 先答事实（都核过）

- 插件本来就是 npm 包：每个 `plugins/<name>/` 带 `package.json`（`@penguinharness/<name>`，
  `files: [plugin.json, icon.svg, skills, hooks, LICENSE]`），仓库的发布流水线每发一版就把它们推上 npm
  （`.github/workflows/release.yml` 里 `for dir in plugins/*/` + `pnpm publish --access public`）。
  registry 上 `@penguinharness/{use-firecrawl,goal,data-analysis,agent-company}` 等已有 0.2.9–0.2.13。
- **导入侧先前只认 zip**：`POST /api/plugins/download` 走 `normalizePluginUrl` + fflate 的 `unzipSync`，
  填一个 npm 名字只会被当成普通链接去抓。所以「能不能」= 能，但要写代码。

### 这一轮做的

- 新 `packages/server/src/services/tar-archive.ts`：同步、只在内存里的 tar 读取器 —— ustar `prefix`、
  pax `x` 扩展头、GNU `L` 长名、base-256 size、成员校验和；目录/链接/设备成员跳过且不跟随路径。
  `gunzipBounded` 用 `zlib.gunzipSync` 的 `maxOutputLength` 兜住解压炸弹（64MB），`untarBounded` 复用
  `skill-import-limits` 那套 caps（200 文件 / 单文件 5MB / 合计 20MB），成员路径逐个查绝对路径、反斜杠与 `..`。
- `packages/server/src/services/plugin-download.ts`：`parseNpmPluginSpec`（`npm:@scope/name[@版本]`、
  npmjs.com 包页、registry packument 地址、裸包名）＋ `resolvePluginSource`（npm → 抓 packument，
  取版本与 `dist.tarball`，把 `dist.integrity` 一并带上）＋ `fetchPluginArchive` 校验 SRI。
  非 npm 输入照旧走 `normalizePluginUrl`；`.tgz` 直链也会由来名推名字。
- `packages/server/src/http/routes/plugins.ts`：`parsePluginArchive` 按 magic bytes 分流 zip / gzip-tar，
  根定位、命名、caps、路径校验全部共用一份；npm 包按去掉 scope 的包名安装
  （`@scope/use-firecrawl` → `use-firecrawl`），tarball 那层 `package/` 不当名字（没给 name 就 400）。
  新错误码 `npm_package_not_found` / `npm_version_not_found` / `npm_registry_failed` / `integrity_failed`。
- 网页端：下载框的 label/hint/placeholder/描述、导入规则第 1–4 条、`importErrors` 两个语言都补 npm 形态；
  `pluginNameFromUrl` 认 npm 说明符与 npmjs.com 包页（覆盖确认里那行名字）。

### 验证

- `pnpm --filter @prismshadow/penguin-server test`：180 文件 / 2592 通过 / 2 跳过；
  `packages/web`：236 文件 / 2891 通过 / 2 跳过；`pnpm typecheck` 全包 Done；`pnpm lint` 0；
  `pnpm format:check` 干净。
- 新测 `packages/server/test/plugin-npm-import.test.ts`（18 例）：手写 ustar/pax tarball 的解析、
  路径穿越与截断、解压炸弹、caps、说明符解析、路由端到端（stub 注册表 + tarball）。
  `packages/web/test/plugin-import.test.ts` 加了两例 npm 命名。
- 真网络：registry 上真的 `@penguinharness/use-firecrawl@0.2.13` tarball 过了 `parsePluginArchive`
  （4 个文件 + `package.json`，都在 `package/` 下）；`resolvePluginSource("npm:@penguinharness/goal")`
  与 npmjs.com 包页都解析到 `…/goal-0.2.13.tgz` 并带回 `sha512-…`；不存在的包回 `404 npm_package_not_found`。

### 没做（卡在这两点，等拍板）

- **没有发 npm**（后来用户点了名，见下一节）：台账纪律里「不发 npm」还在；且 `@penguinharness` 的
  maintainer 是 `hiyouga`（registry maintainers 字段），`lmliheng` 的 token 发不上去。
  **更正**：我先前写「`@lmliheng` 名下 0 个包」是错的 —— 我拿 npm 官网才认的 `scope:` 限定词去查
  registry search API，它对不认识的限定词返回 0。按 `maintainer:lmliheng` 查，该账号共 17 个包
  （12 个 `@lmliheng/*` + 5 个无 scope 的 `adelie-core`/`adelie-server`/`adelie-runtime`/
  `adelie-providers`/`adelie-tools`）。
- 运行时生效要重装/重建服务端（现在跑的是 `/root/.adelie` 那份 0.2.3）。

## 插件包 scope 换成 `@lmliheng`（2026-10-05，用户点单）

### 用户说的

「改成我的npm仓库，lliheng，为什么有0个包呢，我npm账号里还有至少5个包」

### 先更正我上一节写错的那句

- 用户写的 `lliheng` 在 npm 上查不到（`maintainer:lliheng` 命中 0）。账号是 **`lmliheng`**：
  vault 里 `NPM_TOKEN` 的 `npm whoami` = `lmliheng`，`maintainer:lmliheng` 命中 **17 个包** ——
  `@lmliheng/{rag-chunk,acode,acode-core,acode-tools,acode-runtime,acode-providers,acode-publish-probe,
  agent,acode-write-probe,filesystem-mcp,ai_git,adelie}` 共 12 个带 scope，外加 `adelie-core`、
  `adelie-server`、`adelie-runtime`、`adelie-providers`、`adelie-tools` 5 个无 scope 的。
- 我说「0 个」的原因：我用的是 npm **官网**才认的 `scope:lmliheng` 限定词打 registry 的 search API，
  它不报错、直接返回 0 条。以后查账号名下用 `maintainer:<user>`。

### 做了什么

- **14 个对外发布的插件包改名**：`plugins/<name>/package.json` 的 `name` 从 `@penguinharness/<name>`
  改成 `@lmliheng/<name>`（agent-company、agent-development、agent-tuning、browser-automation、
  continual-learning、data-analysis、goal、humanizer、model-development、skill-porting、
  software-development、use-bento-slides、use-claude-code、use-firecrawl）。
- **loader 的前缀**：`packages/core/src/plugins/index.ts` 的 `PLUGIN_PKG_PREFIX` → `"@lmliheng/"`；
  三个宿主包的依赖表跟着改（`packages/core`、`packages/cli`、`packages/desktop` 各 14 条
  `workspace:*`）。
- 连带改的引用：core 的 `state/{paths,plugin-store}.ts` 注释与 `test/plugins.test.ts` 夹具、
  desktop 的 `preflight.mjs`/`verify-packed-cli.mjs`（按前缀筛依赖那两处）、desktop 的
  `build-assets.mjs`/`tsup.config.ts`/`electron-builder.yml`、cli 的 `tsup.config.ts`、
  server 的 `api/types.ts` 与 `services/plugin-download.ts` 注释、`plugins/README.md`、
  `packages/docs/content/{skills,quickstart-cli}.{en,zh}.md`、`.github/CONTRIBUTING{,.zh}.md`、
  `.github/workflows/release.yml` 注释、`Dockerfile` 注释、`scripts/check-publishable.mjs` 注释、
  ui-gallery 的 mock 数据、`packages/ui/test/entity-header.test.ts`、以及上一轮那个
  `packages/server/test/plugin-npm-import.test.ts` 的示例包名。共 46 个文件（`pnpm-lock.yaml` 由
  `pnpm install` 重写）。
- **没改**：`changelog/**` 与 `RELEASE-v0.2.0.md`（历史记录，照旧写上游名号）；4 个沙箱后端
  `@prismshadow/penguin-plugin-sandbox-*`（private，从不发布，改名会牵到 vendor 脚本，这次不动）；
  Docker Hub 镜像名 `hiyouga/penguinharness`（另一个话题）。

### 验证

- `pnpm install` 重建链接与 lockfile：`packages/{core,cli,desktop}/node_modules/@lmliheng/` 下 14 个包齐全。
- **踩到一个真坑并修掉**：core 的 `dist/` 是旧构建，里面 `PLUGIN_PKG_PREFIX` 还是旧 scope，于是
  按新依赖表筛不出任何插件 —— 服务端 7 个文件 19 例失败（`/api/plugins` 返回空库、default_agent 没有预装技能）。
  `pnpm --filter @prismshadow/penguin-core build` 之后全绿。**这条是给以后改名的人看的：core 改了源码
  必须重建，否则跑测试的 server 会读到旧 dist。**
- `packages/core` 63 文件 / 1350 通过；`packages/server` 180 文件 / 2592 通过 / 2 跳过；
  `packages/web` 236 文件 / 2891 通过 / 2 跳过；`packages/cli` 34 文件 / 505 通过；
  `pnpm typecheck` 全包 Done；`pnpm lint` 0；`pnpm format:check` 干净。
- 发布预演：`pnpm --filter @lmliheng/goal publish --dry-run --no-git-checks --access public` →
  `@lmliheng/goal@0.2.13 → registry.npmjs.org`（dry run，没上传）。
- `node scripts/check-publishable.mjs --registry --strict` → 这 14 个名字**在 npm 上还不存在**，
  而发布流水线用的是逐包配置的 trusted publishing，OIDC 换不来一个不存在的名字 →
  正式发版前得先手工首发布一次（这就是它打印的那句 "first publish needed"）。

### 没做 / 待拍板

- **没有真的 publish**（上一轮说的就是「改名 + dry-run，发不发你说」）：`npm publish --access public`
  逐个发这 14 个包，一条命令的事，等一句准话。
- `@prismshadow/penguin-{core,server,cli}` 仍在**上游 scope** 里、同样发不上去；要让整条链都进
  `@lmliheng`，是另一次改名（宿主包名、安装脚本、桌面打包坐标、文档都会动），这轮没碰。

## 宿主包也换成 `@lmliheng`（2026-10-05，用户点单）

### 用户说的

「宿主包一起换成我的 scope」

### 做了什么

- 全仓 `@prismshadow/penguin*` → `@lmliheng/penguin*`：9 个工作区包改名 —— core、server、cli 是
  对外发布的三个，ui/web/desktop/docs/hmr/ui-gallery 是 private；`examples/*` 的示例包名一并改。
- 826 个文件（含 `pnpm-lock.yaml`，由 `pnpm install` 重写）：源码 import、样式表
  `@import "@lmliheng/penguin-ui/theme.css"`、CI 的 `--filter` 选择器、release.yml 的 deploy 与
  publish 步骤、Dockerfile、安装脚本、docs、`.agents/` 下的技能说明。
- 三处 sed 抓不到的写法手工改：`packages/cli/src/commands/update.ts` 里把 npm 全局路径拆成两段判断的
  `"@prismshadow" && "penguin-cli"`（漏改会让自更新认不出 npm 全局安装）；几个测试正则里的
  `@prismshadow\/penguin-ui`（斜杠被转义）；desktop `electron-builder.yml` 注释里的示例 scope。
- **没改**：`@prismshadow/agenthub`（第三方依赖，hiyouga 发布，82 处）及 `pnpm-workspace.yaml` 里对它的
  `minimumReleaseAgeExclude` 条目；`FORK.md`/`README.zh.md` 里作为「要被替换的旧名」出现的
  `@prismshadow/*` 文字；changelog 与 `RELEASE-v0.2.0.md`（历史记录）。
- 顺带补了上一轮留下的红：`packages/ui-gallery` 的 mock 路由缺
  `DELETE /api/projects/:projectId/dirs`（上一轮做「删除空目录」时没给画廊补，
  `test/mock-api.test.ts` 因此一直红着）。

### 验证

- `pnpm install`：9 个工作区包全部新名；lockfile 里 `@lmliheng/penguin*` 35 处、旧名 0 处。
- `pnpm -r build` 全绿（desktop 的 build-assets 按新名打了 4 个沙箱插件包）。
- `pnpm -r test` 全绿：docs 62、ui 1000、core 1350、sandbox-seatbelt 17、sandbox-wsl 25、
  sandbox-dsh 5、sandbox-bwrap 24、server 2592、cli 505、web 2891、desktop 279、ui-gallery 131。
- `pnpm typecheck` 全包 Done；`pnpm lint` 0；`pnpm format:check` 干净（名字变短后有几处 import 需要
  重新折行，已 `prettier --write`）。
- 按 release.yml 手工走了一遍发布链路：`pnpm --config.node-linker=hoisted --filter @lmliheng/penguin-cli
  --prod deploy out/penguin/lib`（356 个包，`node_modules/@lmliheng/` 下 14 个插件 + core/server 齐全）→
  `node scripts/build-plugins.mjs --out out/penguin/lib/plugins` →
  `out/penguin/lib/plugins/node_modules/@lmliheng/penguin-plugin-sandbox-bwrap/package.json` 在。
  跑完把 `out/` 删了（暂存物，不入库）。

### 后果 / 待办

- 整条链（core/server/cli + 14 个插件）现在都在 `@lmliheng` 下，**都还没发过 npm**：安装、自更新
  （`penguin update` 打的是 `@lmliheng/penguin-cli@<version>`）和发版之前，得先手工首发布一次；
  `node scripts/check-publishable.mjs --registry --strict` 会列出要补的名字。
- 桌面壳的 Windows AppUserModelID 是 `com.lmliheng.adelie`（早先品牌轮次已改），与包 scope 无关，没动。

## 首次发布到 npm：`@lmliheng/*` 整条链 0.2.13（2026-10-05，用户点单）

### 用户说的

「发」

### 为什么这次必须手工发

`release.yml` 的 `publish-npm` 走 OIDC trusted publishing，而 trusted publisher 是**逐包**配置的：
registry 上还不存在的名字没有配置可查，OIDC 换不到 token，流程到它那儿就 404。所以新名字得先由人拿
能建包的凭据发一次（这一条也写在 release.yml 的注释里）。这次就是把 17 个名字（3 个宿主包 + 14 个
对外插件）一次性首发布。

### 做了什么

在 `/root/adelie-fork` 按 `release.yml` 的步骤手工走一遍（凭据取自 vault 的 `NPM_TOKEN`，
`npm whoami` = `lmliheng`）：

1. `pnpm -r build` 重建全部产物。
2. 备料（CI 里由 release.yml 现做，手工跑就得自己来）：`cp LICENSE` 进 `packages/{core,server,cli}/`
   与每个 `plugins/*/`；`packages/web/dist` → `packages/server/web-dist`。
3. 14 个对外插件逐个 `pnpm --filter <name> publish --access public --no-git-checks`
   —— `plugins/sandbox-*` 那 4 个是 private，跳过。
4. 再按依赖顺序发 `@lmliheng/penguin-core` → `@lmliheng/penguin-server` → `@lmliheng/penguin-cli`。

17 个包都落在 **`0.2.13`**（仓库当前的 dev 版本）。

### 踩到的坑：npm 的 staged 发布是延迟，不是失败

- 三个包（`agent-company`、`data-analysis`、`skill-porting`）发完当场 `npm view` 全是 404：
  `data-analysis`/`skill-porting` 的 packument 里当时只有一个 `0.0.0-stage` 占位版本，
  `agent-company` 连 packument 都是 404（只有 `/name/0.2.13` 这个版本端点是 200）。
  这是 npm 的 **staged 发布**：版本先入库，包文档延迟几分钟才放出来。
- 这期间重发会拿到 `403 Cannot publish over the previously published versions`，或
  `409 Cannot publish over previously staged version`（后者就是 npm/cli#9889，**至今 open**）。
  `npm stage list` 与 `/-/stage` 都是空的，没有 stage-id 可以 reject；granular token 也
  **不能 unpublish**（403），那个占位版本删不掉。
- **判断：等几分钟就好，不要升版本号** —— 升了等于白扔一个号。`data-analysis`、`skill-porting`
  的包文档先出来，`agent-company` 到 16:01:15 才出现，之后 17 个名字全部可解析。
- 顺带记一笔中途差点误判的事：已发布的 `penguin-cli@0.2.13` / `penguin-core@0.2.13` 精确依赖
  `@lmliheng/data-analysis@0.2.13`，在它包文档出来之前 `npm install` 会 E404。那是上面这个延迟的
  表现，不是真的断链。

### 验证（都是真跑出来的）

- 17 个名字的版本端点与 packument 现在全 200。
- `node scripts/check-publishable.mjs --registry --strict` 通过：`registry: all 17 published names
  already exist`（此前它会列出全部 17 个「从未发布」）。
- 空目录真装：`npm install @lmliheng/penguin-cli@0.2.13` → 400 个包，`node_modules/.bin/penguin
  --version` = `v0.2.3-8-g5cf857f6`。
- 14 个插件包一起干跑解析：`added 14 packages`。

### 收尾 / 待办

- 发布时暂存的 21 份 `LICENSE` 副本（`packages/{core,server,cli}/` + `plugins/*/`）已删，工作树除了
  下面那个未跟踪文件之外是干净的。
- **没 push**（用户说不用），远端还是旧状态。
- registry 上留着 `data-analysis`/`skill-porting` 的 `0.0.0-stage` 占位版本，删不掉，无害。
- 下次真发版：tag 一个高于 0.2.13 的版本即可 —— CI 会把 root + 所有工作区包 + 插件一起 stamp 成 tag
  版本，这 17 个名字已经存在，OIDC 就能直接发。
- `RELEASE-v0.2.3.md`（仓库根，**未跟踪**）是 v0.2.3 桌面发布那轮的正文，v0.2.0/1/2 三份都已入库、
  只有它漏了。这一轮没动它，要不要补一个提交由用户定。

## 文档口径修正：开发区那台机不写进发布正文与文档（2026-10-05，用户点单）

### 用户说的

「release和文档里不能写开发区那台机的地址（`http://<开发区主机>/…`）相关的内容……这个服务器是
我们的开发区，不是给别人下载用的」

### 做了什么

- 三份发布正文里的下载站地址删掉：`RELEASE-v0.2.1.md`、`RELEASE-v0.2.2.md`（这两版 Release
  本来就没有附件，改成「安装包由本机脚本按上游 `release.yml` 的步骤现打，不上传、不对外分发」）、
  `RELEASE-v0.2.3.md`（改成只指向 GitHub Release —— v0.2.3 的 Release 是有附件的）。
- 已发布的 GitHub Release 正文（v0.2.1 / v0.2.2 / v0.2.3）用 API 改成同样的口径 —— 正文是公开的，
  留着地址等于把开发区当下载站对外发。
- 本台账里那几处地址一并去掉：下载地址那段改成「包落在本机开发区那台静态站上，地址不写进任何文档」；
  两处「内外网都 200」只留结论；7364 那句去掉 IP（顺手也去掉了笔记本的出口 IP —— 这份台账在公开
  仓库里）。
- **口径**：3003 那台静态站只当开发区内部交付用（用户原话「不用给别人用」），任何对外文本
  （Release 正文、README、发布正文、文档）都不写它的地址；安装包对外只走 GitHub Release。

## 两个外部插件入库并发布到 npm（2026-10-05，用户点单）

### 用户说的

「你怎么没把我的插件仓库的两插件传到 npm」—— `lmliheng/penguin-plugins` 里的 `csu-mail` 与
`wechat-miniprogram`。上一轮首发布时它们**根本不在这棵树里**（在另一个仓库），所以没发。

### 做了什么

- 两个插件从 `lmliheng/penguin-plugins` 搬进 `plugins/`，按 fork 的插件规矩对齐：`package.json`
  改名 `@lmliheng/<name>`、版本跟当前 dev 版本 `0.2.13`、补 `repository.directory` 与 `LICENSE`；
  删掉误入库的 `__pycache__`。
- `SKILL.md` 的 frontmatter 按本仓库约定瘦身（文件里只留 `name` + `description`；`version` 与
  `short_description(_zh)` 归 `plugin.json`，安装时盖章），并补上每个内置技能都有的
  `## Before you start`。
- `wechat-miniprogram` 补 `category: software-development` —— 原来没有分类会掉进 Other 组，而
  `plugins.test.ts` 断言库里四个分类都有人、不留 Other。
- 接进依赖链：`packages/{core,cli,desktop}/package.json` 各加两条 `workspace:*`。内置插件是靠宿主
  包的 `dependencies` 经 Node 解析出来的（`builtinRoots()`），不写这两条，插件就在库里看不见。
- 同步三处「必须提到每个插件」的守卫：`plugins/README.md` 与 `README.zh.md` 的分类表、
  `packages/docs/content/skills.{zh,en}.md` 的插件表、`packages/core/test/plugins.test.ts` 的 14 → 16。
- 发布：`pnpm --filter <name> publish --access public --no-git-checks`，`@lmliheng/csu-mail@0.2.13`
  与 `@lmliheng/wechat-miniprogram@0.2.13` 都 `✅ Published`。
- 搬进来的 25 个脚本/模板按本仓库 prettier 重新格式化（它们来自另一个仓库，没过这边的门禁）。

### 验证

- `pnpm -r test` 全绿：docs 62 · ui 1000 · core 1350(+5 跳过) · server 2592(+2 跳过) · cli 505 ·
  web 2891(+2 跳过) · desktop 279 · ui-gallery 131 · 四个沙箱插件 71。
- `pnpm typecheck` 八包过；`pnpm lint` 0 警告；`pnpm format:check` 干净。
- registry：两个新名字的版本端点都 200。

### 没做 / 待办

- **没删 `lmliheng/penguin-plugins`**（用户要求"传上去之后删"）：放在最后一步，等 npm 与这个仓库
  这两份备份都推上去、插件市场不再依赖那个仓库的 URL 之后再删（令牌有 `delete_repo` 权限）。
- 插件市场、「按需发版 + 邮件汇报」的定时循环都还没做；设计与计划写在 `/root/evolution/PLAN.md`。

## csu-mail 认两套密钥库键名（2026-10-05，用户点单）

### 用户说的

「我已经写入vault了，但键可能不一样」—— 实际写的是 `CSU_CAS_USER`、`CSU_CAS_PASSWORD`、
`CSU_CAS_ADDRESS`；插件文档一路写的是 `CSU_CAS_USER`、`CSU_CAS_PASS`、`CSU_MAIL_ADDR`。
（`CSU_MAIL_AUTHCODE` 还没有 —— 专用密码本来就要靠首次引导生成。）

### 做了什么

- 插件里三个脚本都改成**两套名字都认**：`bootstrap.sh` 把 `CSU_CAS_ADDRESS` / `CSU_CAS_PASSWORD`
  折成 `CSU_MAIL_ADDR` / `CSU_CAS_PASS`；`cas_login.py` 的 `--password` 与 `mail.py` 的 `addr()`
  各自加一个回退。重命名要把明文重抄一遍，不值得。
- 写入密钥库的仍是插件自己的名字（`CSU_MAIL_ADDR` + `CSU_MAIL_AUTHCODE`），所以引导之后日常收发信
  只需要这两个。
- `plugins/csu-mail/plugin.json` 版本 `2026.10.02.3` → `2026.10.05.1`（改了安装时落地的内容，
  按仓库规矩必须升版本）。

### 验证

- `CSU_CAS_ADDRESS=... bash bootstrap.sh` → 停在「缺账号」而不是「缺地址」（说明地址被认了）；
  再给账号 → 停在「缺密码」且提示里带 `CSU_CAS_PASSWORD`。
- `CSU_CAS_ADDRESS=... python3 mail.py check` → 报的是缺 `CSU_MAIL_AUTHCODE`，不是缺地址。
- 门禁：core 插件测试 21 过；`prettier --check` 干净；`oxlint` 0 警告。

## 发布 v0.3.0：GitHub Release + npm 整条链 + 现网原地更新（2026-10-06，用户点单）

### 用户说的

「你看着更一个小版本吧」+「原地更新目前这个服务」。

### 为什么是 0.3.0 而不是 0.2.4

npm 上的 `@lmliheng/*` 首次发布落在 **0.2.13**（见上一节），所以 0.2.4 在 npm 线是**降级**。
0.3.0 在三条线上都是前进：tag 线（v0.2.3 → v0.3.0）、npm 线（0.2.13 → 0.3.0）、桌面端更新线
（已装 0.2.3 → 0.3.0）。

### 做了什么

1. **提交 `26e4079b`**（`chore(release): v0.3.0 —— 版本戳与发布正文`）：root + 9 个工作区包 +
   16 个对外插件包的 `package.json` → 0.3.0，`packages/core/src/index.ts` 的 `VERSION = "0.3.0"`
   （`BUILD_DATE` / `BUILD_COMMIT` 源码里仍是 `null`，由发布步骤盖章），新增 `RELEASE-v0.3.0.md`。
   注解 tag `v0.3.0` 已 push，`main` = `origin/main` = `26e4079b`。
2. **四个私有 sandbox 插件（bwrap / dsh / seatbelt / wsl）不动**：上游从 0.2.2 起就把它们与发布
   列车分开 —— `packages/server/src/plugin/builtin-index.json` 里列的是 0.2.2，而
   `plugin-registry.test.ts:194` 会比对两处，升了它们这条测试就红。
3. **桌面端产物**：dispatch `desktop-build.yml`（run 37353829720，ref = v0.3.0）三平台全绿，取
   Windows / Linux 两个 artifact 上传；macOS 不发（未签名）。两份 `latest*.yml` 的 version 是
   0.3.0，sha512/size 与安装包逐条核对一致。
4. **CLI 三件包在本机装配**（照 `release.yml` 的 build 作业复现，脚本
   `pack-cli-0.3.0.sh`）：`pnpm -r build` → `pnpm --config.node-linker=hoisted --filter
   @lmliheng/penguin-cli --prod deploy` → web 资产 → launcher → `build-plugins.mjs` → 载荷 →
   按 `package-release-bundles.sh` 的布局打 `penguin-{linux-x64,win32-x64,universal}`。
5. **GitHub Release v0.3.0**（<https://github.com/lmliheng/Adelie/releases/tag/v0.3.0>）：14 个资产
   = 桌面 6 件（exe + blockmap + AppImage + deb + `latest.yml` + `latest-linux.yml`）+ CLI
   三件包与各自 `.sha256` + `install.sh` / `install.ps1`，`make_latest`。
6. **npm 整条链 0.3.0**：照 `release.yml` 的 `publish-npm` 作业手工走（脚本 `publish-npm-0.3.0.sh`
   → 日志 `publish-npm-0.3.0.log`），凭据 vault 的 `NPM_TOKEN`：盖章 → `pnpm -r build` →
   三个包测试 → LICENSE 与 `web-dist` 备料 → 16 个插件 → core → server → cli，共 **19 个包**。
7. **现网原地更新**：`/root/.adelie`（7364）从 0.2.3 升到 0.3.0，`systemctl restart
   adelie-server`。

### 修掉的两处「原地更新根本走不通」

v0.2.3 的 Release 有两处对不上，`penguin update` 因此必然失败：

- Release **没有附 `install.sh` / `install.ps1`**（三个 URL 实测 404），而 `penguin update` 第一步
  就是取它（`packages/cli/src/commands/update.ts` 的 `installerCandidates()`）；
- Release 上 CLI 包名是 `adelie-<target>`，而 `install.sh` / `install.ps1` /
  `scripts/package-release-bundles.sh` 一律按 `penguin-<target>` 取（实测 adelie-* 200、
  penguin-* 404）。

这一版按**仓库自己的口径**发（`penguin-*` + 附两个安装脚本），一行代码没改；把产物名统一成
`adelie-*` 归 4.2 的流水线重写，届时安装脚本与打包脚本要一起改。

### 验证（都是真跑出来的）

- **Release**：`/releases/latest` 返回 v0.3.0、14 个资产全 `uploaded`；`install.sh`、
  `penguin-linux-x64.tar.gz`、`latest.yml` 三个下载 URL 跟随重定向实测 200。
- **原地更新**：`penguin update --check` 认出 0.3.0 → `penguin update --yes` 真下载 Release 的
  `install.sh` + `penguin-linux-x64.tar.gz`，`Bundle checksum OK` / `Payload checksum OK` →
  `Adelie v0.3.0 installed to /root/.adelie`。重启后服务 `active (running)`、7364 在听、
  `penguin version` = `0.3.0 / v0.3.0 / release / buildDate 2026-10-06 / commit 26e4079b`；
  `GET /` 200 且 `<title>Adelie</title>`。**只换了 `bin/ lib/ web/`**（时间戳是升级那一刻），
  `data/`、`sessions/`、`.env`、`adelie.db` 全是旧时间戳没动，`/root/.penguin/data` 软链完好。
- **CLI 包隔离装**：新 HOME 里离线装 `penguin-linux-x64.tar.gz` → `penguin version --json` 带
  buildDate/commit，`bin/penguin web` 起在 7397，`GET /` → 302 → 200 / `<title>Adelie</title>`。
- **npm**：19 个名字的 `0.3.0` 与 `dist-tags.latest` 全部可见（staged 发布是分钟级延迟，16 个插件
  是分两批出现的：8 → 14 → 16，**等就行，不要升版本号**）；空 prefix 真装
  `npm install -g @lmliheng/penguin-cli@0.3.0` → 16 个插件 + core + server 全部解析，
  `penguin version --json` = 0.3.0 带 commit，`@lmliheng/penguin-server/web-dist` 18M 在包里
  （`index.html` 是 `<title>Adelie</title>` + `adelie-icon.svg`，新页面文案也在），
  用它起服务在 7398 → `GET /` 200 / `<title>Adelie</title>`（验证进程已杀，端口已释放）。
- **门禁**：typecheck 8 包 Done、lint 0、prettier 干净、测试 **8871 通过 / 9 跳过 / 0 失败**；
  发布前又单独复跑三个包：core 1350、server 2592、cli 505，与全量一致。

### 收尾 / 待办

- 发布时暂存的 LICENSE 副本与 `packages/server/web-dist` 已删，`packages/core/src/index.ts` 已
  `git checkout` 还原，工作树干净（`git status` 空）。注意 `plugins/csu-mail/` 与
  `plugins/wechat-miniprogram/` **本来就带一个已入库的 LICENSE**，删副本时要用 `git checkout` 还原。
- npm 上 `data-analysis` / `skill-porting` 仍留着首发布的 `0.0.0-stage` 占位版本，删不掉（granular
  token 没有 unpublish 权限），无害。
- Release 上同时存在 `adelie-*`（v0.2.3 那套命名）与 `penguin-*`（这一版）两种资产名，属于口径
  过渡期，4.2 统一。
- macOS 桌面端仍未签名，`latest-mac.yml` 没发，所以 macOS 拿不到更新。

## 用户看完 0.3.0 提的六条（2026-10-06，用户点单）

### 用户说的

1. 定时任务能跨项目展示吗
2. 新建工作区，你做了目录删除吗
3. 插件导入界面的字太多了，能不能另起一个 dialog
4. 模型库这块的每次都要展示的连接 tokendance 给去了
5. 新建会话的快捷指令打开了合不上
6. 系统默认改成中文和人民币计费

两条是问句（1、2），四条是改动（3–6）；改动落在提交 `eaa818fa`。

### 1. 定时任务能不能跨项目展示 —— 现状：不能

`/schedules` 是**单 Project** 的：它读 `/api/projects/:p/schedules`（项目级接口），分组用的
`agent_state/schedule/` 又天然属于某个 Project 的某个 Agent。跨项目展示要三件事，前两件是新的：

- **一个跨项目的读接口**：服务端要遍历当前用户能读的 Project，把各自的 schedules 合成一份、
  每行带上 `projectId` 与项目名（现在的响应里没有项目这一维）。
- **界面上的项目这一维**：组头要看得出是哪个项目下的哪个 Agent；筛选/搜索要么只收窄组内行，
  要么加一个项目筛选。
- **创建时的归属**：任务文件的目录就是它的归属，且终生不变 —— 现在的「新建」是按当前项目列出
  Agent，跨项目视图下必须先选项目、再选 Agent，这一步是设计选择，没有默认答案。

所以这一条没有动手，等用户拍板要做成什么样。

### 2. 新建工作区的目录删除 —— 做了

提交 `e4cd22a8`（feat(web,server): 工作区选择器支持删除空目录）里的就是它，而**新建工作区用的
正是同一个组件**：侧栏的「+」→ `WorkspaceSelect` → `WorkspaceFinder`（`chat/workspace-finder.tsx`），
草稿页的那颗工作区胶囊也是它。删除的入口有三处：文件夹行的右键菜单、空白处的右键菜单、以及
工具栏（作用于选中的那一行）；二次确认卡片写明「只能删空文件夹、不可恢复」。

服务端 `DELETE /api/projects/:p/dirs` 的语义是窄的：非空 409 `dir_not_empty`（**绝不递归**）、
根目录 403 `dir_root_protected`、Project 目录及其祖先 403 `dir_project_protected`、文件
400 `not_a_dir`，判断全走 realpath，软链绕不过去。异机目标（ssh 浏览的机器）上「新建」与「删除」
两行一并去掉，因为那条路径不在这台机器上。

现网 0.3.0 产物核对：`/root/.adelie/lib/.../penguin-server/dist/index.js` 里有 `dir_root_protected`，
`/root/.adelie/web/assets/*.js` 里有「删除文件夹「…」？只能删除空文件夹，里面还有内容时服务端会
拒绝，且删除不可恢复。」所以线上那份确实带着这个功能。

### 3–6. 四条改动（提交 `eaa818fa`）

- **默认中文 + 默认人民币**（`state/locale.tsx`、`state/theme.tsx`）：没存过偏好时语言取 `zh`、
  显示货币取 `CNY`，不再跟随设备语言与 USD。「跟随系统」仍是设置里的一个选项，存过偏好的照旧。
  价格仍是 USD/million tokens 存储、`USD_TO_CNY = 7` 换算，变的只是默认的显示口径。
- **快捷指令文件夹能合上**（`chat/folder-row.tsx`、`chat/shortcuts-folder.tsx`、`chat/draft-view.tsx`）：
  那一行原本是「页签」——点开就开着、再点无效，而箭头一直在承诺一个不存在的折叠。改成
  disclosure：`onOpen` → `onToggle`。
- **模型库不再自动铺 TokenDance 连接横幅**：删掉 `features/models/tokendance-banner.tsx`、它专用的
  `.banner-shimmer`（keyframes + 渐变）与 `penguin.tokenDanceBannerDismissed` 登记。横幅是「没配 key
  就出现」的，每次进页面都把分组列表往下推；而 TokenDance 分组自己的「连接」入口（带状态点）
  本来就在，横幅不是唯一去处。
- **插件导入的规则收进独立 dialog**：两个导入对话框底部原来各铺两段编号列表（导入规则 + 编写
  规则），字多到把字段和确认按钮挤下去。改成底部一个「导入与编写规则」文字入口，点开标题为
  「插件导入与编写规则」的模态，内容仍是同一个 `PluginRules` 面板。Escape 只关规则那一层。

### 验证

- 门禁：`pnpm typecheck` 8 包 Done · `pnpm lint` 0 · `pnpm format:check` 干净 ·
  `pnpm --filter @lmliheng/penguin-web test` 236 文件 / **2877 通过 / 2 跳过 / 0 失败**（少了 4 例：
  TokenDance 横幅那两块的用例随组件一起删了）· `pnpm --filter @lmliheng/penguin-ui-gallery test`
  131 通过。
- 真页面（ui-gallery 的 framed app，7372，脚本 `check-user-six.mjs`，**30 条断言全过**）：
  不带 `lang` 参数时界面是中文、显式 `lang=en` 时是英文（对照）；模型库里 517 处价格都是 `¥`、
  没有 `$`、没有横幅文案也没有 `.banner-shimmer`，而分组自己的「未连接 / 连接」还在；新建会话页
  的「我的快捷指令」进来是合着的、点开 `aria-expanded=true` 且看得见「新建快捷指令」、再点收回
  `false` 且那行不见、还能再展开；上传与下载两个对话框里都不再铺规则、各有一个「导入与编写规则」
  入口，点开叠出第二个 dialog（两段编号列表、14 MB 与命名优先级都在），Escape 只关规则那层。

### 待办

- **这四条还没到线上**：现网 7364 跑的是 v0.3.0 的发布产物，这些改动要下一个版本（0.3.1）才看得见。

## 发布 v0.3.1：GitHub Release + npm + 现网原地更新（2026-10-06，用户点单）

### 用户说的

「发成 0.3.1，然后原地更新」。v0.3.1 的内容就是上一节的四条界面改动，外加另一条线（2.2c
读侧：`ADELIE_*` 与旧 `PENGUIN_*` 两个拼写都认）—— 那条线由并发的自进化会话提交，**在同一棵
主工作树里**。

### 为什么版本戳提交要在独立工作树里做

主工作树 `/root/adelie-fork` 有一场并发的自进化会话在同一个分支上随时提交。要打 tag 就必须
把树冻住，否则 `pnpm -r build` 与 tag 之间会混进别人的半成品。做法：版本戳提交 `7fc64596`
（root + 9 个工作区包 + 16 个插件包 → 0.3.1、`packages/core/src/index.ts` 的 `VERSION`、
新增 `RELEASE-v0.3.1.md`）落在 `main` 上，然后用 `git worktree add --detach /tmp/rel-0.3.1
v0.3.1` 检出一棵**干净、带自己 node_modules 的树**跑全部门禁、打包与 npm 发布。这样主工作树
里并发的提交一条也不会被卷进 tag。（四个私有 sandbox 插件仍留在 0.2.2 —— `builtin-registry`
会比对它们的版本，跟着升反而错。）

### 做了什么

1. **门禁（干净树 `/tmp/rel-0.3.1`，先 `pnpm -r build` 再 typecheck）**：build ✓ ·
   `pnpm typecheck` 8 个包 Done · `pnpm lint` 0 · `pnpm format:check` 干净 ·
   `pnpm -r test` **8878 通过 / 14 跳过 / 0 失败**。日志 `/tmp/gate31-*.log`。
2. **CLI 三件包**：`penguin-linux-x64.tar.gz` 112280308、`penguin-win32-x64.zip` 148034563、
   `penguin-universal.tar.gz` 55009840，各带 `.sha256`（`sha256sum -c` 全 OK），外加
   `install.sh` / `install.ps1`。
3. **离线隔离安装验证**（干净 HOME、不联网）：`penguin version` = `v0.3.1` /
   buildDate `2026-10-06` / commit `7fc64596`；用这份产物起 web 服务 200；产物里能搜到
   「导入与编写规则」，搜不到 TokenDance 横幅文案、`.banner-shimmer` 和那条已删的
   localStorage 键；显式 `en-US` 打开登录页也仍是中文（默认中文生效）。
4. **npm 整条链 19 个包**（3 个宿主 + 16 个插件）发到 0.3.1，逐个 `✅ Published`；抽样
   `penguin-cli` / `core` / `server` / `goal` / `use-firecrawl` 在 registry 上已是 0.3.1。
   发布后把 npm 发布脚本改回原状的 `cleanup` 也跑了，工作树干净。
5. **GitHub Release**：id `404060105`，14 个资产，`make_latest: "true"`；`releases/latest`
   指向 v0.3.1。实测下载 `.../latest/download/latest-linux.yml` 与
   `.../download/v0.3.1/install.sh` 都是 200。
6. **现网原地更新**：`penguin update --check` 报「Installed 0.3.0 · latest 0.3.1」→
   `penguin update --yes`（下载 tar 包、两级 checksum 都过）→ `systemctl restart
   adelie-server`。

### 桌面端 Linux 产物为什么是本机打的

打这一版的时候 GitHub Actions 正处于 degraded_performance（`githubstatus.com` 的
`Actions degraded_performance`）。第一次 dispatch（run `37363428805`）：macOS ✓、Windows ✓，
**ubuntu-latest 排队 15 分钟后被取消**。再 dispatch 一次（run `37365164133`），三个作业全部
排队 20 分钟一个都没起来，于是把它取消，**在本机的 tag 工作树里用与 CI 完全同一条命令**打：

```
pnpm --dir packages/desktop exec electron-builder --linux --publish never
```

（`BUILD_DATE` 按本机发布日盖成 2026-10-06，与 CLI 三件包同口径；Electron 二进制与
electron-builder 的 appimage/fpm 工具链都命中本机缓存，没有额外下载。）Windows 的 exe 仍来自
CI（run `37363428805` 的 `desktop-Windows` artifact，size 与 sha512 与该 artifact 的
`latest.yml` 一致）；macOS 依旧不发。三个平台都有的那一版安装包仍只有 CI 能给，这一版
Linux 是本机产物 —— **下个版本若 Actions 已恢复，Linux 应回到 CI 里打。**

### 验证（都是真跑出来的）

- 桌面端 Linux：`latest-linux.yml` 里 AppImage 的 `sha512` / `size` 与文件实际值逐字节相符
  （153442229 字节）；`app-update.yml` 指向 `lmliheng/Adelie`（github provider）；打包树里
  `resources/app/web-dist/index.html` 存在。
- AppImage 冒烟：在 `xvfb-run` 下用干净 `HOME` 启动，内嵌服务端把界面与 API 都服务起来
  （`GET /api/projects/…/agents` 200、`/api/version/update-check` 200），是超时收工而不是崩溃。
- 现网：`systemctl is-active adelie-server` = active、7364 在监听（新 PID）、`penguin version`
  = `v0.3.1`、`GET /` 200 且 `<title>Adelie</title>`；线上前端产物里能搜到「导入与编写规则」与
  `rulesLink`，搜不到 TokenDance 横幅；数据根 `/root/.adelie/data` 里的 `default_project` 等原样
  在，`/root/.penguin/data → /root/.adelie/data` 软链没动。只换了 `bin` `lib` `web` `node`。

### 收尾 / 待办

- **OSS 镜像还没做**：用户已把 AccessKey 写进 vault（`OSS_ACCESS_KEY_ID` /
  `OSS_ACCESS_KEY_SECRET`），但**还缺 Bucket、Region/Endpoint、是否公开读或走 CDN/HTTPS
  域名、目录前缀**，而且运行中的服务缓存了 vault，这两个变量要重启服务（或新会话）才进得来。
  拿到参数后：① 写推资产的脚本（可改 `scripts/publish-release-to-oss.sh`）② 把桌面端的镜像
  地址做成可配置（落盘配置，而非只能靠 `PENGUIN_UPDATE_FEED_URL` 环境变量）③ 默认 feed 指镜像。
  已发布的 0.3.1 资产可以事后补传。
- **用户贴在聊天里的那对 AccessKey 应当轮换**（值已进对话上下文）。
- 用户新提的两条（用户级全局密钥 + JSON 导入 + 分发给 Agent；默认头像改成 Adelie 图标）留给
  0.3.2，代码还没动。

## OSS 镜像上线 + 侧栏折叠条改小（2026-10-06，用户点单）

### 用户说的

OSS 那对象 AccessKey 已经写进密钥库、「Buucket 你不能自己管理创建吗，其他的看你自行配置」、
以及「左侧的成本中心，评估中心这块的展开/搜索的按钮太长了，颜色又比较深，改成中间一小块展开
收缩，同时添加 tip」。

### OSS 镜像（用户账号下新建的 Bucket）

- **Bucket**：`adelie-releases`，**cn-hangzhou**（跟着账号里已有的 `fast-node-server` 选同一
  个地域），Standard / LRS。**ACL `public-read` + 单独把这个 Bucket 的「阻止公共访问」关掉** ——
  新建 Bucket 默认是开的，建完匿名读还是 403，关掉这一个 Bucket 才通（账号级别的设置与另外两个
  Bucket 没动，`fast-node-server` 本来就是 public-read）。
- **布局**：`releases/<tag>/…` 不可变、一年缓存；`latest/…` 是同一批字节的稳定名字（`no-cache`），
  客户端只认它；`latest.json` 记录最新 tag 与两个基址。
- **脚本**：`scripts/publish-release-to-oss.sh` 按 Adelie 的 14 件资产重写（上游那份列的是
  `penguin-desktop-*`、darwin 包、SHA256SUMS 与 manifest 探针，Adelie 一个都不产）。上传后**逐个
  下载回来比对 sha256**；`releases/<tag>/` 里已存在的对象只有字节相同才放行，不同就报错。
- **v0.3.1 已镜像**：upload 750MB + 回读校验 1.5GB，14/14 对象逐字节一致；匿名 `GET` 200、
  `Range` 206。实测段速：上传 ~3.5 MiB/s、回读 ~6 MiB/s。
- 客户端怎么用（三处同一个地址）：
  `PENGUIN_DOWNLOAD_BASE_URL=https://adelie-releases.oss-cn-hangzhou.aliyuncs.com/latest`（安装脚本
  与 `penguin update`）、`PENGUIN_UPDATE_FEED_URL=https://adelie-releases.oss-cn-hangzhou.aliyuncs.com/latest`
  （桌面端 generic feed）。
- **还没做的**：桌面端把镜像设成**默认** feed（现在默认仍是 GitHub，镜像只能靠上面那个环境
  变量指过去）。下一版做，带上 GitHub 回退。—— **已在 v0.3.2 做完**（`5648d16a`，见本文件
  「发布 v0.3.2」一节）。

### 侧栏折叠条（提交 `9d781b53`）

`packages/ui/src/components/shell/sidebar-frame/sidebar-frame.tsx`：页签分组下面那条折叠控件
原本是满宽（272px）16px 高的灰带（`bg-fg/7`），铺在导航与列表之间像列表里多出来的一行。改成
**居中 64×20 的 pill**（`mx-auto … rounded-full`），其余不变；提示用的是既有的 `data-tooltip`
（只在屏上没有同样的字时才出现，纯图标按钮正是这种情形）。ui 1000 测试、ui-gallery 131 测试
通过；真页面在 github 深色、modern 深色、geek 浅色三种主题下各截了一张。**未发版**。

### 顺带（提交 `763f3cd7`）

`scripts/publish-release-to-oss.sh` 的重写与上面的镜像一起提交。

## 插件库再添两个并发上 npm：lesson-video、requirements-box（2026-10-06，用户点单）

### 用户说的

「好，不错，这个需求箱功能可以发布到插件，对了，我的 github 插件库又提交了一个插件，你正好把
那个插件更新到 npm 包」—— 两件事：把「需求箱」（我们这两周在用的那套：一页收需求 + 定时巡台 +
每轮邮件）做成插件发布；把 `lmliheng/penguin-plugins` 里新提交的那个插件发到 npm。

### lesson-video（提交 `b873c041`）

- 来源是 `lmliheng/penguin-plugins` 的提交 `2fe9b0e8`，那边叫 `@penguinharness/lesson-video@0.1.0`。
- 按本仓库插件规矩对齐：包名 `@lmliheng/lesson-video`、版本跟当前 dev 版本 `0.3.1`、补
  `repository.directory` 与 `LICENSE`（`files` 里也加上）、`SKILL.md` frontmatter 只留
  `name` + `description` 并补 `## Before you start`、整包过一遍 prettier。
- 接进 `packages/{core,cli,desktop}/package.json`（`workspace:*`）—— 内置插件靠宿主包的
  `dependencies` 经 Node 解析（`builtinRoots()`），不写就在库里看不见。
- 三处「必须提到每个插件」的守卫同步：`plugins/README.md`、`README.zh.md`、
  `packages/docs/content/skills.{zh,en}.md`。
- lint 报过 `render.mjs` 重复 import `node:url`，修掉后 amend 进同一个提交。

### requirements-box（提交 `2f62dc0f`）

线上那套需求箱（`/opt/adelie-design`）**不在任何 git 仓库里**，这一轮把它做成可分发的插件：

- `plugins/requirements-box/`：`requirements.mjs`（服务本体，零依赖）、`requirements.html`
  （那一页）、**新写的 `serve.mjs`**（独立服务器：只有这一页与它的接口，其余 302 到 `/requirements`，
  另有 `/healthz`）、**新写的 `install.mjs`**、`patrol.md`（巡台准则模板，从
  `/root/evolution/REQUIREMENTS.md` 泛化而来）、`box.config.example.json`。
- **服务本体去掉写死的本机路径**：改成「环境变量 > 同目录 `box.config.json` > 中性默认值」，
  新增 `patrolMissing()` 报错，`spawnPatrol` 里没配的参数就不传（传空串会被当成真的 id）。
  改动同样上了现网：新建 `/opt/adelie-design/box.config.json`，重启后节奏、条目、口令、页面
  全部照旧（90m / 22:00Z / 6 条 / 无口令 401 / 页面 200）。
- `plugin.json` 版本 `2026.10.06.1`、分类 `office-productivity`、`preinstall: false`。

### 端到端验证（装一份、真跑一遍）

- `install.mjs` 空跑 `--print-only` 看计划 → 真装到 `/tmp/reqbox-e2e-…`：文件、口令（`key.txt` 0600、
  数据目录 0700）、`box.config.json`、巡台 `.toml` 都落地。
- 起 `serve.mjs`（3400，没碰 3003 / 7364）：`/healthz` 200、页面 200、接口无口令 401、坏口令 401、
  建条目 201、空标题 400、改状态 200、乱状态 400、`patrol` 读写并真的把 `.toml` 的 `period` 改成
  90m、归档后不让改 409、未知 id 404、手动触发开工 200 且从 CLI 输出里读到了会话号、
  60 秒内再点 429。
- Playwright 打开那一页截图：样式完整、无 console 报错、巡台卡片与列表都在。
- **验证里抓到两个真问题，已修**（`2f62dc0f`）：① 定时任务 prompt 拼串缺一个空格，印出来是
  「标成 blocked并写清…」；② `--workspace` 指向不存在的目录时不在安装时报错，而是等到用户点
  「现在就做」才蹦一个 `spawn … ENOENT`（spawn 的 `cwd` 不存在）—— 现在装的时候就拦住并说清原因。

### 门禁与发布

- 干净工作树 `/tmp/plugin-rel`（detached，`pnpm install --frozen-lockfile`）上：`pnpm typecheck`
  八包 + 四个沙箱插件全过、`pnpm lint` 0/0、`pnpm format:check` 干净、`pnpm -r test` 退出码 0。
- `pnpm --filter <name> publish --access public --no-git-checks` → `@lmliheng/lesson-video@0.3.1`
  与 `@lmliheng/requirements-box@0.3.1` 都 `✅ Published`。两个包名首发（此前 404）。
- registry 复核：lesson-video 的版本端点先 404（staged 延迟，等了两分钟），随后两个都 200；
  把两个 tarball 拉回来对照本仓库逐文件一致（`requirements-box` 12 个文件、`lesson-video` 14 个，
  只差 npm 给 `package.json` 补的那个行尾换行）。**没有升版本号去催**。
- 主线推上 `origin/main`：`5489c88d..2f62dc0f`。

### 口径说明（避免误会）

- 中间那个提交（`b873c041`）里的插件计数最初写成 18，**是错的**：那时候库里是 17 个（16 + 
  lesson-video），18 是再加 requirements-box 之后的数。已把那个提交 amend 成 17、后一个提交写 18，
  两个提交各自都能过 `plugins.test.ts`。
- 插件有两个版本号，别混：`plugin.json` 里的是**日期序号**（`2026.10.06.1`，改了落地内容就要升），
  npm 包版本跟仓库 dev 版本走（现在 `0.3.1`）。

## 发布 v0.3.2：需求箱三条急件 + 现网原地更新（2026-10-06，需求箱巡台轮）

### 用户要了什么

需求箱（3003）里用户点了「**现在就跑一轮**」，箱子里三条 `priority: high`：

| 需求 | 提交 |
| --- | --- |
| req-4 用户级全局密钥（键值对 + 整段 JSON 导入 + 分发给某个 Agent） | `a2782629` |
| req-5 默认用户头像 / 默认智能体头像都改成 Adelie 图标 | `9597f3c3` |
| req-6 桌面端默认从 OSS 镜像检查更新，不通回退 GitHub Releases | `5648d16a` |

普通需求的 req-7（把上一节那条 `9d781b53` 侧栏折叠条带上线）按它自己的口径由这一版顺带满足。

### 三条怎么做的

- **req-4 用户级密钥**：存储 `<数据根>/users/<userId>/.vault.toml`（0600、隐藏、原子写、清空即删
  文件），`paths.ts` 加 `userVaultPath`、`IdKind` 加 `user_id`；服务端新增 `UserVault` 机制 +
  `user-vault-service` + `/api/me/vault`（GET/PUT）与 `/api/me/vault/import`（POST）、
  `POST …/vault/assign-user-vault`（owner-only）；Web 加「用户密钥」页与 Agent 密钥页的
  「从用户密钥分配」。**语义定了「一次性拷贝」**：分配是写进那个 Agent 自己的 `.vault.toml`
  （同名覆盖、其他保留），不动 core 的运行时注入路径，全局值之后改了要重新分配 —— 界面上与文档里
  都写明了。要「全局改一次处处跟着变」是另一条需求。
- **req-5 默认头像**：新增 `packages/ui/src/components/icons/logos/adelie-mark.tsx`，把品牌标记
  的 path 内联进 UI 包（原来只有 `packages/web/public/adelie-icon.svg`，UI 包不该反向依赖它），
  三个渐变 id 用 `useId` 去重（一页几百个头像），裁剪 `viewBox="170 170 684 684"` 比 app 图标更紧
  （最小场景 18px）；`user-avatar` / `agent-avatar` 的默认分支改画它，`avatar-stack` 描边统一。
  新增 `packages/ui/test/adelie-mark.test.ts` 逐条比对 svg 的 path 防漂移；两处守卫各加一条
  写明理由的豁免（`ui/test/deslop.test.ts` 规则 20 的 `hexHomes`、`web/test/icon-scale.test.ts`
  的 stroke 字面量 —— 品牌标记的颜色/描边是资产自己的身份数据）。
- **req-6 桌面端 feed**：`update-support.ts` 新增 `GITHUB_FEED` / `RELEASES_URL` /
  `MIRROR_FEED_URL`（generic）与 `UpdateFeedKind` / `initialFeedKind()` / `fallsBackToGithub()`；
  `updater.ts` 的 `applyFeed()` 换成 `setFeed(kind)` 并跟踪 `activeFeed`，每次 `check()` 从默认
  feed 起步（回退不粘到下一轮），`handleCheckError` 只对 `mirror` 回退 —— `override`
  （`PENGUIN_UPDATE_FEED_URL`）永不回退，否则端到端升级测试会在坏 URL 上打转。

### 桌面包为什么 Linux 本机打、Windows 走 CI

`desktop-build.yml`（ref = tag，signing=false）三平台全绿，Windows 的 exe/blockmap 直接取；
Linux 按用户口径在本机打（`pnpm --dir packages/desktop exec electron-builder --linux --publish never`）。
上一次 Actions degraded 时 ubuntu 作业被取消过，这轮虽然恢复（三平台都起来了），口径仍照用户的话执行。

### 验证（都是真跑出来的）

- 四道门禁在主工作树与发布树（`git worktree add --detach /tmp/rel-0.3.2 v0.3.2`）各跑一遍：
  typecheck 8 包、lint 0/0、format 干净、`pnpm -r test` **8891 通过 / 14 跳过 / 0 失败**。
- req-6 的真验证：本机打的 AppImage 在 `xvfb-run` + 干净 HOME 下启动，`desktop.log` 里
  `[updater] feed: mirror https://adelie-releases.oss-cn-hangzhou.aliyuncs.com/latest (GitHub Releases as fallback)`
  → `checking` → `up to date (0.3.1)`，**没有回退行**。
- req-4 的真验证：起真服务 curl 逐条（掩码 / 非法键名 400 / JSON 导入 / 分配 / 401）+ 真浏览器 8 张截图。
- req-5 的真验证：ui-gallery（7372）头像板与真页面 `/s/agents` 浅色深色各截图，18–64px 五档，
  控制台 0 错误。

### 发布与上线

- 版本戳 `3787c897`（root + 9 工作区包 + 18 对外插件包 → 0.3.2、core 的 `VERSION`、
  `RELEASE-v0.3.2.md`）、注解 tag `v0.3.2`；`main` 推到 `f60d422d`。
- **CI 红过一次**：tag 那一提交的 `test-windows (server-2)` 上 `test/user-vault.test.ts` 断言
  POSIX 的 `0600`，Windows 的 `chmod` 只切只读位、报 `0o666` —— 测试的移植性问题。`f60d422d`
  加平台守卫后 main 上 22 个作业全绿（run `37378302759`）。
- npm：`@lmliheng/` 下 21 个包发到 `0.3.2`（3 宿主 + 18 插件；四个 sandbox 插件是 private，跳过）。
  发布脚本的 `cleanup` 也跑了 —— 它只还原 `csu-mail` / `wechat-miniprogram` 两个入库的 LICENSE，
  本轮新增的 `lesson-video` / `requirements-box` 也有入库的 LICENSE，会被一并删掉，手工
  `git checkout` 还原（脚本里已记下这个坑）。
- GitHub Release id `404124352`（14 件资产）→ OSS 镜像 `releases/v0.3.2/` 与 `latest/` 都已是 0.3.2。
- 现网 `/root/.adelie`：`penguin update --yes` 升级成功（两级 checksum 过，只换 `bin/lib/web/node`），
  `penguin version` = `v0.3.2`。

### 重启现网时的一个坑

agent 自己就跑在 `adelie-server.service` 里（会话的 shell 挂在 `penguin.js server --port 7364` 下），
`systemctl restart adelie-server` 会把这次会话连同没写完的记账一起掐掉。做法是：先把归档、PATCH、
邮件、记账、这份进度全部写完，再用**脱离服务 cgroup 的瞬时单元**下发重启，并让那个脚本在服务回来后
自己核验（`is-active` / 7364 在听 / 新 PID / `GET /` 200 / `penguin version`），结果写到
`/root/evolution/requirements/runs/2026-10-06-0500/post-restart-verify.txt`。


## 第八轮：远端命令把两个名字都写上（2026-10-06，条目 2.2c 的写侧收尾）

条目 2.2c 到第七轮只剩「写侧」的尾巴，其中**唯一不在桌面壳一侧**的就是 `machines/commands.ts` 里
`remotePenguin()` 生成的那条命令 —— 服务端伸到别人机器上的那条。它原先只写旧名（`PENGUIN_HOME` /
`PENGUIN_PROFILE`），台账当时有意留着，因为「远端可能是一台还没升级的安装」；这一轮把那个待定项定成
**两个都写**：

- 命令现在以 `ADELIE_HOME` / `ADELIE_PROFILE` 打头，紧跟着旧名的同名变量，四个值两两相同；
  POSIX 走 `env`、Windows 走 `set`，两副拼写各自的引号规则不动。
- 为什么不是「探测远端版本」：这条命令最后落进哪一版 CLI，取决于那台机器 hmr store 里被推过的那一份
  （`dist/penguin-hmr.js` 只负责把它取出来），而 store 里可能仍是更早的发行推上去的 —— 只认旧名的那一份。
  探测要多花一次 ssh 握手（`commands.ts` 开头的「数握手」那条规矩），而且 store 里同时存在改名两侧的
  版本时探出来也不一定对。读侧本来就两个都认、新名优先（`core/src/state/boundary-env.ts`），于是
  「两个都写」让新旧两侧都成立，代价是两个词。
- 跟着改的是注解与测试，没有别的行为改动：`machines/layout.ts` 的数据根注释说明了两个名字；
  `machines.test.ts` 把「profile 传过去」那条的断言换到新名，并新增一条**把四个名字和前后顺序一起钉住**
  的用例（拼写是契约，逐字写死而不是拼出来）。

**验证（都不是推测）**：六包 typecheck 过；`pnpm lint` 0 警告、`pnpm format:check` 干净；
core 1359 / 5 跳过 · server **2601** / 2 跳过（比上一轮 +1，就是那条新用例）· cli 505 · ui 1003 ·
web 2877 / 2 跳过，**0 失败**。另外把 `remotePenguin()` **真生成的那条命令**（用 Node 直接 import
`packages/server/src/machines/commands.ts` 打出来的字符串，不是手抄的复述）交给 `sh -c` 跑：假 HOME 下
摆好程序目录，把「node」换成读 `resolveRoot()` / `boundaryEnv()` 的桩 —— 四个变量都在且值一致，
远端解析出的数据根与 profile 都是这一侧的 dev（`reader-root=$HOME/.penguin-dev/data`、
`reader-profile=dev`）。**Windows 那副拼写只由单测钉住**：本机没有 cmd.exe，与往常一样没在真 Windows
上跑过。

**这一条还没法勾掉**：2.2c 的写侧剩下 `packages/desktop/src/{server-process,launcher,web-dist}.ts`
与桌面壳自己的开关，按纪律（依赖没装、3.5 才决定取哪个桌面壳）这一轮没碰；`machines/commands.ts`
是写侧最后一个不在桌面壳一侧的写点，到此为止。
