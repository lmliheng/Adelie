# Adelie 推进台账（`main`）

> Adelie 从 2026-10-04 起改用 PenguinHarness 的整棵代码树当基座（用户定的「B」方案）。
> 决定原文与背景在 `FORK.md`；这份文件是**主线上的工作量台账**。
>
> **分支口径（2026-10-05 起）**：主线就叫 **`main`**（仓库默认分支）—— 它是新基座，
> 2026-10-05 从原来的 `fork/penguin-base` 并过来、旧名已删。**旧的、自写的 Adelie 现在叫
> `legacy/main`**（尖端 `7fb74262`），工作区在 `/root/Adelie`，已经冻结，不再往上加东西；
> 旧 Adelie 那两本台账（`docs/engine-progress.md`、`docs/web-progress.md`）在 `legacy/main` 上。
> 这份文件里 2026-10-05 之前的记录写的是 `fork/penguin-base`，指的正是今天的 `main`。
>
> **文档位置（2026-10-08 起）**：本 fork 自己的文档收在 `docs/` —— 本文件与 `FORK.md` 在
> `docs/`，各版本的发布正文在 `docs/releases/`；仓库根只留 `README.md` / `README.zh.md` /
> `CHANGELOG.md` / `CHANGELOG.zh.md` / `THIRD-PARTY-NOTICES.md` / `LICENSE`。下面 2026-10-08
> 之前的记录里写的 `RELEASE-v<版本>.md`（仓库根）指的就是今天的 `docs/releases/` 里那份。

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
      - **写侧又补一批（2026-10-06，第九轮）**：第八轮说的「`machines/commands.ts` 是写侧最后一个
        不在桌面壳一侧的写点」**说早了** —— 仓库里还有一批非桌面壳的写点写着旧名（读侧两个都认，所以
        一直没暴露）：两个 `penguin` 脚本（根 `package.json` 与 `packages/cli/package.json`）、
        `packages/server/package.json` 的 `dev` 脚本、`packages/web/e2e/run.sh` 起服务那一行、
        `Dockerfile` 的 `ENV`、以及 `install.ps1` 在缺 `bin\penguin.cmd` 时**生成**的那个 Windows
        启动器垫片（它和第七轮改过的 `scripts/launchers/penguin.cmd` 是同一件东西，改完两者拼写一致）。
        变量名全都改用 Adelie 的，**取值一个没动**（`~/.penguin/dev-data`、`~/.penguin/dev-data-cli`
        这些**路径**仍留旧拼写，理由见 `packages/core/src/internal/ports.ts`：那是与桌面壳耦合的那步）。
        细节与实测见「第九轮」一节。
      - **非桌面壳的收尾·三（2026-10-06，第十一轮）**：第九轮说「非桌面壳的写点收干净了」，这次**连读点一起**
        重扫，又找出两处**会真的出错**的漏网、一个写点和一处文档尾巴 —— 容器入口 `docker/entrypoint.sh` 取数据根
        写的是旧名（而 `Dockerfile` 的 `ENV` 早在第九轮就是 `ADELIE_HOME`，也就是**没有任何东西会设那个旧名**）、
        需求箱插件的 `kit/install.mjs` 把数据根写成「旧名在前」还与 2.2b 已废的 `PENGUIN_PROJECT_ID/AGENT_ID` 对读、
        `packages/web/scripts/theme-shots.mjs` 的三个变量、`packages/web/README.md` 那一行。四处都改过来了
        （插件 `plugin.json` 日期版本 +1），改法与验证见「第十一轮」一节。
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
      - **第十二轮（2026-10-07）复核过一次**：非桌面壳剩下的 `PENGUIN_*` 全都只是**有意保留**的（兼容别名与
        它自己的注释、钉兼容的测试夹具、`machines/commands.ts` 那条两个都写的远端命令）；可做的只剩三件、
        而且都不在「改代码」这一侧 —— 桌面壳那一半、既有部署单元 `adelie-app.service`、插件里三处文本 ——
        所以本轮跳过它先做 3.1，理由与选项写在「第十二轮」一节。
      - **文本面收尾（2026-10-07，第十三轮）**：把「有意保留」之外、仍把旧名当**现在**在用（而不是作为
        兼容说明）的地方一次收干净 —— 5 份插件技能契约、2 份包 README、6 处源码注释改用 Adelie 的名字；
        并修掉需求箱安装脚本的**默认数据根**（无变量时算的是 `~/.penguin`，而 core 是 `~/.adelie/data`，
        等于把定时任务登记到服务端不读的根上）。细节与验证见「第十三轮」一节。
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
        4. **不是契约、也不影响跑起来的两处**（第十三轮有意留）：`packages/ui-gallery` 的 mock 数据
           （`library/boards/data.tsx` 的 `~/.penguin/data`、`app/mock/fixtures.ts` 那几处演示路径）——
           它们是画廊的示例内容，不是任何东西读的契约；`packages/docs/**` 的环境表与 `changelog/**` /
           `RELEASE-*` 按 2.5 / 2.1c 的口径整体留到发布期那一轮。
- [x] 2.3 **端口与 profile 默认值**（2026-10-06，第十轮）：把「人会见到的」两个端口换成 Adelie 自己的 ——
      服务器默认端口 `7364` → **`4000`**（旧 Adelie Web 的地址，也是本机 ufw 规则与
      `/root/egress-whitelist/config.json` 里写着「Adelie Web (4000)」的那一条），dev CLI 端口
      `7369` → **`7370`**（旧 Adelie CLI `adelie serve` 的缺省值，也是它的设计站上写着的那个号）。
      上游 PenguinHarness 自己的 7364 / 7369 因此留给上游，一台机器上装两个产品时不必再抢同一个
      socket。**仍然与上游同号的**：`dev:server` 7368、`dev:web` 7365、画廊 7372、机器转发 7371 ——
      本条只点了上面那两个，这几条留着（它们只在「同一个开发者同时开两棵树」时才撞）。细节见本轮一节。
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

- [x] 3.1 **审批口径三档**（2026-10-07，第十二轮）：把旧 Adelie 的三档行为逐条对着基座核了一遍，
      **判定上游已覆盖 —— 没有要移植的代码，也没有要删的东西**（旧：`always-ask`（默认）/ `read-only` /
      `allow-all`，「每个人的」、PATCH 后立刻生效；基座：**四档**多一个 `deny-all`，挂**每个会话**，
      另有 Project 默认档与组织档，裁决时重读库、同样立刻生效，决定记成 `approval_decision` 事件，
      另外多一层「命令策略」在审批之上否决）。**有意保留的两处差异**：基座默认 `allow-all`（定时任务建的
      会话取的就是这个默认值，而它不是 `client === "org"` 的无人值守会话、拿不到「当场判 deny」的短路 ——
      改成 `always-ask` 会让这些自主轮次永远挂住）；基座没有旧 Adelie 那个 5 分钟审批超时（挂到人裁决或
      本轮被中断，中断时 pending 收敛为 deny）。对照表、证据与验证见「第十二轮」一节。
- [x] 3.2 **模型目录（deepseek / kimi / qwen）与费率表**（2026-10-07，第十四轮）：逐条对着基座核完，
      **判定上游已覆盖 —— 没有要移植的代码，也没有要删的东西**：四家厂（deepseek / openai / kimi /
      qwen）在基座里是 5 个分组、28 行在架条目、**行行有价**（整册 179 行），三桶价（cache_read /
      cache_write / output）与旧 Adelie 的（input / cacheRead / output）逐字等价，且多出峰谷档与
      「无价即未计价」两条；
      默认模型是每个 Project 的 `default_model = deepseek / deepseek-flash`（对应旧 Adelie 的
      `DEFAULT_PROVIDER = 'deepseek'`）。**有意保留的三处差异**写在「第十四轮」一节里。本轮没有改代码。
- [x] 3.3 **用量与成本页**（2026-10-07，第十五轮）：把旧 Adelie `web` 台账第 4 条那一套（`/api/usage`
      + 成本中心）逐条对着基座核完，**判定上游已覆盖 —— 没有要移植的代码，也没有要删的东西**。基座是
      一整套：成本中心（`/api/projects/:p/usage` 的四个维度 + 分页错误表 + 模型终身用量）、会话头部的
      实时与累计成本、上下文环、公司模式的工单/预算财务页；**「只落 token、成本查询时现算」这条原则两家
      也一致**（基座的 `usage_records` 同样不落成本）。有意保留的四处差异（明细表被图取代、未计价只有
      布尔、范围轴线、两个扫盘字段）与证据见「第十五轮」一节。**本轮没有改代码**。
- [x] 3.4 **用户与两档角色、会话归属**（2026-10-07，第十七轮）：逐条对着基座核完，**判定上游已覆盖 ——
      没有要移植的代码，也没有要删的东西**：账号（`users` + 管理员用户后端 + 无自助注册）、两档角色
      （`is_admin`，用户管理页与账户行都有徽标、每一片管理员面都按它拦）、会话归属（`projects.owner_user_id`
      + `project_members`，看不见的一律 404）都在；**有意保留的差异**写在「第十七轮」一节，其中最实的一条是
      **只有一个管理员、角色不可改**（旧 Adelie 能升/降管理员，基座没有这条路由，实测 404）。本轮**没有改代码**。
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

### 5. 跟上游学（2026-10-06 查上游现状后定的顺序）

判据是「对着我们的待办与生意」，不是「上游有什么」。上游 `main` 停在 `d56d9ced`（2026-10-04T18:02Z），
我们比它少 31 个提交（`18d7c137` 基座 → 今天），另有 221 个分支在推（今天 09:17Z 一波约 180 条）。

- [x] **5.1 工位 @ 合并成一个工作轮**（上游 `feat/org-trigger-coalesce` / `c41fa086`）——本轮做完，见下。
      这是四处里唯一一条直接压公司模式那笔钱的：会话数才是费用变量，而忙工位过去会攒下几十个各带一份
      频道上下文的工作轮。
- [x] **5.2 插件库「自带 demo」+ 商店条目模型**（上游 `c6a7b6ee` `#726`、`feat/plugin-store`）——
      正对插件市场 v1 的货架、一键安装与更新提示；上游把索引条目、桶、demo 快速开始都试过了。
      **2026-10-07 核实：这件事已经做完了**，由另外的巡台会话在 2026-10-06 提交：`2a8f56e7`
      「插件市场给每个自带插件包一条条目」（core/server/web/docs）、`fcc78f93`「插件市场的卡片加每 Agent
      状态与一键安装/更新」——`packages/web/src/features/plugins/plugins-page.tsx` 里
      `marketState` 的 not installed / installed / updatable 三态、`availablePluginRows`、筛选与一键
      安装/更新都在，两条提交就在本文件的 HEAD 历史里。**本条没有留下需要做的活**（`/root/evolution/PLAN.md`
      里「插件市场 v1」标的 ⏳ 已过时，那份计划不归本台账管，未改）。
- [~] 5.3 **跨机 agents**（`feat/agents-across-machines`、`feat/machine-*`、`feat/port-forwarding`、
      `feat/company-remote-machines`、`feat/agent-state-handover`）——**调研已做完（见文件末尾「跨机评估」
      一节），落地只做了「跟上游学之二」那一条**。**落地顺序①（`fix/machine-*` 那批小修复）2026-10-08
      第二十三轮走了一遍**：能上的两条已上（`7e1dca63` setsid、`a2801c8d` 这一跳先作答），另外三条逐条
      核过、各自卡在别的前置上（理由见「第二十三轮」一节）。**2026-10-09 第二十四轮**把上游 `main` 上仅剩的
      那条跨机提交也落了（`dd1b931f` #973：跨机的 per-machine lane 测试在 Windows 上不再无理由跳过、并把
      Windows 上仍未测到的三处写进 CI 注释）—— 至此评估里说的「上游 `main` 里我们还缺的跨机提交」清零。
      结论：我们自己的跨机子系统已经不小，缺的不是地基而是
      上游那批修复与「公司模式跑在别的机器上」；而**「这台 Linux 指挥 Windows 生成台」在今天的两侧代码里
      都还不可能**（Windows 机器连不上，见评估）。价值仍在，但要按评估里的顺序走。
- [x] 5.4 **沙箱体系**（上游已进 main：Landlock 让默认 Ubuntu 可用 `234183f5`、权限菜单命名预设
      `9b170c61`、`sandbox-dsh` 在 Windows 走 pwsh `c03e58c4`、建沙箱前先建 scratchpad `cba091e3`、
      后端拆成 npm 包 `1ba104c9`）。我们有四个后端，缺的是「体系」：公司模式下一群 agent 在跑命令。
      **2026-10-09 第二十九轮落地最后一块 `234183f5`（#978）**，见该节；只剩 `1ba104c9`（拆 npm 包），
      它属 4.x 的发布链路。
      - **第一块已落地（2026-10-08，第十八轮，提交见该节）**：**建沙箱前先建 Session scratchpad**
        （上游 `cba091e3`）——`workspace-write` 下服务端在每次受约束的 spawn 之前 `mkdir -p` 那个目录，
        建不出来就 fail-closed 拒掉这条命令；`SandboxPolicy.writableRoots` 的契约文档一并跟上。
        选它打头，是因为这五条里只有它**是一条独立的真 bug**（scratchpad 懒创建，缺失期间该 Session 的
        每条命令与每个 hook 都被 bwrap 的 `Can't find source path` 挡下，删掉它同理），改动小、不依赖
        其余四条、且本机就能真跑出来。
      - **第三块已落地（2026-10-08，第二十一轮，提交 `dcb77d05`）**：**`sandbox-dsh` 在 Windows 上
        拒绝 bash、并在错误里点名它要哪个 shell**（上游 `c03e58c4`）—— 加载即失败 + 逐条拒绝两层都在，
        用例把平台与会话 shell 注入，所以在 Linux 上也能真跑这两层。细节见「第二十一轮」一节。
      - **第二块已落地（2026-10-08，第二十二轮，提交见该节）**：**CI 真正跑沙盒插件的测试、跑不起来
        就红**（上游 `e3a9eb66` `#872`）—— Linux 的 `rest` 分片此前是一串写死的包名，`plugins/*`
        从来没被列进去（4 个沙盒后端包在 Linux CI 上一条都不跑），而即使排上，GitHub 的 Ubuntu 机器
        默认不给普通程序建 user namespace，bwrap 的 live 用例会整片静默跳过、CI 依旧全绿。现在
        `rest` 与 macOS / Windows 同形（全仓减去已各自分片的包），矩阵用 `ADELIE_MUST_RUN` 声明
        「必须真跑」的套件（ubuntu `sandbox-bwrap,sandbox-dsh`、macOS `sandbox-seatbelt,sandbox-dsh`），
        声明了却开不了就红并带上理由；Ubuntu 的 userns 开关作为作业前置步骤；`sandbox-bwrap` 的
        live 套件自己用 vitest `globalSetup` 铺好自带的 bubblewrap（vendorer 的「已就位」判据补上
        「每个架构的 `bin/bwrap` 存在且可执行」）；bwrap 的拒绝理由补上 Ubuntu 的开关。**选它的理由**：
        5.4 剩下三条各自压在上游前置上（见下），它是这一串里唯一自立、可整块落地、且本机就能真跑
        验证的一笔。细节见「第二十二轮」一节。
      - **还差什么**（还剩三条各自成串，按上游那串的顺序）：
        1. `234183f5`（Landlock 让默认 Ubuntu 可用）是**一组提交的顶端**：路由改成「谁实现得多谁服务」
           （`pick()`）、新增 `closed-temp` 维度、插件契约多出 `mechanism` / `limits`、沙箱卡片改成
           `Enforced here: …` 加一张 More info —— 它自己的说明里就写着依赖本系列更早的
           「DSH 自带依赖」那几笔。要拿它得连前置一起算，约 1.5k 行、跨 core/server/web/plugins
           四包，一轮做不完。**第十九轮实测**：`git apply -3` 落它，`packages/{server,web,plugins}`
           多处冲突（它的设置面与 `9b170c61` 是同一串）。
           **2026-10-09 第二十六轮把这条链上半独立的那一笔落掉了**：`45885985`（#977）—— 它就排在
           `cba091e3`（#976，第十八轮已落）之后，是本树唯一还能整块拿下的前置：CLI 快速开始新增
           「Ubuntu 上的沙盒」一节（含那份要 root 的 AppArmor profile）、后端拒绝文案指向它、
           README 写明要求、一条新用例。所以这条链如今缺的只剩 `9b170c61`（#975，见下条）与
           `1ba104c9`（属 4.x）；`234183f5` 自己仍要等 #975 —— 它要改的
           `packages/server/src/sandbox/settings-status.ts` 等文件由 #975 引入，本树没有。
           **2026-10-09 第二十七轮把 #975 的前置落掉了**：上游 `1eb13325`（#961，停靠面的全屏 +
           每个停靠面板都是一条注册表定义）。它正是 `packages/web/src/features/chat/builtin-dock-panels.tsx`、
           `chat-dock-context.tsx` 与 `features/dock/panel-registry.ts` 的引入者 —— 而 #975 要改的
           头两个文件本树此前根本没有（第十九轮实测记过）。所以这条链上「树里不存在的文件」这一栏
           现在归零：剩下的就是 `9b170c61`（#975，前置已就位）与 `1ba104c9`（属 4.x）。
           **2026-10-09 第二十八轮把 #975 也落了**（见下条），所以本条（`234183f5` / #978）现在
           **前置齐了**：它要改的 `packages/server/src/sandbox/settings-status.ts` 已在树里 —— 它是
           5.4 剩下的唯一一块（`1ba104c9` 属 4.x），但仍是「一组提交的顶端」，得单独一轮。
           **2026-10-09 第二十九轮已落地**（提交见该节）——5.4 的代码面到此清零，只剩 `1ba104c9`。
           落 #961 时 `git apply -3 --check` 是干净的（三处冲突都是 import 区的包 scope 与本仓的两处
           本地新增，见「第二十七轮」一节）。
        2. `9b170c61`（权限菜单命名预设）**它自己一次就 6068 增 / 924 删**（设置页的插件配置表整片重写，
           含 `plugin-config-table.tsx` 436 行），与 web 的文案面重叠，得单独一轮。**第十九轮实测出了一条
           更硬的拦路石**：这个补丁要改 `packages/web/src/features/chat/builtin-dock-panels.tsx` 与
           `chat-dock-context.tsx`，而**这两个文件我们的树里根本没有**（它们由上游那套「dock 面板」重构
           添加，`grep -rl useChatDock packages/web/src` 为空），`9b170c61` 只是把里面的 props 从
           `onChangeApprovalMode` / `onChangeSandbox` 并成 `onChangePermission`。所以它不是「一轮的量」，
           而是「先决定要不要把上游的 dock 面板重构也搬过来」——那件事的落点应当先写进这张表再动手。
           **2026-10-09 第二十七轮：那个前置已经落了**（`1eb13325` / #961，见上一条），
           `grep -rl useChatDock packages/web/src` 现在有结果、两个文件都在树里 —— 所以这一条不再卡在
           「文件不存在」上，它剩下的只是规模（6068 增 / 924 删，得单独一轮）。
           **2026-10-09 第二十八轮已落地**（提交见该节）：69 个文件 / +6125 −935（含四份 changelog 与
           三处本树缺的前置），`git apply -3` 之后 9 处冲突全在 import 区与「上游已把这一段搬走」的那几行上，
           逐条解掉；细节与验证见「第二十八轮」一节。
        3. `c03e58c4`（`sandbox-dsh` 在 Windows 拒 bash、并在错误里点名它要哪个 shell）——
           **2026-10-08 第二十一轮已落地（`dcb77d05`）**。原先记的拦路石是「这条的 live 证据要
           `windows-latest`」，这一轮实测把它收窄了：**检查本身与两种拒绝在本机就能真跑** ——
           上游新增的用例把平台与会话 shell 都做成注入的（11 条里 10 条在 Linux 上跑绿，只有
           「真实 ACL runner 下跑两种 PowerShell」那一整块是 `describe.skipIf` 的 Windows 专属），
           产物侧的两处验证（`import(HOST_CORE)` 仍是运行时导入、无可解析 core 时 `hostSessionShell()`
           返回 `null`）也在本机做完了。**当时的「仍未验的」**是真 Windows 主机上 pwsh / Windows
           PowerShell 在实 runner 下确实能写工作区内、工作区外被拒 —— 那得有一台 Windows。
           **这一栏 2026-10-09 第二十五轮收掉了**（见下一条）：上游 `82498039`（#974）把那条 live 套件
           在 Windows 上真跑起来（会话 shell 走 pwsh），CI 的 `test-windows (rest)` 从此必须跑它。
           细节见「第二十一轮」与「第二十五轮」两节。
        4. **Windows 上的 live 取证已落地（2026-10-09，第二十五轮，提交见该节）**：上游 `82498039`
           （#974）—— 这条 live 套件不再在 Windows 上整文件跳过：探针按会话 shell 的语言分成两套
           （pwsh 那套用 `Set-Content` / `Get-Content`，POSIX 那套照旧），`ADELIE_SHELL=pwsh` 在 adaptor
           加载之前设好（core 每个进程只解析一次 shell），Windows 上先探一次 pwsh 在不在、不在就把
           「会话 shell 不是 PowerShell 7」当作开不了交给 `mustRun()`；背景子进程那条断言补上「工作区
           内的标记文件确实写了」这半边（此前只断言工作区外没写，一个从未跑起来的子进程也能蒙混）；
           `ci.yml` 的 Windows `rest` 分片声明 `ADELIE_MUST_RUN=sandbox-dsh`，所以跑不起来就是红的。
           细节与实测见「第二十五轮」一节。
        5. `1ba104c9`（后端拆成 `@penguinharness/sandbox-*` 并发布到 npm）：落点正是 4.1 的 npm scope
           与发布链路，按纪律留给 4.x 一起做。
- [x] 5.5 **长会话与 Trace 的加载性能**（`b8862716` `#958`：窗口化消息 + Trace 行索引 + Trace 图片）——
      **2026-10-08 第十九轮落地**：照上游的改动移植（不是合分支），39 个文件 / +2572 −646，
      含新服务端 `trace-line-index.ts`（按文件的行索引）、`trace-images.ts`（图片按引用下发）与
      新的 `GET /api/sessions/:id/trace-image` 路由；web 的 Trace 文件视图改成**按轮次读取**
      （`trace-rounds.ts`，读文件先取分析、只读展开轮次的事件），删掉被取代的
      `trace-events-loader.ts` 与它的用例；`lazy` 缩略图落到 ui 的两处卡片。
      细节与验证见「第十九轮」一节。
- [ ] 5.6 **用量成本「记账时就定价」**（`feat/usage-cost-at-record-time`）——公司审计里 `unpriced = false`
      那个口径就靠它。**服务端那一半已做**（2026-10-08，第二十轮，提交见「已完成的轮次」）：用量行在写入
      时定格成本（`cost` / `cost_settled`，迁移 14）、查询一律不再取价、启动时把没有成本的行补算一次。
      **core 那一半有意未搬**（`token_usage.pricing` 戳记与 `resolveBilledPricing` / `billedRates`、
      目录的 `discountUntil` / `discountRateAt`）：我们的逐行促销存在 `web.db` 的 `model_promotions` 表里，
      core 进程读不到它，盖在事件上的费率会把每一行促销模型都按原价计费。要完整形态得先把促销搬进
      Project 自己的配置 —— 那一步等用户拍板，理由写在那一轮的「有意未采用」一节与 changelog 里。
- [x] **5.7 一个功能提交带一条 `changelog/unreleased/<日期>-<slug>.md`（中英双份）** ——本轮照做；
      此前我们自己的改动基本只写本台账，发版说明全靠临时凑。
- **不学**：阿里云 OSS 分发（`feat/aliyun-oss-release-distribution`）、模型库「官方推荐」与 TokenDance
  推荐分组（`FORK.md` 已写明不搬）、`web-mod-1…12` 那类大模块化重构（与我们改过的 77 个文件重叠，
  现在合进来是净亏）。

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
| 2026-10-06 | 2.2c（写侧·非桌面壳的一批） | 第八轮漏掉的那批非桌面壳写点改用 Adelie 的名字：两个 `penguin` 脚本、`server` 的 `dev` 脚本、`packages/web/e2e/run.sh` 起服务那行、`Dockerfile` 的 `ENV`、`install.ps1` 生成的 Windows 启动器垫片（与 `scripts/launchers/penguin.cmd` 对齐）；**取值一个没动**，测试守卫与 CONTRIBUTING / 注释跟上 | 六包 typecheck 过 · `pnpm lint` 0 · `pnpm format:check` 干净；cli **506** · ui **1003** · server **2606** / 2 跳过 · web **2888** / 2 跳过（core 那条红来自另一条线正在改的 `README.md` 分类表，非本轮）；脚本行默认值经 `run-with-env.mjs` + 桩解析，新旧拼写逐字相同；`pnpm penguin version` 真跑；按 `web/e2e/run.sh` 那一行的变量名真起一次服务（日志自报数据根 / SQLite / 前端目录都对、标题 Adelie）；整条 e2e 42/69 —— 失败是**旧前端产物**造成的选择器错位，非本轮；`sh scripts/test-installer.sh` 通过；CI run **`37432299704`** 22 个作业全绿（含 `installer-windows`，见下） | `079cf1b4` |
| 2026-10-06 | 2.3 | 默认端口换成 Adelie 自己的：服务端 `7364` → **`4000`**（旧 Adelie Web 一直在服务的地址，也是本机 ufw / egress-whitelist 里写作「Adelie Web (4000)」的那条）、dev CLI `7369` → **`7370`**（旧 Adelie CLI `adelie serve` 的缺省）。改到的地方：core 常量与端口表（含「为什么是这两个号」）、CLI 帮助文案 zh/en、cli/server/web 三份 README、两份 CONTRIBUTING、install.sh/install.ps1 的上手提示、Dockerfile 的 PORT/EXPOSE、compose 映射、docker 工作流的冒烟地址、两个 dev CLI 脚本、三处测试断言（机器 layout 的 release 默认端口、CLI 默认端口；system prompt 的端口守卫改成跟 core 的常量走） | 六包 typecheck 过 · `pnpm lint` 0 警告 · `pnpm format:check` 干净 · core **1359**/5 跳过 · cli **506** · server **2606**/2 跳过 · web **2896**/2 跳过 · ui **1003**，**0 失败** · `sh scripts/test-installer.sh` 通过 · `docker.yml` 与 `compose.yaml` 用仓库自带 `yaml` 解析通过（触发面仍是 `workflow_call`/`workflow_dispatch`/`pull_request`，没有 main 推送） · 真起服务（端口 7477、数据根 `/root/adelie-fork-data/r10-portcheck`）日志三行对新根，Playwright 打开是 Adelie 登录页、console 唯一 error 是登录前 401 · 4000 全程没有监听、也没被本机绑定（它在「不许动」的名单里，默认值只经常量 + CLI 帮助 + 单测验证） | `3835c0e8` |
| 2026-10-06 | 2.2c（非桌面壳·三） | `docker/entrypoint.sh` 的数据根改按 `ADELIE_HOME` → 旧名 `PENGUIN_HOME` → `/data` 取（`Dockerfile` 的 `ENV` 早已是新名，旧写法会让 `-e ADELIE_HOME=<挂载点>` 指到 `/data` 上去）；需求箱插件 `kit/install.mjs` 的数据根改成新名在前、project / agent 只读 `ADELIE_*`（`plugin.json` 日期版本 +1）；`packages/web/scripts/theme-shots.mjs` 起服务用的三个变量与 `packages/web/README.md` 那一行跟上 | 见「第十一轮」一节 | 见本行提交 |
| 2026-10-07 | 3.1 | **审批口径三档判定上游已覆盖**（`FORK.md` 给这一条的判据是「接回 **或判定上游已经覆盖、直接删**」）：把旧 Adelie 三档的行为逐条对着基座核过 —— 四档 ⊃ 旧三档、挂会话 + Project 默认档 + 组织档、裁决时重读库所以改档即时生效、决定记成 `approval_decision` 事件、另有命令策略在审批之上否决；**有意保留的两处差异**（默认 `allow-all`、没有旧 Adelie 那个 5 分钟超时）写清理由 —— 默认档改成 `always-ask` 会让定时任务的自主轮次永远挂住（本轮亲手核出证据链）；`FORK.md` 第 3 条把这一项标成「已判定覆盖」。**本轮没有改代码** | 六包 typecheck 全过；测试 core **1359**/5 跳过 · web **2899**/2 跳过 · ui **1003** · cli **506** · hmr 无用例 · server **182 文件 / 2625 通过 / 4 跳过**（整包三次 2 绿 1 红，红的是 `terminal-stream.test.ts` 那条装载敏感用例、单跑 5/5 全绿，与本轮无关）；没有起服务、没有动的端口 | `19b56659` |
| 2026-10-07 | 2.2c（文本面收尾） | 非桌面壳、非发布面里仍把旧名当「现在」用的地方收干净：6 份插件文本、2 份包 README、5 处源码注释改用 Adelie 的名字；修掉需求箱安装脚本的默认数据根（无变量时 `~/.penguin` → `~/.adelie/data`，与 core 的 `resolveRoot()` 对齐）；4 个插件的日期版本 +1 | 六包 typecheck 过 · `pnpm lint` 0 警告 0 错误（2054 文件）· `pnpm format:check` 干净 · core **1359**/5 跳过 · ui **1003** · cli **506** · web **2899**/2 跳过 · server **182 文件 / 2625 通过 / 4 跳过** · docs **62**，**0 失败** · 安装脚本 `--print-only` 五种组合各真跑一次，修复前后各一次（修复前 `/root/.penguin/…`、修复后 `/root/.adelie/data/…`，与 `resolveRoot()` 一致） · `check-plugin-versions` 过了 | `37f710d9` |
| 2026-10-07 | 3.2 | **模型目录与费率表判定上游已覆盖**（`FORK.md` 第 3 条的判据是「接回 **或判定上游已经覆盖、直接删**」）：旧 Adelie 的四家厂在基座里是 5 组、28 行在架、行行有价，三桶价与旧的 input / cacheRead / output 逐字等价（拿两边**真的**函数比 192 组 token 组合 × 3 套牌价，**最大差 0**）；默认模型 `deepseek / deepseek-flash` 对得上旧的 `DEFAULT_PROVIDER`；基座还多出峰谷档与「无价即未计价」。三处有意保留的差异（Qwen 两组的 `envKey` 是 `OPENAI_API_KEY`、人民币按 7:1 折 USD、没有用户级 `.env`）与理由写进条目。**本轮没有改代码**，2.2c 因剩下的活全在桌面壳 / 部署一侧而照例跳过 | 六包 typecheck 全过；测试 core **1359**/5 跳过（64 文件）· ui **1003**（127）· cli **506**（34）· web **2899**/2 跳过（236）· server **182 文件 / 2625 通过 / 4 跳过** · hmr 无用例文件（`vitest run --passWithNoTests`），**0 失败**、整条 `EXIT=0`；取证脚本 import 的是源码（`state/model-catalog.ts`、`defaultProjectConfig()`、server 的 `requestCostUsd`），输出见「第十四轮」一节；本轮无界面改动，没起服务、没动端口 | `eeada99c` |
| 2026-10-07 | 3.3 | **用量与成本页判定上游已覆盖**（`FORK.md` 第 3 条的判据是「接回 **或判定上游已覆盖、直接删**」）：旧 Adelie 那套（`GET /api/usage` + 成本中心：三卡 + 按模型/按会话两张表 + 一天折线 + 每轮金额）在基座里是**一整套** —— 成本中心 `/api/projects/:p/usage`（四个维度、粒度到分/时/周/月、分页错误表与 owner 清空、模型终身用量）、会话头部的实时与累计成本、上下文环、公司模式的工单/预算财务页；**「只落 token、成本查询时现算」这条原则两家一致**（基座的 `usage_records` 同样不落成本，`server/test/usage.test.ts:76` 的用例名就是 "only Tokens persisted, never cost"）。四处有意保留的差异（成本中心里的按会话明细被图取代、未计价只有布尔 `hasUncosted`、旧的是身份级而基座是项目级、没有 `sessionsScanned` / `unreadableSessions` 这两个扫盘字段）与理由写进条目。**本轮没有改代码**，2.2c 因剩下的活全在桌面壳 / 部署一侧而照例跳过 | 六包 typecheck 全过；测试 core **1359**/5 跳过（64 文件）· ui **1003**（127）· cli **506**（34）· web **2899**/2 跳过（236）· server **182 文件 / 2625 通过 / 4 跳过** · hmr 无测试文件（退出 0），**0 失败**、整条命令 `EXIT=0`；真浏览器看了一次这一页 —— 画廊开发服务器（7381，我自己起的、看完已停）+ Playwright 打开 `app.html?route=/usage&lang=zh`：三卡 + 四张图 + 异常面板 + 三段筛选都在、**console 0 error**，截图 `usage-page.png` 在会话 scratchpad | `d7f2d1ac` |
| 2026-10-07 | 用户点单 | **左下角账户菜单新增「用户反馈」入口**：一行 + 一个两栏对话框（标题必填 ≤200、详细说明 ≤20000），提交由服务端带口令转进 3003 需求箱的 `POST /api/requirements`；新增 `GET\|POST /api/feedback` 路由与 `ADELIE_FEEDBACK_URL` / `ADELIE_FEEDBACK_KEY` 两个变量，浏览器永远拿不到地址与口令；未配置后端时那一行整条不画；画廊 mock 与中英 changelog 跟上；server 11 条 + web 8 条新用例 | 四道门禁全绿（`pnpm -r test` **8961 通过 / 16 跳过 / 0 失败**）；CI run `37622306652` **22 作业全绿**；现网 7364 源码构建 → 离线 bundle → `install.sh` 原地更新，重启后 `GET /api/feedback` 回 `{ok:true,configured:true}`，一次真实提交走完全程（需求箱 `req-17`，随即归档、在办仍是 2 条），console/日志无 warning | `4e79c473` |
| 2026-10-07 | 3.4 | **用户与两档角色、会话归属判定上游已覆盖**（`FORK.md` 第 3 条的判据是「接回 **或判定上游已经覆盖、直接删**」）：账号（`users` + 管理员用户后端 + 无自助注册）、两档角色（`is_admin`，用户管理页与账户栏都有徽标、每一片管理员面都按它拦 403 `admin_required`）、会话归属（`projects.owner_user_id` + `project_members`，归属轴线是 Project 不是人；看不见的一律 404 而不是 403）逐条对着基座核过；**有意保留的五处差异**（只有一个管理员、角色不可改；没有「回环免凭证即管理员」那条公理，改成本机 API token + 认领链接；没有 `scope=all` 全站会话面；工作区改由每会话自选；口令下限 8 位 + 语义 id 不可改）与理由写进条目。**本轮没有改代码** | 六包 `typecheck` 全过（`ifaces.json unchanged`）· core **1359**/5 跳过 · ui **1003** · server **2636**/4 跳过（183 文件）· cli **506** · web **2907**/2 跳过 · hmr 无测试文件，**0 失败** · 服务端按当前源码重建后在 7411 用一次性数据根起真服务，`verify-34.sh` 21 条真请求逐条核对（含改角色 404、管理员跨项目 404、成员加/移即生效、403/409 各码） · 真浏览器看用户管理页：两行角色徽标、**没有任何改角色的控件**、普通用户看不到这一节，console 0 error | `7d4bc33f` |
| 2026-10-08 | 5.4（第一块） | **建沙箱前先建 Session scratchpad**（上游 `cba091e3` 移植）：`workspace-write` 下服务端在每次受约束的 spawn 之前 `mkdir -p` 那个目录、建不出来就 fail-closed 拒掉这条命令（点名 scratchpad 与底层 errno）；可写根的绑定收在 `workspace-write` 之内（三个原生后端本来就只在那一档用它）；`SandboxPolicy.writableRoots` 的契约文档跟上；server 3 条 + bwrap 插件 1 条新用例；中英 changelog 一对。**为什么是这一块**：五条上游提交里只有它是一条独立的真 bug、不依赖其余四条 | 六包 `typecheck` 全过 · `pnpm lint` 0 警告、`pnpm format:check` 干净 · core **1359**/5 跳过 · cli **506** · ui **1003** · server **2639**/4 跳过（183 文件）· web **2907**/2 跳过，**0 失败** · bwrap 的 live 套件**真跑**（插件自带 `vendor/`，本机无系统 bwrap 也照跑）：7/7 含新用例 · **反证**：只回退 `service.ts` 再跑，新用例红在 `bwrap: Can't find source path …session-1: No such file or directory`，恢复即绿 · 服务端按源码重建后在 7481 起真服务（`ADELIE_HOME=/root/adelie-fork-data`）：日志三行对新根、`GET /` 200 且 `<title>Adelie</title>`，随后停掉 | `8b257785` |
| 2026-10-08 | 5.5 | **长会话与 Trace 的加载性能**（上游 `b8862716` `#958` 移植）：服务端新增按 Trace 文件的行索引（`trace-line-index.ts`，事件分页不再整文件解析）与图片按引用服务（`trace-images.ts` + `GET /api/sessions/:id/trace-image`），分窗历史页另加 4 MiB 字节预算收口；web 的 Trace 文件视图改成按轮次读取（新 `trace-rounds.ts`，删掉被取代的 `trace-events-loader.ts` 及其用例），上下文环改读分析新增的 `modelContextWindow`；ui 的消息 / 工具卡片缩略图加 `lazy`；中英 changelog 一对。**为什么是这一条**：5.4 剩下四块本轮实测各自压在上游前置上（见该条目），故按台账顺序往下做 | 六包 `typecheck` 全过（187 接口 / 537 类型）· `pnpm lint` 0 警告 0 错误（2064 文件）· `pnpm format:check` 干净 · 六包 test 全绿：core **1359**/5 跳过 · ui **1003** · server **2672**/4 跳过（185 文件，+33）· cli **506** · web **2938**/2 跳过（239 文件，+31）· hmr 无测试文件，`EXIT=0` · 解完冲突后与上游 `trace-file-view.tsx` 逐字比对只差三处 scope 名 · 真服务（7492、`/root/adelie-fork-data`）里用产品自己的导入接口装进一份合成 Trace，真浏览器打开 `/chat/<sid>`：三轮 + 时间线 + 全局统计都渲染，三张图全部由 `/trace-image?…` 以 **200** 下发且 `naturalWidth` 与生成图一致，**console 0 error** | `819c31c1` |
| 2026-10-08 | 5.6（服务端一半） | **用量成本「记账时就定价」**（上游 `feat/usage-cost-at-record-time` 移植，**只取服务端那一半**）：用量行在写入时定格成本（`usage_records.cost` / `cost_settled`，迁移 14）—— 取 Project 当时为该 provider/model 存下的价，含该行促销与那一刻的峰谷档位；查询侧（成本中心、对话框工具栏、`penguin cost`、公司模式预算、用户管理的累计开销）一律不再取价，只加总已记录的成本；Trace 页仍按「今天的价 × 每个请求自己的时间戳」推导（按小时记忆化），且没有价格的文件不再画成 0；兼容靠启动时一次性补算（`settleUnsettledCosts`，幂等，失败记错误表）。**core 那一半有意未搬**：逐行促销在 `web.db` 的 `model_promotions` 里，core 读不到，盖在事件上的费率会把促销行按原价计费（详见条目 5.6 与 changelog） | 六包 `typecheck` 全过（`gen:ifaces` 187 接口 / 535 类型）· `pnpm lint` 0 警告 0 错误（2064 文件）· `pnpm format:check` 干净 · 六包 test 全绿：core **1359**/5 跳过（65 文件）· ui **1003**（127）· cli **506**（34）· server **2682**/4 跳过（185 文件）· web **2942**/2 跳过（239）· hmr 无用例，**0 失败** · **端到端**（复制一份真 pre-cost 数据根，`user_version` 13、`usage_records` 无 cost 列）：起真服务后迁移到 **14**，启动补算把 5 条旧行逐条按自己时间戳定价（高峰 9.142825e-6 / 半价 4.571415e-6 / 无价 NULL，全 `cost_settled=1`，累计 2.742848e-5），成本中心页面上的数字与接口逐字一致、**console 0 error / 0 pageerror / 0 requestfailed** · **不重算的反证**：把磁盘上的价改成两倍再重启，5 条已结算行的成本一个都没动；再手插一条未结算行，重启后按**新价**补算成 1.828565e-5（正好 2 × 9.142825e-6） | `6c30e14a` |
| 2026-10-08 | 5.4（第三块） | **`sandbox-dsh` 在 Windows 上拒绝 bash、并点名它要哪个 shell**（上游 `c03e58c4` `#972` 移植，照改动落、不是合分支）：core 的 plugin 入口新增 `sessionShell` 导出；`loadDshAdaptor()` 在 Windows 上先取会话 shell（从**宿主**的 core，按命名空间读，宿主 core 没有这个导出就跳过检查），是 bash / sh / 其他 MSYS 运行时的程序就**加载即失败**，原因写明改法（`ADELIE_SHELL=pwsh`，没有 PowerShell 7 的机器用 `ADELIE_SHELL=powershell`，然后重启）——加载失败的后端本来就被报为「不可用」，封禁档位因此显示「不可用 + 改法」；`assertAclRunnerCanStart()` 在交给 runner 之前逐条拒绝 MSYS 运行时上的程序（POSIX shell 按名字、MSYS `usr\bin` 下任何程序），是会话 shell 时点 `ADELIE_SHELL`、不是时只说明 runner 起不了这类程序，原生程序放行；插件 README 加「Windows: run command sessions under PowerShell」一节与实测矩阵；中英 changelog 一对。**本地化**：scope `@prismshadow/` → `@lmliheng/`，文案里的 `PENGUIN_SHELL` → 本仓 2.2b 改名后的 `ADELIE_SHELL` | 插件 `typecheck` 过 · **插件测试 15 通过 / 1 跳过**（新 `windows-shells.test.ts` 11 条里 10 条在本机 Linux 上真跑、1 条是 Windows 专属的 `describe.skipIf` 整块；`live.test.ts` 5 条在改了加载路径之后照常真跑，即真实 DSH 链仍能加载与封禁）· 六包 `typecheck` 全过（`src/ifaces.json unchanged`）· `pnpm lint` **0 警告 0 错误**（2065 文件）· `pnpm format:check` 干净 · 六包 test 全绿：core **1359**/5 跳过 · ui **1003** · cli **506** · server **2682**/4 跳过 · web **2942**/2 跳过 · hmr 无用例，**0 失败** · **产物侧**：重建后的 `plugins/sandbox-dsh/dist/index.js` 里 `import(HOST_CORE)` 仍是运行时导入（decorators 已内联），把它拷进一个**无可解析 core** 的目录仍能链接、`hostSessionShell()` 返回 `null` · 取证脚本对产物逐例打印两种拒绝与加载拒绝（bash 在 Windows 上被拒、MSYS `usr\bin` 程序被拒、pwsh 与原生 `mingw64\bin\git.exe` 放行、Linux 上一个都不拦）· **仍未验**：真 Windows 主机上两种 PowerShell 在实 runner 下写工作区内 / 工作区外被拒 | `dcb77d05` |
| 2026-10-08 | 5.4（第二块） | **CI 真正跑沙盒插件的测试、跑不起来就红**（上游 `e3a9eb66` `#872` 移植，照改动落、不是合分支）：Linux 的 `rest` 分片从写死的包名（desktop / docs / ui-gallery）改成与 macOS / Windows 同形的「全仓减去 core / server / web / ui / cli」，build 名单也对齐成 `desktop...,cli...`，于是 `plugins/sandbox-{bwrap,dsh,seatbelt,wsl}` 四个包在 Linux CI 上第一次被跑到；矩阵新增 `must_run`（= `ADELIE_MUST_RUN`）并接到「Unit tests」步骤的环境：ubuntu 声明 `sandbox-bwrap,sandbox-dsh`、macOS 声明 `sandbox-seatbelt,sandbox-dsh`；新增 `scripts/must-run.mjs` + `.d.mts`（一个函数：被声明却开不了就抛错、错误里原样带探测理由；没声明照旧跳过），三个 live 套件的「能不能开」探测改成返回**理由字符串**而不是 `false` 并交给它裁决；Ubuntu 的 user namespace 开关作为作业前置步骤（`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`，只在 `rest` 分片、名字不提沙盒）；`sandbox-bwrap` 新增 `vitest.config.ts` + `test/global-setup.ts`，让 live 套件自己调 `vendorBwrap()` 铺好自带的 bubblewrap，`scripts/vendor-bwrap.mjs` 的「已就位」判据补上「每个架构的 `bin/bwrap` 存在且可执行」（附 `vendor-bwrap.d.mts`）；bwrap 的拒绝理由补上 Ubuntu 的开关（Debian 之外）。**本地化**：`PENGUIN_MUST_RUN` → 本仓 2.2b 口径的 `ADELIE_MUST_RUN`，包名 `@prismshadow/` → `@lmliheng/` | 插件 `typecheck` 过（4 个沙盒包）· 六包 `typecheck` 全过（`src/ifaces.json unchanged`）· `pnpm lint` **0 警告 0 错误**（2070 文件，+5）· `pnpm format:check` 干净（新文件也在内）· 六包 test 全绿：core **1359**/5 跳过 · ui **1003** · cli **506** · server **2682**/4 跳过 · web **2942**/2 跳过，**0 失败** · `ci.yml` 用仓库自带 `yaml` 解析通过（11 个 job，`rest` 的 `must_run` 与 userns 步骤逐字核对）· **正向**：`ADELIE_MUST_RUN=sandbox-bwrap,sandbox-dsh` 下 bwrap **25 通过**（live 7 条**真跑**、非跳过）、dsh **15 通过 / 1 跳过**（live 5 条真跑）、未声明的 seatbelt 照旧 `5 skipped`；按 CI 那条 `rest` 命令真跑一遍（本机略过桌面壳）：docs · hmr · ui-gallery · 四个沙盒包全部 `Done` · **反向**：`ADELIE_MUST_RUN=sandbox-seatbelt` 时红，栈指向 `mustRun` 与 `test/live.test.ts:35`，错误为 `ADELIE_MUST_RUN requires sandbox-seatbelt, and this host cannot open it: …`，`EXIT=1` · `mustRun` 语义逐例打印（名字两侧带空格仍命中、拼错的忽略、未声明返回 `false`、`null` 返回 `true`）· **vendorer**：把 `vendor/linux-x64/bin/bwrap` 移走 / 去掉可执行位后，下一次测试打印 `[vendor-bwrap] linux-x64: vendored` 并从缓存重新铺好（字节一致、无网络），再跑一次不再铺 · 真跑 loader 拿到 bwrap 的拒绝信息，两个发行版的开关都在；`platform: win32` 仍返回 `null` · 本轮没改界面，故未起服务、未开浏览器、未动端口 · **CI（推送后 `8f0e0d8f` 的 run `37768392859`，22 个 job 全绿）**：Ubuntu 的 `test (rest)` 里 userns 步骤回显 `… = 0`、环境为 `ADELIE_MUST_RUN: sandbox-bwrap,sandbox-dsh`，bwrap `✓ test/live.test.ts (7 tests)`（live 真跑）、dsh live 5 条真跑、未声明的 seatbelt 照旧 `5 skipped`，整个分片 docs 62 / desktop 286 / ui-gallery 131 / wsl 25 无一处 `FAIL`；macOS 的 `test-macos (rest)` 环境为 `ADELIE_MUST_RUN: sandbox-seatbelt,sandbox-dsh`，seatbelt live 5 条真跑、dsh live 5 条真跑、未声明的 bwrap `7 skipped` | `0f70719b` |

| 2026-10-08 | 5.3（落地顺序①） | **跨机那一批小修复里能上的一次上掉**（上游 `fix/machine-*` 分支，照改动落、不是合分支）：① `7e1dca63` —— 本服务器经 ssh 启动机器的服务端时用 `setsid`（宿主有才用）把它放进自己的会话，连接断掉不会再被 sshd 一起挂死（`nohup` 盖不住：服务端自己起的子进程会重置 SIGHUP），本地化 `PENGUIN_SETSID` → 本仓 2.2b 口径的 `ADELIE_SETSID`；② `a2801c8d` —— 「通往机器的这一跳在浏览器放弃之前作答」：SOCKS 握手期限 20s → 8s、应答之前被关掉的通道立即失败、转发的读 15s 收不到响应头就 `504 machine_not_answering`（写请求不截断），移植落点只有 `machines/proxy.ts` 与 `transport/socks.ts`（上游同时改到的中继层本树没有）；两条的中英 changelog 一对。**另外三条 `fix/machine-*` 逐条核过、一条都没上**：`fix/machine-events-redial-a-failed-dial` 与 `-attach-a-machine-connected-later` 要 `event-hub.ts` / `machine-sockets.ts`（本树没有，属上游未进 main 的那条事件流线）；`fix/machine-linked-stopped` 与 `fix/machine-adopted-table` 的内容本树早已有（由 `48662c0a`（#448）一并带上），落上去是空操作 | 六包 `typecheck` 全过（`src/ifaces.json unchanged`，187 接口 / 535 类型）· `pnpm lint` **0 警告 0 错误**（2073 文件）· `pnpm format:check` 干净 · 六包 test 全绿：core **1359**/5 跳过（64 文件）· ui **1007**（127）· server **2690**/4 跳过（185 文件，+8 恰是本轮新用例）· cli **506**（34）· web **2963**/2 跳过（241）· hmr 无测试文件，**0 失败** · 新用例逐条点名跑过：`startServerCommand` 两条（含 Linux 上**真起一个进程**、读 `/proc/<pid>/stat` 断言第 6 字段 = 它自己的 sid）、代理三条（504 / 写不截断 / 通道被关立即 502）、SOCKS 三条（关通道、期限、两个期限的大小关系）· 本轮没有界面改动，所以没起服务、没有动任何端口 | 见本行提交 |
| 2026-10-09 | 5.3（收尾） | **上游 `main` 上仅剩的那条跨机提交落地**（上游 `dd1b931f` `#973` 移植，照改动落、不是合分支）：`machines-transport-lane.test.ts` 不再在 Windows 上整文件跳过 —— 它此前只为「桩 `ssh` 是 shell 脚本、Windows 上 `execFile` 跑不了」而 `describe.skip`，而 lane 与平台无关，于是子进程改成 Node 自己（`process.execPath -e "setTimeout(…, 200)"`），建临时目录 / 改 `PATH` 的 `beforeEach` 一并删掉；两条计时断言从写死的 380ms 改成相对值（预热后量一次单跑 `alone`，串行 ≥ `alone+150`、并行 < `alone+180`），慢跑机的冷启动因此把两个界一起挪而不是撞红；`.github/workflows/ci.yml` 的 `test-windows` 注释写明剩下的守卫在 Windows 上**没测到什么**（session 的桩 `ssh` 也是 shell 脚本、真 Windows OpenSSH 客户端没量过；`terminal-stream` 只有真 pty、无头 ConPTY 丢控制台；dsh 的 live 套件见它自己的 `TODO(win32)`），`machines-transport-session.test.ts` 加一行指向它。**不带 changelog**（上游这笔自己写着不带：只有测试与 CI 注释、无用户可见行为） | 六包 `typecheck` 全过（`EXIT=0`，`ifaces.json unchanged` 187 接口 / 535 类型，六个 `Done`）· `pnpm lint` **0 警告 0 错误**（2073 文件）· `pnpm format:check` 干净 · 五包 test 逐包 `EXIT=0` 全绿：core **1359**/5 跳过（65 文件）· ui **1007**（127）· cli **506**（34）· web **2963**/2 跳过（241）· server **185 文件 / 2690 通过 / 4 跳过**，**0 失败**（数目与上一轮逐字一致）· 改到的两个文件点名跑：lane 2 条 + session 8 条 = **10 通过** · lane 文件**连跑 5 次全绿**（1.51–1.54s）· 临时探针 3 轮量出断言用的三个数：`alone` 233/236/238ms、`serial` 478/482/474ms（下限 383/386/388，余量 ~92ms）、`together` 242/239/240ms（上限 413/416/418，余量 ~175ms），跑完即删、`git status` 复核 · `ci.yml` 用仓库自带 `yaml` 解析通过（11 个 job，`test-windows` 五片不变）· **CI 复核（推送后 run `37830376191`，`ce30bc1c`）：22 个作业全绿**，`test-windows (server-2)` 的日志里是 `✓ test/machines-transport-lane.test.ts (2 tests)` —— **这个文件在 Windows 上真跑了**（改之前是 `↓ 2 skipped`），`test-windows (server-1)` 的 `↓ machines-transport-session (8 tests | 8 skipped)` 与新写的注释逐字对得上 · 本轮无界面改动，未起服务、未动端口 | `d5ee09f4` |
| 2026-10-09 | 5.4（Windows 取证） | **DSH 的 live 套件在 Windows 上真跑**（上游 `82498039` `#974` 移植，照改动落、不是合分支）：`plugins/sandbox-dsh/test/live.test.ts` 不再在 Windows 上整文件跳过 —— 探针按会话 shell 分成 pwsh / POSIX 两套（`Set-Content` / `Get-Content`、`$ErrorActionPreference = 'Stop'` 加外层 catch），`ADELIE_SHELL=pwsh` 在 adaptor 加载之前设好（core 每进程只解析一次会话 shell），Windows 上先探一次 pwsh、没有就把「会话 shell 不是 PowerShell 7」当开不了的理由交给 `mustRun()`，可用性探针从裸 `true` 改成 `process.execPath`，`DENIED` 补上 .NET 的 `access to the path … is denied`；背景子进程那条断言补上「工作区内的标记文件确实写了」这半边（此前一个从未跑起来的子进程也能蒙混）；`ci.yml` 的 Windows `rest` 分片声明 `must_run: sandbox-dsh`、并把 `ADELIE_MUST_RUN` 接到那一步的环境。**不带 changelog**（上游这笔自己也没带：只有测试与 CI、无用户可见行为，与 `dd1b931f` 同一口径）。**本地化**：`PENGUIN_SHELL` → 本仓 2.2b 口径的 `ADELIE_SHELL`、`PENGUIN_MUST_RUN` → `ADELIE_MUST_RUN`、包名 `@prismshadow/` → `@lmliheng/`、临时目录前缀 `penguin-dsh-live-` → `adelie-dsh-live-` | 插件 `typecheck` 过 · `ADELIE_MUST_RUN=sandbox-dsh` 下插件 **15 通过 / 1 跳过**（`live.test.ts` 5 条在本机真跑、含新加的工作区内标记断言；`windows-shells.test.ts` 10 真跑 + 1 条 Windows 专属跳过）· 六包 `typecheck` 全过（`ifaces.json unchanged`，187 接口 / 535 类型）· `pnpm lint` **0 警告 0 错误**（2073 文件）· `pnpm format:check` 干净 · 五包 test 逐包 `EXIT=0`：core **1359**/5 跳过（65 文件）· ui **1007**（127）· cli **506**（34）· web **2963**/2 跳过（241）· server **185 文件 / 2690 通过 / 4 跳过**，**0 失败**（与上一轮逐字一致）· `ci.yml` 用仓库自带 `yaml` 解析通过（11 个 job，只有 windows 的 `rest` 带 `must_run: sandbox-dsh`，ubuntu 与 macOS 那两处原样）· 本轮无界面改动，未起服务、未动端口 · **CI 两跑各 22 个作业全绿**（`37857700478` / `37858509262`）：Windows `rest` 的日志里 `plugins/sandbox-dsh ✓ test/live.test.ts (5 tests) 5115ms / 5037ms` —— 这条 live 套件**在 Windows 上真跑**（此前是整文件跳过）、五条用例逐条点名，没声明的 bwrap `7 skipped` / seatbelt `5 skipped` 照旧；第一跑里 `windows-shells.test.ts` 的 `powershell runs confined` 在**第一次**尝试被 vitest 的 5s 默认切掉（重试救回，作业仍绿），故顺手修掉（`72a2e112`：`it.each` 带上 60s 与 spawn 的期限对齐），第二跑同一格首次尝试就过（2828ms） | `b7933f58` `72a2e112` |
| 2026-10-09 | 5.4（Ubuntu userns 那一步） | **Ubuntu 23.10+ 上「怎么让默认 Ubuntu 也能跑 bwrap」这一步成文**（上游 `45885985` `#977` 移植，照改动落、不是合分支；就排在第十八轮已落的 `cba091e3` `#976` 之后）：CLI 快速开始（中英双份）新增 **Ubuntu 上的沙盒** 一节 —— 一份要 root 的 AppArmor profile（`/etc/apparmor.d/adelie-sandbox-bwrap`，路径模式 `@{HOME}/.adelie/**/plugins/node_modules/@lmliheng/penguin-plugin-sandbox-bwrap/vendor/linux-*/bin/bwrap` 覆盖随包带 / 下载到数据根 / 热推送三处）、两种替代做法（换 root 拥有的 bwrap，或全机调低开关）与数据根不在 `~/.adelie` 时的做法；`plugins/sandbox-bwrap/src/index.ts` 的拒绝理由在 Debian 的开关旁点名 Ubuntu 的开关并指向这一节（注释补写「为什么这一处要给指针」）；插件 README 写明要求；`profile.test.ts` 两条用例（两个开关都点名 / 指针）—— 第二条是本轮新行为，**缺了指针的实现在它上面会红**（实测）。**本地化**：包名 `@penguinharness/sandbox-bwrap` → `@lmliheng/penguin-plugin-sandbox-bwrap`、路径 `~/.penguin` → `~/.adelie`、`PENGUIN_HOME` → `ADELIE_HOME`（旧名仍读）、profile 名 `penguin-sandbox-bwrap` → `adelie-sandbox-bwrap`；**并去掉上游那句「桌面 `.deb` 会装这份 profile」**（本树 `packages/desktop/build/linux/after-install.tpl` 要复制的 `resources/apparmor-profile` 全仓没人产出，见本节末） | 插件 `typecheck` 过 · `pnpm --filter …sandbox-bwrap test` **27 通过**（profile 20 + live 7，`EXIT=0`）· 反向取证：把新加的指针从源码里去掉，`-t` 点名跑那条新用例 **1 失败**（19 跳过），恢复后 27 全绿 · 六包 `typecheck` **`EXIT=0`**（六个 `Done`，`ifaces.json unchanged` 187 接口 / 535 类型）· `pnpm lint` **0 警告 0 错误**（2073 文件）· `pnpm format:check` 干净 · 五包 test 逐包 `EXIT=0`：core **1359**/5 跳过（65 文件）· ui **1007**（127）· cli **506**（34）· web **2963**/2 跳过（241）· server **185 文件 / 2690 通过 / 4 跳过** —— **0 失败**；另跑 `@lmliheng/penguin-docs` **62 通过**（8 文件，本轮改到它的内容）· 文档站本机 `vite`（7471，临时起、看完即关）真开浏览器：中英两版标题分别是 `ubuntu-上的沙盒` / `sandbox-on-ubuntu`（与仓库自己的 `slugifyHeading` 算出来的一致）、节内链接 `/settings#沙盒`、`/settings#sandbox` 指向设置页既有标题、**代码块整段完整**、console 无 error、无 4xx，截图见 scratchpad | `493b9160` |
| 2026-10-09 | 5.4（`#975` 的前置） | **停靠面可以拉到最大，每个停靠面板都是一条注册表定义**（上游 `1eb13325` `#961` 移植，照改动落、不是合分支；24 文件 / +2125 −554）：右侧与底部停靠栏都能经头部的**全屏**按钮、或把边界拖过最大值进入全屏 —— 停在对话工具栏之下，右侧停靠栏盖住自己那一行（开着的底部停靠栏仍显示在它下方），底部停靠栏长到工具栏之下；退出用同一枚按钮（原位变**退出全屏**）或把边界拖回。进出随主题的布局动效（`[data-layout-motion]` 因此也涵盖 `top`/`left`），减弱动效时即时；面板从第一帧起按终点尺寸排版，页面不重新排版、面板不重新挂载，退出后滚动位置 / 文件预览 / 编辑器草稿 / 终端画面原样还在。全屏**不记住**：切换对话、隐藏停靠栏、关掉最后一个标签、被它盖住的停靠栏要显示内容时都会结束；底部停靠栏原先仅触屏可用的「放大到整屏」按钮由它取代。**面板改成注册表**：每种面板是 `features/dock/panel-registry.ts` 里的一条 `DockPanelDefinition`（id、名称、图标、排序、是否提供 + 它的变更订阅、主体组件），`PANEL_KINDS` 与各处 per-kind 分支消失，标签条 / **添加面板** / 空停靠栏的选单 / 快捷方式悬浮球都读它，主体经新的 `useDockPanel()` 取本停靠栏的能力；上一轮那两处内联视图（工作区文件、记忆）因此搬进新的 `builtin-dock-panels.tsx`（`chat-page.tsx` 里两个调用点与两条 import 一起删掉），另有新的 `chat-dock-context.tsx` 与 `panel-context.tsx`；ui 新增 `DOCK_FULLSCREEN_Z` 与 `data-fullscreen` 相位。**为什么是这一条**：它是 5.4 里 `9b170c61`（#975）与 `234183f5`（#978）的前置 —— 后两条要改的 `builtin-dock-panels.tsx` / `chat-dock-context.tsx` 由它引入，本树此前没有（第十九轮记过）；选它之前 `git apply -3 --check` 实测**一处错误都没有**。**本地化**：三处冲突（`browser-layer.tsx` / `panel-meta.tsx` / `chat-page.tsx`）都在 import 区 —— 包 scope 与本仓两处本地新增，逐条解；新文件里 4 处 `@prismshadow/` → `@lmliheng/`；changelog 按本仓惯例改名到本轮日期、去掉上游 PR 链接、写明移植出处 | 六包 `typecheck` 全过（`ifaces.json unchanged`，187 接口 / 535 类型）· `pnpm lint` **0 警告 0 错误**（2078 文件，+5）· `pnpm format:check` 干净 · 五包 test 逐包 `EXIT=0` 全绿：core **1359**/5 跳过（65 文件）· ui **1007**（127）· cli **506**（34）· web **2976**/2 跳过（**242** 文件，+13 条 = 新的 `panel-registry.test.ts` 与扩写的 `dock-state.test.ts`）· server **185 文件 / 2690 通过 / 4 跳过**，**0 失败**；另跑 `@lmliheng/penguin-docs` **62 通过**（8 文件，本轮改到它的内容）· **界面真跑**（重建 ui + web 后，一次性数据根 `/root/adelie-fork-data/r27-dock`、7494、真浏览器）：登录 + 建会话 → 点**右侧栏** → 停靠栏打开并列出注册表里的七个面板（智能体面板 / 终端 / 文件浏览 / 记忆 / 轨迹观测 / 远程控制 / 定时任务）→ 打开**文件浏览** → 点**全屏**：`[data-fullscreen]` 变 `full`、按钮变**退出全屏**、对话列被盖住而工具栏与左侧栏保留 → 点**退出全屏**：回到 `null`、布局复原 → 再开**下侧栏**同样列出选单；**console 0 error / 0 pageerror / 页面无一条 4xx**（仅三条 `net::ERR_ABORTED`，是关浏览器时中断的长连接），截图 6 张在 scratchpad · 本轮没动端口，3003 / 3004 / 4000 / 7364 / 7369 全程没碰 | `e7a0a5a7` |
| 2026-10-09 | 5.4（主块） | **权限菜单给出具名沙箱预设**（上游 `9b170c61` `#975` 移植，照改动落、不是合分支；67 文件 / +6107 −919）：权限按钮不再列三段十档，而是列具名预设（完全访问 / 每次询问 / 仅工作区可写 / 只读，管理员另有「更多…」）；沙盒卡片有**启用**开关与一张**预设表**（名称 / 文件 / 网络 / 询问模式 / 操作，行内可拖动排序、图钉决定是否进菜单、「…」菜单可设为默认 / 删除，「添加预设」新增行）。服务端：`PluginConfigField` 多 `table` 类型（固定行 + 类型化列、只存与默认不同的单元格、锁定单元格忽略、可声明 `rowChoice` / `pin` / `columnGroup` / `extensible`），字段多 `advanced` / `hint`，分组可声明布尔 `switch`；沙盒分组改成 `enabled` + `presets` + `defaultPreset`（六个内置预设），自己的 `mode` / `network` 去掉；新 `sandbox/settings-policy.ts`（新会话起点 + 旧文档向后兼容）与 `sandbox/settings-status.ts`（后端状态与「本系统默认该装哪个包」）；会话视图多 `presets` / `advanced` / `switchOn`。Web 的设置页插件配置面整片重写成表，UI 的 `Dropdown` / `Select` / `ConfirmModal` 跟上。**本树缺的三处前置**（typecheck 逼出来的）已补：`ICONS.star`、`S.settings.pluginAction{Title,Run,Confirm}` 中英各三条、以及上游那笔自带的「执行插件操作前先问一句」（补丁父提交里已有、补丁要改到那几行，故一并落下）。**本地化**：`@prismshadow/penguin-*` → `@lmliheng/penguin-*`；沙盒后端推荐包名 `@penguinharness/sandbox-*` → `@lmliheng/penguin-plugin-sandbox-*`（必须改，否则卡片会去装一个不存在的包）；四份上游 changelog 改名到本轮日期、去 PR 行、写明移植出处 | 六包 `typecheck` 全过（`ifaces.json` 187 接口 / 547 类型）· `pnpm lint` **0 警告 0 错误**（2101 文件）· `pnpm format:check` 干净（首跑一条，`prettier --write` 后复检通过）· 五包 test 逐包 `EXIT=0` 全绿：core **1359**/5 跳过（64 文件）· ui **1008**（127）· cli **506**（34）· web **3019**/2 跳过（**247** 文件，+43 = 这笔带来的六个新用例文件与扩写）· server **187 文件 / 2755 通过 / 4 跳过**（+65）—— **0 失败**；另跑 `@lmliheng/penguin-docs` **62 通过**（8 文件，本轮改到它的内容）· **界面真跑**（重建 core/server/web 产物 —— server 的 tsup 默认堆会 OOM，`NODE_OPTIONS=--max-old-space-size=4096` 单跑即过；一次性数据根 `/root/adelie-fork-data/r28-presets`、7496、真浏览器）：全新安装开关默认关，权限菜单只有四档审批方式 + 「更多…」→ 「更多…」按设计打开设置对话框的沙盒卡片（只有标题、一条「没有可用后端」提示与开关）→ 点开关弹出**安装后端**对话框，点名的包是 `@lmliheng/penguin-plugin-sandbox-bwrap`（本地化在界面上可见）→ 「暂不」后卡片展开预设表与「添加预设」「高级选项」→ **保存**后刷新重开菜单：变成 **完全访问 / 每次询问 / 仅工作区可写 / 只读**，后两者标「未安装」置灰（本机没有沙盒后端，是设计的诚实标注）→ **console 0 error / 0 pageerror / 无一条 4xx**（脚本打印 `[]`），截图 6 张在 scratchpad · 没用到的端口一律没碰，3003 / 3004 / 4000 / 7364 / 7369 全程没碰 · **CI 两跑**：`37922789257` 红在两个 macOS 作业的**服务端声明构建**（OOM，不是测试）—— 与上游同一提交的红点相同，已按仓库既有的 `run-with-env.mjs` 写法给 tsup 一个 4096MB 的默认堆（`a8347184`），详见本轮「CI」一节 | `2e9d53b6` `a8347184` |
| 2026-10-09 | 5.4（最后一块） | **Linux 沙盒在默认的 Ubuntu 上也能工作 —— 走 Landlock**（上游 `234183f5` `#978` 移植，照改动落、不是合分支；65 文件 / +1523 −258）：路由改成「**实现维度最多的后端负责**」（`SandboxService.pick()`，注册顺序只用于打破平局），bubblewrap 加载得到的地方每条策略仍由它负责、DSH 适配器只在它是仅剩的那一个时服务；新增 **`closed-temp`** 维度（bubblewrap / Seatbelt / WSL 声明，DSH 适配器不声明 —— 它每一级都会在仅工作区可写下放开一个临时目录），关闭「临时目录可写」的策略绝不路由给没有它的后端；core 插件契约多出（都可选）`SandboxProvider.mechanism`（谁在实施，如 `bubblewrap` / `Landlock`）、`SandboxProvider.limits`（本机留下的缺口，中英）与 `ConfinedSpawn.runnerLines`（后端自报的提示行从命令与钩子脚本 stderr 的开头去掉，如老 ABI 上的 `landlock-run: partial enforcement`）；DSH 适配器**在加载时选定并用 `mechanism` 报出它那一级**，两级都不通的主机因此带着 DSH 的原因加载失败，而不是挂上一个拒绝每条命令的后端；沙盒卡片的后端字段 `backend.recommended` 由**单个字符串改成列表**（Linux 两个包），打开开关时按顺序装整张列表，「Backends:」一行改成 `Enforced here: … / Not enforced here: …` 加一个折叠的 **More info**（列出在用后端的缺口、每个已安装但未启用的后端及其原因），没有能隔离网络的后端时「无网络」与「仅本机」一样置灰；四个沙盒插件包升 **0.2.3**（不升的话已装有 0.2.2 的机器会继续跑旧内容、拿不到 `closed-temp` 声明）；Web 那边为「旧服务端只报一个字符串」留了一条向后兼容（`recommendedOf`，带 `TODO(recommended-string-compat)`）。**本地化**：`@penguinharness/sandbox-*` → `@lmliheng/penguin-plugin-sandbox-*`（必须改，否则卡片会去装一个不存在的包）、`@prismshadow/penguin-*` → `@lmliheng/penguin-*`、`~/.penguin` → `~/.adelie`、`PENGUIN_HOME` → `ADELIE_HOME`（保留「旧名仍读」的说明）；四份上游 changelog 改名到本轮日期、去掉 PR 行、写明移植出处 | 六包 `typecheck` 全过（`ifaces.json` 187 接口 / 549 类型；core 要**先重建** server 才看得到新契约）· `pnpm lint` **0 警告 0 错误**（2108 文件）· `pnpm format:check` 干净 · 五包 test 逐包 `EXIT=0`：core **1368**/5 跳过（65 文件）· ui **1008**（127）· cli **506**（34）· web **3032**/2 跳过（**248** 文件）· server **189 文件 / 2766 通过 / 4 跳过** —— **0 失败**；另跑 `@lmliheng/penguin-docs` **62**、四个沙箱插件包（bwrap 29 · dsh 21+1 跳过 · seatbelt 17+5 跳过 · wsl 25）全绿 · **界面真跑**（重建 core/server/web 产物 + 一次性数据根 `/root/adelie-fork-data/r29-landlock`、7497、真浏览器）：全新安装点开沙盒卡片的开关后弹出的**安装提示点名两个包、顺序与列表一致**（`@lmliheng/penguin-plugin-sandbox-bwrap 和 @lmliheng/penguin-plugin-sandbox-dsh`，文案写明「两者都可用时，使用封禁范围更大的那个」），卡片与预设表排版正常，**console 0 error / 0 pageerror / 无一条 4xx**（脚本打印 `[]`）· **真跑一次 DSH 适配器的加载与约束**：本机（内核 6.1）加载成功、`mechanism` = `Landlock (partial)`，受限命令**在工作区内写成功、在工作区外（`$HOME`）被拒**（`Permission denied`，文件不存在）· 3003 / 3004 / 4000 / 7364 / 7369 与 `/root/penguin-harness` / `/root/Adelie` / `legacy/main` 全程没碰 | `ea92b3ec` |

> **2026-10-06 与另一条线的交汇（第六轮）**：本轮开工时 `git status --short` 是干净的；做完检查那一
> 步时工作区里多出**另一条线**的改动 —— 47 个 `package.json` 的 `version` 0.3.0 → 0.3.1、
> `packages/core/src/index.ts` 的 `VERSION`、以及未入库的 `RELEASE-v0.3.1.md`（都是 v0.3.1 的发布
> 准备）。本轮**一个都没碰**，`git add` 只列了自己的 22 个文件；那批改动仍在工作区里等它那条线自己
> 提交。

> **2026-10-06 与另一条线的交汇（第九轮）**：开工时 `git status --short` 干净、`main` = `2a8f56e7`
> （上一轮之后，另一条线提交了「插件市场给每个自带插件包一条条目」与「定时任务页加跨项目只读总览」
> 两条，都没动这份台账）。本轮进行中，那条线又在同一棵树里改了 `README.md` / `README.zh.md`（加分类
> 表与截图）、`packages/desktop/electron-builder.yml`，并留下未跟踪的 `assets/readme/*`、
> `packages/desktop/{build,scripts,test}` 与 `scripts/capture-readme-shots.mjs` —— 本轮**一个都没
> 碰**，`git add` 只列自己的 11 个文件。core 那条红正是那份**未提交**的 README 分类表引起的（句式
> 标题 vs core 的 Title Case 组标题），由它那条线自己收尾。
>
> 同一棵树上的另一条线在本次提交前后又推了两次：`ae653c26`（补全英文 README、对齐分类表 —— core
> 那条红随之消失）与 `ec49bddd`（Windows 安装器带上 Adelie 的侧栏与页眉图）。它自己那次推送的 CI
> run `37430793086` **在 `test-windows (rest)` 上红**（工作区里还留着一份未提交的 `installer-art`
> 测试，看着就是它在修），与本轮无关。

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

## 第九轮：写侧剩下的非桌面壳位置（2026-10-06，条目 2.2c 的写侧收尾·二）

第八轮把「写侧最后一个不在桌面壳一侧的写点」记在 `machines/commands.ts` 上，这一轮核对时发现
**那句话不成立**：仓库里还有一批非桌面壳的位置在写旧名。它们一直没暴露，因为读侧两个都认
（`ADELIE_*` 优先、旧 `PENGUIN_*` 兜底），跑起来一切正常 —— 也正因为如此，只有逐个 grep 才看得见。

### 改了哪 6 处（都只换变量名，取值一个没动）

| 位置 | 原来 | 现在 | 谁读它 |
| --- | --- | --- | --- |
| 根 `package.json` 的 `penguin` 脚本 | `PENGUIN_HOME=~/.penguin/dev-data-cli` + `PENGUIN_PROFILE=dev` | `ADELIE_HOME=…` + `ADELIE_PROFILE=dev` | core 的 `resolveRoot()` / `boundaryEnv()` |
| `packages/cli/package.json` 的 `penguin` 脚本 | 同上 | 同上 | 同上（这两条必须一致，测试钉着） |
| `packages/server/package.json` 的 `dev` 脚本 | `PENGUIN_HOME=~/.penguin/dev-data` + `PENGUIN_PROFILE=dev` | `ADELIE_HOME=…` + `ADELIE_PROFILE=dev` | 同上 |
| `packages/web/e2e/run.sh` 起服务那一行 | `PENGUIN_HOME` / `PENGUIN_WEB_DB` / `PENGUIN_WEB_DIST` | 三个都换 `ADELIE_*` | server 的 `config.ts`（边界变量） |
| `Dockerfile` 的 `ENV` 与冒烟那一行 | `PENGUIN_HOME` / `PENGUIN_WEB_DIST` | `ADELIE_HOME` / `ADELIE_WEB_DIST` | server / CLI |
| `install.ps1` 在缺垫片时**生成**的 `bin\penguin.cmd` | 只设 `PENGUIN_WEB_DIST` / `PENGUIN_BUNDLED_SHELL` | 设 `ADELIE_*`，旧名 `PENGUIN_WEB_DIST` 仍照办 | 装出来的那份 CLI |

`install.ps1` 那处值得多说一句：它和第七轮改过的 `scripts/launchers/penguin.cmd` 是**同一件东西**
（payload 里带的垫片，只在缺文件时重新生成），第七轮只改了前者，于是两者拼写分叉了；这一轮把生成的
那份也改成与 shipped 的逐行同一规则（新名在前、旧名兜底），不再有「装出来的启动器与包里的启动器
行为不同」这种状态。

### 没有动的（各有理由，不是漏）

- 根 `package.json` 的 `desktop` 脚本仍写 `PENGUIN_HOME=~/.penguin/dev-data`：它的读者是**桌面壳**
  （`app-identity.ts`、`main.ts` 直接读 `process.env.PENGUIN_HOME`），桌面壳的读侧**不在**
  `core/state/boundary-env.ts` 里 —— 改成新名会让开发壳落到默认根上去。这是 2.2c 桌面壳那一半的
  事，本机按纪律没碰。
- 那两个**路径**（`~/.penguin/dev-data`、`~/.penguin/dev-data-cli`）：变量名换了、值没换，因为
  `dev-data` 与桌面壳共用，两者必须一起搬（`packages/core/src/internal/ports.ts` 里写着）。
- `PENGUIN_INSTALL_DIR` / `PENGUIN_VERSION` / `PENGUIN_ARCHIVE` / `PENGUIN_DOWNLOAD_*` /
  `__PENGUIN_*__`：安装器与发布协议，属 4.x。
- `packages/docs/**`、`.agents/**`、`changelog/**`、`RELEASE-v0.2.0.md`：按 2.1c / 2.2c 的口径有意
  留着（内部参考 / 上游的开发技能 / 历史）。`packages/docs/content/configuration.md` 那张环境变量表
  因此仍写旧名，跟「数据根默认值」一起等发布期那一轮再动。

### 顺带改的四处「说明」

- `packages/cli/test/dev-entry-isolation.test.ts`：那条漂移守卫原本按 `PENGUIN_HOME` 取两个 dev
  入口的数据根，改成 `ADELIE_HOME`；**新增一条用例**把「两个 dev 入口写的是 Adelie 的拼写」钉死
  （旧名必须不出现），桌面壳那条仍按 `PENGUIN_HOME` 断言，文件头写明为什么它是例外。
- `scripts/run-with-env.mjs`：三处注释例子里的 `PENGUIN_HOME=/somewhere pnpm dev` → `ADELIE_HOME=…`。
- `.github/CONTRIBUTING{,.zh}.md`：教开发者的那几处（`pnpm penguin` / `pnpm dev` / 报缺陷时的空根
  检查）改用 `ADELIE_HOME`；**涉及桌面壳的两处保留 `PENGUIN_HOME`**，并各补一句「外壳读的是改名前的
  拼写」，免得下一个人顺手「修正」错地方。
- `packages/core/src/internal/ports.ts`：分配表补一句 —— 变的是**变量名**，那几条 `~/.penguin/*`
  是**路径**，仍等与桌面壳一起搬。

### 验证（都不是推测）

- 门禁：六个包 typecheck 过（core / server / web / ui / cli / hmr）；`pnpm lint` 0 警告；
  `pnpm format:check` 干净。
- 测试：cli **506**（505 + 新增那条守卫）· ui **1003** · server **2606 / 2 跳过**（首跑 1 条红是
  `dist/install.ps1` 副本过期 —— 老坑，重建 core + server 后转绿）· web **2888 / 2 跳过** · core
  **1359 / 5 跳过**。
  core 首跑是 **1358 通过 / 1 失败**，那条红**不是本轮的**：另一条线当时在工作区里改 `README.md`
  （加了一张 Category 表，写的是 `AI app development` 这种句式，而 core 的组标题是 `AI App
  Development`），`plugins.test.ts` 的 README 表守卫因此报不一致 —— 本轮一个字节都没碰那两个文件。
  **那条线随后提交了 `ae653c26`（补全英文 README 并对齐分类表），复跑 core 已是 64 文件 / 1359 通过
  / 5 跳过 / 0 失败**。
- **默认值真解析一遍**：把脚本行里的 `VAR=value` 原样抽出来交给 `run-with-env.mjs`，命令换成一个打印
  `resolveRoot()` / `boundaryEnv("profile")` 的桩，三个入口各跑两次（新拼写 / 旧拼写）：新拼写下
  `dev:server` → `/root/.penguin/dev-data`、两个 `penguin` → `/root/.penguin/dev-data-cli`，profile
  都是 `dev`，**与旧拼写逐字相同**。
- **真跑开发入口**：`pnpm penguin version`（用它自己的默认值）→ `v0.3.2-8-g2a8f56e7-dirty`，
  且 `~/.penguin/dev-data-cli` 没有被建出来（`version` 不碰数据根）。
- **按那一行的变量名真起一次服务**：从 `packages/web/e2e/run.sh` 里**取出**它写的那几个变量名
  （`ADELIE_HOME` / `ADELIE_WEB_DB` / `ADELIE_WEB_DIST` / `ADELIE_SEED_ADMIN_PASSWORD`），用它们起
  `packages/server/dist/index.js`（数据根 `/root/adelie-fork-data/r9-namecheck`，端口 7477/7478）：
  服务端自报 `Data root:` / `SQLite:` / `Web dist:` 三行都对，根目录里落下 `web.db` / `api-token` /
  `server.lock`，`GET /` 302 → 200 且标题 `<title>Adelie</title>`、`/api/me` 401（未登录，预期）；
  两个临时端口用完都已释放。
- **真跑端到端（这条不是绿的，照实说）**：`SKIP_BUILD=1 bash packages/web/e2e/run.sh` 跑了 14.2 分钟，
  **42 passed / 27 failed**。失败全是 UI 选择器级的（`getByPlaceholder(/输入消息/) resolved to 2
  elements`、`toBeVisible` 找不到元素），**与本轮改的那行环境变量无关**：`packages/web/dist` 是今天
  05:00 的产物，而 13:35（`faeec636`）与 14:08（`2a8f56e7`）两条提交都改了 `packages/web/src`
  —— 拿旧前端产物跑 Playwright 必然错位。服务端一侧从头到尾是好的：服务在 8930 起得来、mock 在 8931，
  全程几千条 200（日志在会话 scratchpad 的 `e2e.log`）。**没顺手重建 web 产物再跑一遍**：那既不是本条
  改动（改的只是变量名，解析结果逐字未变），又要在这棵正被另一条线使用的树里动 `packages/web/dist`，
  而磁盘只剩 ~0.9G。
- `sh scripts/test-installer.sh` 通过（含它对两个启动器脚本的守卫）。
- **推送**：`git push origin main` = `ec49bddd..079cf1b4`（这一轮压在另一条线当天的两条提交上，
  `a0e3d995` 之后是 `ae653c26` 与 `ec49bddd`），随后又推了两次（`584e880c`、`8a7ac8bc`，都只动
  `FORK-PROGRESS.md`）。
- **CI**：前三次推送触发的 run（`37431844540` / `37432086283` / `37432239857`）**都被后一次推送
  取消**了（`ci.yml` 的 `cancel-in-progress`，那几条流水线是另一条线在连续推送）。收尾时跑完的是
  **`37432299704`**（`ed5b6ecd`「fix(desktop): 安装器配图测试比路径时统一成 POSIX 形式」，是另一条线
  压在本轮之上的提交；`8a7ac8bc` 是它的祖先，所以这一轮改的东西都在这棵树里）：**22 个作业全绿**，
  含 `installer-windows` —— 本机没有 pwsh，`install.ps1` 那个垫片只有它能在真 Windows 上验一遍，
  这一条到此有结论了。

### 还差什么（2.2c 仍未勾掉）

- 写侧的桌面壳一侧：`packages/desktop/src/{server-process,launcher,web-dist}.ts` 与其自己的开关
  （`DESKTOP_SMOKE*` / `NO_LOGIN_SHELL_ENV` / `UPDATE_FEED_URL` / `BB_SMOKE_BUNDLE`），按纪律本机没碰，
  等 3.5 决定桌面壳取哪个时一起改。**注意**：在这一步之前，`desktop` 脚本与桌面壳的读侧必须继续写
  / 读旧名，不然开发壳的根会落到默认值。
- 既有部署 `adelie-app.service`（3004，已 stop + disable）仍设旧名：读侧两条都认，改它属发布动作。


## 需求箱页头挂上「最新版本」角标（2026-10-06，用户点单）

### 用户说的

「我希望你在需求箱那一页加上最新版本号」—— 承接上一轮「笔记本上检查更新为什么一会儿 0.3.0 一会儿
0.3.2」：他要的是打开那一页就能看见当前最新发的是哪个版本。

### 做了什么（提交 `0388c67f`）

- `requirements.html` 的页头，在「Adelie 每 N 小时来看一次」后面加一个 chip：**最新版本 v0.3.2**。
  数据取自**同源**的 `/downloads/index.json`（发布那一轮写的清单）第一项的 `tag`，`cache: "no-store"`，
  页面加载与按 ⟳ 时各读一次 —— 不在页面里写死版本号，那正是上一轮踩到的「页面挂着一个旧号」。
- **读不到就整块隐藏**：插件带的那个独立服务器旁边没有这份清单，宁可什么都不显示，也不显示一个猜的号。
- 同一份改动落进插件副本 `plugins/requirements-box/skills/requirements-box/kit/requirements.html`
  （生成方式仍是「改线上那份 → prettier + 仓库配置 → 写插件那份」，两边只差格式）；`plugin.json`
  日期版本 `2026.10.06.1` → `2026.10.06.2`（改了安装时落地的内容，按仓库规矩要升）。npm 包版本不动，
  跟着下一次发版走。
- **顺手补上根因**：`/root/evolution/REQUIREMENTS.md` 的「1.4 上线」原本只说同步 OSS 镜像，没说更新
  下载站 —— 今天 v0.3.2 就是这么漏掉的（06:01 发版，13:13 才发现清单还写着 v0.3.1）。现在多了一条：
  发版后把 `/opt/adelie-design/downloads/index.json` 与页头那个 `chip blue` 一起更新，因为这个角标
  读的就是那份清单。

### 验证

- 真浏览器（3003，带口令）打开那一页：页头 = `A | 需求箱 | Adelie 每 1.5 小时来看一次 | 最新版本 v0.3.2 | ◐ | ⟳`，
  无 console 报错。
- 插件装的独立服务器（3401，临时、已停）打开：`#latest-version` 不可见、无 console 报错 —— 降级路径对。
- 干净工作树 `/tmp/plugin-rel`（detached `0388c67f`）：`plugins.test.ts` 21 过、docs
  `skills-sync.test.ts` 3 过、`pnpm lint` 0 警告、`pnpm format:check` 干净。

### 顺带记一笔（不是这一轮的改动）

同一时间线上，巡台某个会话在 13:24 给 `/opt/adelie-design/requirements.mjs` 加了一道「开手动会话前先
问平台还有没有会话在跑」的守卫（用户口径 A）并重启了服务。**线上那份 mjs 因此跑在插件副本前面**，
下一次同步插件时要把它带过去。

## 端口换成 Adelie 自己的：服务端 4000、dev CLI 7370（2026-10-06，条目 2.3，第十轮）

一次无人值守的自主推进，只做这一条：把「人会见到的」两个默认端口从上游 PenguinHarness 的号换成
Adelie 自己的历史号。没有切版本号、没发 npm、没发安装包、没发发布汇总。

### 口径（为什么要动，以及为什么是这两个号）

上游 PenguinHarness 的服务端默认 7364、dev CLI 7369，Adelie 是整棵 fork，于是同一台机器上两个产品
默认抢同一个 socket —— 这正是条目里那句「避免两个产品抢端口」。旧 Adelie 用的是另外两个号，而且都是
「人会见到的」：

| 东西 | 旧 Adelie 的号 | 新 Adelie 以前 | 现在 |
| --- | --- | --- | --- |
| 服务端 / Web UI（`penguin server`、不带 PORT 的 `penguin web`） | 4000（`adelie-web.service` 一直在服务的地址；本机 ufw 与 egress-whitelist 里也写作「Adelie Web (4000)」） | 7364（= 上游的号） | **4000** |
| dev CLI（`pnpm penguin web`，数据根 `~/.penguin/dev-data-cli`） | 7370（`adelie serve` 的缺省值，它的设计站上写着的就是这个号） | 7369（= 上游的号） | **7370** |

7370 同时是上游 dev 带里唯一的空位（上游用 7365 / 7368 / 7369 / 7371 / 7372），所以一个开发者同时开
Adelie 与 PenguinHarness 两棵树也不会撞。条目名字里的「profile 默认值」这一轮**没有需要改的**：
`ADELIE_PROFILE` 的缺省与 `resolveRoot()` 的取值在 2.2a / 2.2c 里已经定过，这一条只动端口。

### 改了哪些地方

- **唯一真源**：`packages/core/src/internal/ports.ts` —— `DEFAULT_SERVER_PORT` 7364 → 4000；端口表两行
  （7364 → 4000、7369 → 7370）与表下说明追加一段「为什么是这两个号」。`DEFAULT_DEV_SERVER_PORT` 的
  注释原本拿「设计站的读数页占着 7370」解释为什么不用 7370，现在改成「7370 归 dev CLI」—— 那条旧理由
  已经不存在（`/opt/adelie-design` 下没有 `site/` 了），dev CLI 是新的理由。
- **跟着念出这个号的地方**：CLI 帮助文案 zh/en（`cli/src/i18n.ts`）、`cli/src/commands/serve.ts` 的两处
  注释、`cli` / `server` / `web` 三份 README、两份 CONTRIBUTING、`install.sh` 与 `install.ps1` 的
  「Get started」提示、`Dockerfile` 的 `PORT` / `EXPOSE` 与顶部注释、`docker/compose.yaml` 的端口映射、
  `.github/workflows/docker.yml` 冒烟那几行 `curl` 与 `-p`。
- **dev CLI 的两个脚本**（根 `package.json` 与 `packages/cli/package.json`）`PORT=7369` → `7370`；
  取值（数据根等）一个没动。
- **测试**：`cli/test/serve.test.ts` 的默认端口断言、`server/test/machines.test.ts` 里
  `RELEASE.defaultPort` 的断言；`core/test/state.test.ts` 那条「system prompt 里不许出现服务端口」的守卫
  **改成跟 `DEFAULT_SERVER_PORT` 常量走** —— 写死数字的守卫下次改号就会守着一个过时值。

### 没动的（各有理由）

- `packages/server/test/helpers.ts` 与一批机器 / 预览用例里的 `7364`：它们是**夹具值**（「某台机器上
  服务端的端口」这类示例数据），不是默认值，改它们只是噪音。
- `packages/docs/content/*`（`configuration.*.md` 的环境表、`quickstart-cli` 的 7364、`cli.*.md` 的
  `--port` 缺省）：按 2.5 / 2.2c 的口径，`packages/docs/` 留作内部参考，与「数据根默认值」一起等发布期
  那一轮再动。
- `packages/desktop/**`：桌面壳不引用这个常量（它按 `PORT=0` 让系统分配，再加每个实例的粘性偏好），
  本机按纪律没碰。
- 本机部署 `adelie-server.service`（7364，已 enable）**显式**写着 `PORT=7364`，不受这次改动影响；
  哪天要让它走新缺省，那是改单元的事，属发布动作。

### 验证（都不是推测）

- **静态**：六个包 typecheck 过；`pnpm lint` 0 警告 0 错误（2052 文件）；`pnpm format:check` 干净。
- **测试**：重建 core + server 的 dist（server 的测试从 core 的 dist 读模型目录，也读 `dist/install.sh`
  副本）之后 —— core **1359** / 5 跳过 · cli **506** · server **2606** / 2 跳过 · web **2896** / 2 跳过 ·
  ui **1003**，**0 失败**。
- **把号本身真读一遍**：`node` 直接 import core 的 dist → `DEFAULT_SERVER_PORT= 4000`；
  `pnpm penguin web --help` → `--port <port>  Listen port (falls back to the PORT env var, default 4000)`，
  而同一行的 run-with-env 默认值就是 `PORT=7370`；`resolvePort(undefined, undefined) → 4000`；
  server 的缺省来自 `env.PORT || DEFAULT_SERVER_PORT`（`server/src/config.ts`）。
- **真起服务**：`ADELIE_HOME=/root/adelie-fork-data/r10-portcheck PORT=7477 node dist/index.js` ——
  日志三行（数据根 / SQLite / Web dist）都指向新根，`GET /` 302 → 登录页，`/api/me` 401（预期）；
  Playwright 打开：标题 `Adelie`、阿德利企鹅标志与登录表单都在，**console 唯一 error 是登录前的
  `/api/me` 401**，没有别的报错、没有失败的请求。临时数据根用完已清，端口已释放。
- **4000 本身没有被绑定**：它在「不许动」的名单里，所以默认值只由常量、CLI 帮助与单测三处验证 ——
  `ss` 全程确认 4000 上没有监听。
- `sh scripts/test-installer.sh` 通过；`docker.yml` 与 `docker/compose.yaml` 用仓库自带的 `yaml`
  解析通过，`docker.yml` 的触发面仍是 `workflow_call` / `workflow_dispatch` / `pull_request`
  （没有 main 推送，本次推送不会跑它）。

### 收尾：推送与汇报

- **推送**：`git push origin main` = `94854c1b..0c1cc664`（这一轮只有一个提交 `0c1cc664`，代码与台账同一笔）。
  按纪律没有切版本号、没发 npm、没发安装包、没发发布汇总邮件。
- **汇报邮件没发出去（第十轮同一处卡点）**：vault 里的 `CSU_MAIL_AUTHCODE` 仍被邮箱拒 ——
  `mail.py check` 报 IMAP `LOGIN Login error or password error`（`CSU_MAIL_ADDR` / `CSU_MAIL_AUTHCODE` 两个变量
  都注入到了本会话，长度也对，所以不是「写错项目」那条坑）。按纪律只试了这一次、没有继续重试登录。
  修法（只能由用户做）：网页邮箱「设置 → 个人信息 → 邮箱密码 → 客户端专用密码」重建一个，再
  `penguin config vault set --project-id sjaaj --agent-id default_agent --key CSU_MAIL_AUTHCODE`，
  **下一次新对话**才会注入。这一轮的结论因此只落在本台账里。

### 顺带看到的（不是这一轮的改动）

`packages/web/README.md` 的「Production」一节仍写着 `PENGUIN_WEB_DIST` —— 2.2c 的读侧改名只把 server
README 的环境表跟上了。这一轮没碰它，它属 2.2c 的文档尾巴。

### 收尾：CI 与汇报

- **推送**：`git push origin main` = `575106bc..e9e585a2`（`3835c0e8` 是本轮的代码提交，`e9e585a2`
  是台账那一笔）。CI 为 `e9e585a2` 起的 run **`37455104295`**：首跑 `test-macos (server)` 红在
  `workflows.test.ts > notices an Agent's FIRST workflow`（它给工作流构建留 10 秒，macOS runner 慢，
  状态文件还没落盘 → `{}`；与端口无关，Linux 那次同文件全绿），`ci` 这个聚合 job 随之标红。
  用 `rerun-failed-jobs` 重跑那两个 job 后**22 个作业全绿**（`not success: []`）。
- **汇报邮件没发出去（卡住的地方）**：vault 里的 `CSU_MAIL_AUTHCODE` 被邮箱拒了 ——
  `mail.py check` 报 IMAP `LOGIN Login error or password error`，`mail.py send` 报 SMTP `535
  authentication failed`；两次之后按纪律停下，没有继续重试登录（账号与专用密码这一对已经失效或被
  撤销）。需要在网页邮箱「设置 → 个人信息 → 邮箱密码 → 客户端专用密码」里重建一个，再
  `penguin config vault set --project-id sjaaj --agent-id default_agent --key CSU_MAIL_AUTHCODE`。
  这一轮的结论因此只落在本台账里。

## 第十一轮：容器入口的数据根、截屏脚本与需求箱安装脚本的变量名（2026-10-06，条目 2.2c 的非桌面壳收尾·三）

一次无人值守的自主推进，只做**最靠前的未勾选条目 2.2c** 里**非桌面壳**的那一半。**没有切版本号、没发 npm、
没发安装包、没发发布汇总**；`legacy/main`、`/root/penguin-harness`、3003 / 3004 / 4000 全程没碰。

### 为什么这一轮还有活可干

第九轮把「非桌面壳的旧名写点」列了 6 处，并写下「到此为止」。这一轮改口径**连读点一起扫**（`PENGUIN_HOME` /
`_PROFILE` / `_WEB_DIST` / `_WEB_DB` / `_CLI_ENTRY` / `_PORT_FILE` / `_DESKTOP_TOKEN` / `_BUNDLED_SHELL`），
又找出**两处会真的出错**的漏网、一个写点和一处文档尾巴：

| 位置 | 问题 | 现在 |
| --- | --- | --- |
| `docker/entrypoint.sh` | 取数据根写的是 `${PENGUIN_HOME:-/data}`，而 `Dockerfile` 的 `ENV` 第九轮就已经是 `ADELIE_HOME=/data` —— 这个旧名**现在没有任何东西会去设**。于是 `-e ADELIE_HOME=<宿主挂载点>` 时，entrypoint 去 mkdir/chown `/data`，服务端读的却是真正挂进来的那个目录：宿主目录始终归 root，容器里的 uid 1000 写不进去。今天没炸只是因为「回落值恰好也是 /data」 | `data_root="${ADELIE_HOME:-${PENGUIN_HOME:-/data}}"` —— 与 `scripts/launchers/penguin{,.cmd}` 同一条规则（新名优先、旧名仍认），注释写明为什么 |
| `plugins/requirements-box/skills/requirements-box/kit/install.mjs` | 数据根的优先级写反了：`PENGUIN_HOME ?? ADELIE_HOME`（**旧名在前**），两个都设时插件把定时任务登记到旧根、而服务端读新根，与 core 的 `resolveRoot()` 正好相反；另外 project / agent 只读 `PENGUIN_PROJECT_ID` / `PENGUIN_AGENT_ID`，而 2.2b 已经宣布这两个名字**不再生效** | 新名在前（`ADELIE_HOME ?? PENGUIN_HOME`，与 core 同序）；project / agent 只读 `ADELIE_*`，注释里写明旧名已废 |
| `packages/web/scripts/theme-shots.mjs` | 截屏脚本起服务时写 `PENGUIN_HOME` / `PENGUIN_WEB_DB` / `PENGUIN_WEB_DIST`（第九轮漏掉的**写点**） | 三个都改成 `ADELIE_*` |
| `packages/web/README.md` | 「Production」一节仍写 `PENGUIN_WEB_DIST`（第十轮顺带记下的文档尾巴） | `ADELIE_WEB_DIST` |

`plugins/requirements-box/plugin.json` 的日期版本随之 2026.10.06.2 → **2026.10.06.3**（改了安装时落地的内容，
按仓库规矩要升；npm 包版本仍跟着下一次发版走，这一轮不动）。

### 验证（都不是推测）

- **容器入口真跑三遍**（不是读代码）：拿一个「打印自己环境」的桩当服务，`sh docker/entrypoint.sh sh <桩>` ——
  只设 `ADELIE_HOME` → 那个根被建出来（uid 1000 所有）、命令以 uid 1000 跑、拿到的是这个根；只设旧名
  `PENGUIN_HOME` → 旧名照旧生效；两个都设 → **新名赢，旧根没有被建出来**。修复前后同一段逻辑并排跑
  （`ADELIE_HOME=/mnt/adelie`）：修复前 `data_root=/data`、修复后 `/mnt/adelie`；`sh -n` 过。
- **按 theme-shots 的变量形状真起一次服务**（数据根在会话 scratchpad，端口 7481 / 7482）：日志里 `Data root` /
  `SQLite` / `Web dist` 三行都指向新拼写给的值，`GET /` 302 → 跟随重定向 200 且 `<title>Adelie</title>`；
  用完进程已收、端口已释放（7481 / 7482 都不在监听里）。
- **需求箱安装脚本真跑 `--print-only` 四种组合**：只用新名 → `<新根>/<新 project>/agents/<新 agent>/agent_state/
  schedule/…`；两个根都设 → 落在**新**根；只给旧名 → 旧根仍认（而 `PENGUIN_PROJECT_ID` / `PENGUIN_AGENT_ID`
  已不生效，回落到 `default_project` / `default_agent`，正是 2.2b 定的口径）；显式 `--data-root` 仍然最高。
  顺带确认这些回落值不是死代码：**本会话的 shell 里 `ADELIE_PROJECT_ID` / `ADELIE_AGENT_ID` / `ADELIE_SESSION_ID`
  都设着**，从 Agent 里直接跑这个脚本时确实会读到它们。
- **门禁**：六包 typecheck 全过（core / server / web / ui / cli / hmr）；`pnpm lint` 0 警告 0 错误（2052 文件）；
  `pnpm format:check` 干净；测试 core **1359** / 5 跳过 · ui **1003** · cli **506** · web **2896** / 2 跳过 ·
  server **2606** / 2 跳过 · docs **62**，**0 失败**；插件守卫复跑：`core/test/plugins.test.ts` 21 过、
  server 的 `plugin*` 9 文件 121 过、`scripts/check-plugin-versions.mjs` 过；`sh scripts/test-installer.sh` 过。
- **收尾 grep**：非桌面壳、非安装器/发布协议、非文档面里剩下的 `PENGUIN_*` 只有三类**有意保留**的 ——
  core/server 注释里说明「旧名仍读」的文字、测试里钉兼容别名的夹具、`machines/commands.ts` 那条**两个都写**的
  远端命令；加上两个启动器脚本与 `install.ps1` 垫片里的**兼容分支**（新名优先、旧名兜底，是有意留的）。

### 还差什么（2.2c 仍未勾掉）

1. **桌面壳那半边**：`packages/desktop/src/{server-process,launcher,web-dist,…}.ts` 与它自己的开关
   （`DESKTOP_SMOKE*` / `NO_LOGIN_SHELL_ENV` / `UPDATE_FEED_URL` / `BB_SMOKE_BUNDLE`），按这一轮的纪律没碰。
   **但那条「依赖没装、磁盘告急」的理由已经不成立**：`packages/desktop/node_modules` 里 electron /
   electron-builder / tsup 都在，磁盘 7.3G 可用 —— 下一轮只要用户点头，就可以把这半边做完（本地只跑 node 侧的
   桌面包测试，不跑 electron）。
2. **本机部署单元** `adelie-app.service`（3004，已 stop + disable）仍设 `PENGUIN_HOME` / `PENGUIN_WEB_DIST` /
   `PENGUIN_CLI_ENTRY`：读侧两条都认，改它属发布动作。
3. **插件里还有三处文本面的旧名**，这一轮**有意没动**，留给用户拍板（换它会牵到「这套插件还要不要在同一份
   SKILL.md 里同时服务 Adelie 与上游 PenguinHarness」这个口径）：
   - `plugins/agent-development/skills/penguin-config/SKILL.md`：那句「默认 `PENGUIN_HOME`，然后 `~/.penguin/data`」
     与「harness 剥掉每一个 `PENGUIN_*`」都已经不是事实（现在是 `ADELIE_HOME` → 旧名 → `~/.adelie/data`，
     剥的是 `ADELIE_*` / `PENGUIN_*` 两个前缀）。
   - `plugins/agent-tuning/skills/{agent-optimization,agent-evaluation}/SKILL.md`：用 `PENGUIN_HOME` 当「项目目录的
     父目录」这个约定的变量名（还让 Agent `export` 它）。它是**唯一在 Adelie 与上游 PenguinHarness 上都成立**
     的拼写 —— 上游只认旧名；而这几份 SKILL.md 是给 Agent 看的契约文本，改它要连插件日期版本一起升。

### 顺带看到的（不是这一轮的改动）

- **3.1–3.4 大概率已经是「不用移植」**（只做了粗查，留给各自那一条逐条核对）：审批口径上游是四档
  （`CHAT_APPROVAL_MODES = allow-all | deny-all | read-only | always-ask`，`server/src/runtime/approvals.ts`
  的语义与旧 Adelie 三档逐条对应，另有无人值守会话直接拒绝、命令策略否决与组织级档位）；
  模型目录里 deepseek / moonshot / qwen 三组与费率表都在，且比旧 Adelie 那张表细得多；
  用量与成本页在（`server/src/http/routes/usage.ts` + `web/src/features/usage/usage-page.tsx`）；
  用户、角色与项目成员也在（`routes/{members,organizations}.ts`、`ProjectRole`）。
  唯一值得记下来的差异是**默认档**：旧 Adelie 默认「每次问我」，基座默认 `allow-all` —— 这一条**不该改**：
  无人值守的定时轮次（本文件这些自主轮次、组织的工位会话）靠的就是「不问就干」，而每轮会话自己还能在输入区改档。
- `packages/web/README.md` 末尾那行来源链接仍写着上游的 `github.com/Prism-Shadow/penguin-harness`
  （我们的仓库是 `lmliheng/Adelie`）；属品牌那一类，这轮没动。

## 第十二轮：审批口径三档判定上游已覆盖（2026-10-07，条目 3.1）

一次无人值守的自主推进：条目 3.1 的判据写在 `FORK.md` 里 —— 「接回 Adelie 已经做过的东西，**或判定上游
已经覆盖、直接删**」。这一轮做的是后半句：把旧 Adelie 那三档的行为逐条对着基座核一遍。结论：**上游那套
是旧约定的超集，没有要移植的代码，也没有要删的东西**，条目就地勾掉，`FORK.md` 的第 3 条也把这一项标成
「已判定覆盖」。**这一轮没有改任何代码**：改的只有 `FORK.md` 与这份台账，也没有切版本号、没发 npm、
没发安装包、没发发布汇总；`legacy/main`、`/root/Adelie` 工作区、3003 / 3004 / 4000 全程没碰。

### 对照（左列原文取自 `origin/legacy/main`，右列是基座）

| 旧 Adelie 的行为（`docs/api.md` §4 审批 / `CHANGELOG.md`） | 基座 | 证据 |
| --- | --- | --- |
| **三档**：`always-ask`（默认）/ `read-only` / `allow-all` | **四档**：多一个 `deny-all`（不问、一律拒绝）；其余三档的语义逐条相同 | `core/src/state/project-config.ts:131`（`CHAT_APPROVAL_MODES`）、`server/src/api/types.ts:41`、`server/src/runtime/approvals.ts:6-9`、`cli/src/approval.ts:13-19` |
| 三档的差别不只是政策，而是**有没有交互层**：只有「不问」的两档把运行时的 policy 交下去 | 同一件事，且多一条：**无人值守会话**（`client === "org"`）把「要问人」的那一路**当场判 deny**，不留一个等不到人的 pending | `server/src/runtime/approvals.ts:104-127`（`manual()` 的 `unattended` 分支）、`runtime/session-manager.ts:963` |
| `approvalPolicy` **是每个人的**（「不该由别人替我定」），PATCH 后**立刻生效** | 挂**每个会话**（更细），另有 Project 级默认档与组织级档；`getMode` **每次裁决都重读库**，所以改档立刻生效 | `server/src/db/schema.ts:86`（`sessions.approval_mode`）、`routes/sessions.ts:708-711`（PATCH + `updateApprovalMode`）、`runtime/session-manager.ts:959-960`、`routes/chat-defaults.ts:69`、`routes/organizations.ts:66`（组织三档 `allow-all` / `read-only` / `deny-all`，没有 `always-ask`） |
| 决定照样记进事件流（`approval` 事件，`source: "policy"` 表示不是人拍的板） | 记的是 `approval_decision` 事件（决定 + `tool_call_id`）；Trace 里能查到「谁在什么时候批准了什么」，而且裁决等待**不计入** LLM 生成时长 | `core/src/omnimessage/builders.ts:273`、`core/src/internal/command-policy.ts:168`、`server/test/trace-service.test.ts:382` |
| 旧 Adelie 没有的那一层 | **命令策略**（`.project_config.toml` 的 `[command_policy]`）：命中规则的命令直接 deny，**压过包括 `allow-all` 在内的所有档位**；规则是 Project 的数据、不是代码 | `core/src/internal/command-policy.ts:1-24` |
| 待审批**超时 5 分钟按拒绝**处理 | **没有超时**：挂着等人裁决，或本轮被中断（中断时 pending 一律收敛为 deny；子 Agent 的 pending 留给用户） | 上游设计，见 `runtime/approvals.ts:4-8`；用例 `session-manager.test.ts:1054`、`session-subagents.test.ts:207` |

两处**有意不一样**、这一轮确认**都不改**：

1. **默认档**：旧 Adelie 默认 `always-ask`，基座默认 `allow-all`（`db/schema.ts:86`、
   `services/session-service.ts:621`、`web/src/features/chat/draft-view.tsx:211` 三处一致）。
   **不改的理由这一轮亲手核过**：定时任务建会话（`runtime/scheduler.ts:431`，经 `ScheduleSessionCreator`）
   **不传审批档**，取的就是这个默认值，而这类会话**不是** `client === "org"` 的无人值守会话 —— 拿不到
   `unattended` 那条「当场判 deny」的短路。默认档改成 `always-ask`，本文件里这些 4 小时一轮的自主推进
   会在第一个写文件 / 跑命令的动作上永远挂住。四档都在输入区可改，不耽误人。
   （第十一轮记过同一个结论，当时是「粗查」；这一轮把它补齐成证据链。）
2. **审批超时**：基座刻意不留超时（旧 Adelie 5 分钟判拒绝）。挂着的审批在界面上有卡片、被中断时收敛为
   deny；补一个超时等于改基座行为，条目没要求，没做。

### 验证（都不是推测）

- `pnpm --filter @lmliheng/penguin-{core,server,web,ui,cli,hmr} run typecheck` —— **六个包全过**
  （server 那步顺带打印 `src/ifaces.json unchanged`，186 接口 / 537 类型）。
- 六个包的测试：core **1359 通过 / 5 跳过**（64 文件 + 1 个 e2e 跳过） · web **2899 / 2 跳过**（236 文件） ·
  ui **1003**（127 文件） · cli **506**（34 文件） · hmr 没有用例（`--passWithNoTests`） ·
  server **182 文件 / 2625 通过 / 4 跳过**。**server 整包跑了三次：2 绿 1 红**；红的那条是
  `test/terminal-stream.test.ts > replays input modes a program enabled to a reattaching client`
  （断言重连后的回放帧里有 `\x1b[?25l`），**单独跑该文件 5 次全绿（16/16）**。它是装载敏感的终端回放
  用例（它自己的注释就写着 `sh -l` 的 profile 输出可能压后），与本轮无关 —— 本轮一行代码都没改。
  记在这里，留给以后动它的人。
- 审批语义由既有用例钉住，逐条点名确认都在：`server/test/session-manager.test.ts` 的
  「always-ask: registers a pending approval and pushes approval_request…」(822)、
  「approval mode takes effect immediately: after a mid-run PATCH…」(1028)、
  「abort: pending approvals collapse to deny before the AbortSignal fires」(1054)；
  `session-subagents.test.ts:207`（`denyMain` 只收本会话的 pending）；
  `organization-runtime.test.ts:980` / `:1004`（组织档位、改了档要跟着已开的工作位会话）；
  `cli/test/approval.test.ts:99`（`--approve` 的四档与默认 `allow-all`）。
- 没有起服务、没有动的端口 —— 这一条没有界面改动，也没有只能靠真模型才能跑的东西。

### 为什么这一轮跳过 2.2c（表上的第一条未勾选条目）

2.2c 剩下的三处，这一轮逐处核过，全都需要你拍板或按本轮纪律不能碰：

1. **桌面壳那一半**（`packages/desktop/src/{server-process,launcher,web-dist,main,login-shell-env}.ts`
   与 `DESKTOP_SMOKE*` / `NO_LOGIN_SHELL_ENV` / `UPDATE_FEED_URL` / `BB_SMOKE_BUNDLE`）—— 本轮的纪律
   明写「不要碰 desktop / electron」。**顺手核了那条理由**：`packages/desktop/node_modules` 里
   electron / electron-builder / tsup 都在（包体在 `node_modules/.pnpm/electron@43.2.0/…`），磁盘
   **7.0G 可用** —— 「依赖没装、装了要下 100MB+、磁盘告急」今天不成立，真正的阻碍只剩 3.5
   （上游桌面壳与旧 Adelie 那个取哪个）。**做不做，等你一句话。**
2. **既有部署单元** `adelie-app.service`（3004，已 stop + disable，仍设旧名）—— 读侧两条都认，
   改它属发布动作。
3. **插件里三处文本**（`agent-development/skills/penguin-config/SKILL.md`、
   `agent-tuning/skills/{agent-optimization,agent-evaluation}/SKILL.md`）—— 换它会牵到「同一份 SKILL.md
   还要不要同时服务上游 PenguinHarness」这个口径。

另外发现一处**文档尾巴**（不属 3.1，本轮没动）：`packages/cli/README.md:20` 仍写
「Data lives under `~/.penguin/data` (`PENGUIN_HOME` or `--root` override)」—— 它是 2.2c 的收尾，
下一轮做 2.2c（或它剩下的部分）时可以顺手带上。

> **2026-10-07 与另一条线的交汇（第十二轮）**：本轮开工时 `git status --short` 是干净的、`main` = `a23bc6c8`。
> 跑门禁期间那条线在**同一棵树**里把 47 个 `package.json` 的 version 与 `packages/core/src/index.ts` 的
> `VERSION` 升到 0.3.3，并提交/推送了 `c7db52a7`「chore(release): v0.3.3 —— 版本戳与发布正文」，
> 所以本轮 HEAD 是 `c7db52a7`（本轮的提交压在它上面）。那些改动是版本戳与发布正文，与本轮改的两个文件
> 没有重叠，本轮**一个都没碰**（`git add` 只列 `FORK.md` 与 `FORK-PROGRESS.md`）。

### 收尾：推送与汇报

- **推送**：`git push origin main` = `c7db52a7..19b56659`（本轮一个提交，`FORK.md` 与这份台账同一笔）。
- **汇报邮件没发出去（第三轮卡在同一处）**：vault 里的 `CSU_MAIL_AUTHCODE` 长度 16、注入正常，但邮箱
  仍拒 —— `python3 scripts/mail.py check` 报 IMAP `LOGIN Login error or password error`。按技能纪律
  **只试一次、没有重试登录**（那对账号 / 专用密码已经失效或被撤销）。修法（只能由用户做）：网页邮箱
  「设置 → 个人信息 → 邮箱密码 → 客户端专用密码」重建一个，再
  `penguin config vault set --project-id sjaaj --agent-id default_agent --key CSU_MAIL_AUTHCODE`，
  **下一次新对话**才会注入。这一轮的结论因此只落在本台账里。

## 第十三轮：2.2c 的文本面收尾与需求箱安装脚本的默认根（2026-10-07，条目 2.2c）

一次无人值守的自主推进，只做**最靠前的未勾选条目 2.2c** 里**非桌面壳、非发布面**的那一半。**没有切版本号、
没发 npm、没发安装包、没发发布汇总**；`legacy/main`、`/root/Adelie` 工作区、`/root/penguin-harness`、
3003 / 3004 / 4000 全程没碰；按本轮纪律**没有碰 `packages/desktop` 与 electron**。

### 为什么这一轮还有活可干

前两轮（第十一轮「连读点一起扫」、第十二轮「复核」）把非桌面壳剩下的旧名归成两类：**有意保留的**（兼容
别名与它自己的注释、钉兼容的测试夹具、`machines/commands.ts` 那条两个都写的远端命令）与**等着改的**。
这一轮换一个更窄、更好判的判据重扫：**这句里写的是不是「现在就是这样」** —— 凡把旧名 / 旧路径当作当下
事实来教的，一律改成 Adelie 的；本来就讲「改名之前」的，一个都不动。一趟扫下来 19 个文件：15 个是文本与
默认值，4 个是跟着升的插件日期版本。其中一处是**真会出错**的默认值。

### 一处真 bug：需求箱安装脚本的默认数据根

`plugins/requirements-box/skills/requirements-box/kit/install.mjs` 的数据根优先级是
`--data-root` > `ADELIE_HOME` > 旧名 `PENGUIN_HOME` > `~/.penguin`。前四段都对（第十一轮修的），**最后
那个默认值不对**：core 的 `resolveRoot()` 在两个变量都没设时算的是 `~/.adelie/data`，而这里算的是
`~/.penguin` —— 既少了 `data/` 这一级、又还写着旧名。后果：谁都没设变量时，巡台的定时任务被登记到
`<home>/.penguin/<project>/…`，而服务端读的是 `<home>/.adelie/data/<project>/…` —— **登记成功、永远不会
跑**。文件里那句注释（「与 core 的 resolveRoot() 同一个顺序」）正是当初的意图，只是默认值这一段没跟上。

证据是**修复前后各真跑一次**（`--print-only`，两个变量都不设）：

| | 打印出来的定时任务路径 |
| --- | --- |
| 修复前（把 `git show HEAD:` 那一版放进 kit 里跑） | `/root/.penguin/default_project/agents/default_agent/agent_state/schedule/requirements-triage.toml` |
| 修复后 | `/root/.adelie/data/default_project/…`（同一个文件名） |
| core 的 `resolveRoot()`（同一台机、同样不设变量） | `/root/.adelie/data` |

另外四种组合也各跑一遍：只设 `ADELIE_HOME` → 用它；只设旧名 → 旧名仍认；两个都设 → **新名赢**；
显式 `--data-root` → 最高。四条都与 core 的规则一致。

### 文本面：把旧名当「现在」用的地方

- **6 份插件文本**（技能契约是 Agent 读的，写错会让 Agent 去找一个不存在的路径）：
  - `agent-development/skills/penguin-config`：`--root` 的默认链改成 `ADELIE_HOME` → 旧名 →
    `~/.adelie/data`；「harness 剥掉每一个 `PENGUIN_*`」改成剥 `ADELIE_*` / `PENGUIN_*` **两个前缀**
    （2.2a 起的事实）；全局根不再是 `~/.penguin/data`。
  - `agent-development/skills/{penguin-sdk,unified-llm-api}`：凡指「全局数据根」的 `~/.penguin` /
    `~/.penguin/data` / 「别的 `.penguin` 目录」全部改成 `.adelie` 的写法；`./penguin_data`（**应用
    自己**的数据目录示例）一个都没动 —— 那不是环境变量，也不是全局根。
  - `agent-tuning/skills/{agent-optimization,agent-evaluation}`：这两份把「项目目录的父目录」命名成
    `PENGUIN_HOME` 并让 Agent `export` 它（`penguin run` 原先靠这个旧名读到正确的根）。改成
    `ADELIE_HOME` —— 读侧新名优先，走的是正路；`agent-evaluation` 里「不要换成别的 Penguin home」
    跟着改成「别的数据根」。
  - `csu-mail`：「项目 id 怎么从 App Data Dir 认」的两处示例路径 + `bootstrap.sh` 的报错文案。
- **2 份包 README 的尾巴**：`packages/cli/README.md`（第十二轮点名的那处）+ `packages/core/README.md`
  （同一处、此前没人点名），都从 `~/.penguin/data`（`PENGUIN_HOME`）改成 `~/.adelie/data`
  （`ADELIE_HOME`，旧名仍读）。
- **5 处源码注释**（把旧名当「现在」写的）：插件目录由 `ADELIE_HOME` 定
  （`server/http/routes/plugins.ts`）、每个账号自己的 `~/.adelie`（`machines/ssh-config.ts`）、
  删掉 `ADELIE_HOME` 不动 localStorage（`install-id.ts`）、剥的是两个前缀
  （`core/.../mcp/provider.ts`）、harness 剥掉 `ADELIE_HOME`（`web/src/lib/strings.ts`）。
- **4 个插件的日期版本 +1**（改了安装时落地的内容，按仓库规矩必须升）：`agent-development`
  2026.09.30.2 → 2026.10.07.1、`agent-tuning` 2026.09.30.1 → 2026.10.07.1、`csu-mail`
  2026.10.05.1 → 2026.10.07.1、`requirements-box` 2026.10.06.3 → 2026.10.07.1。npm 包版本不动，
  跟着下一次发版走。

### 有意没动

`packages/ui-gallery` 的 mock 数据（演示路径，不是任何东西读的契约）、`packages/docs/**` 的环境表、
`changelog/**` 与 `RELEASE-*`（历史）、`packages/desktop/**`（本轮纪律：不碰 desktop / electron）、
以及所有「讲改名之前」的兼容注释与测试夹具 —— 都写进 2.2c 条目的「还差什么」了。

### 验证（都不是推测）

- **门禁**：六个包 `typecheck` 全过（core / server / web / ui / cli / hmr）；`pnpm lint` **0 警告 0 错误**
  （2054 文件）；`pnpm format:check` 干净。
- **测试**：core **1359 通过 / 5 跳过**（64 文件）· ui **1003**（127 文件）· cli **506**（34 文件）·
  web **2899 / 2 跳过**（236 文件）· server **182 文件 / 2625 通过 / 4 跳过** —— **0 失败**
  （上一轮那条装载敏感的 `terminal-stream.test.ts` 这次是绿的）；docs **62** 通过（含
  `skills-sync.test.ts`：库里每个插件都在技能页里有名字）。
- **改动的插件真跑过**：见上面那张修复前后的表（`--print-only` 五种组合）；插件版本守卫
  `node scripts/check-plugin-versions.mjs <base>` 在提交后复核通过。
- **没有起服务、没有动的端口**：本轮**没有界面改动** —— `web/src/lib/strings.ts` 改的是注释，不产生任何
  渲染差异，所以按纪律没开 Playwright、也没重建 `packages/web/dist`。

### 收尾：推送与汇报

- **推送**：`git push origin main` —— 本轮**代码与文本**那一笔是 `37f710d9`（表格里引用的就是它），
  其后几笔都只动这份台账。按纪律没有切版本号、没发 npm、没发安装包、没发发布汇总邮件。
- **汇报邮件没发出去（第四轮卡在同一处）**：vault 里的 `CSU_MAIL_AUTHCODE` 长度 16、注入正常，但邮箱
  仍拒 —— `python3 mail.py check` 报 IMAP `LOGIN Login error or password error`。按技能纪律
  **只试这一次、没有重试登录**（那对账号 / 专用密码已经失效或被撤销）。修法（只能由用户做）：网页邮箱
  「设置 → 个人信息 → 邮箱密码 → 客户端专用密码」重建一个，再
  `penguin config vault set --project-id sjaaj --agent-id default_agent --key CSU_MAIL_AUTHCODE`，
  **下一次新对话**才会注入。这一轮的结论因此只落在本台账里。

## 跟上游学之一：工位 @ 合并（2026-10-06）

用户让「按你的思路进化应用」，第一件做的是清单里的 5.1 —— 公司模式里最直接压钱的那条。

### 为什么要做

上一轮算公司模式的开销时得到的结论是「**会话数量才是费用变量**」：每一次巡检、每一次重跑、每一次重剪
都是一次会话，而每个会话第一条消息都要冷读手册、规范与工单。频道 @ 是这条账上最不值的一笔 ——
工位忙时，过去每被 @ 一次就在工位会话的内存队列里压一个 Task，一个长 Task 回来面对几十个工作轮，
每个都带着同一段频道上下文、其中大多数说的是它已经办完的事；而服务重启或热更新会**静默清空**这个队列，
频道扫描早已越过那些消息，它们再也不会送达（丢了还没人知道）。

上游在 `feat/org-trigger-coalesce` 上解决了它（提交 `c41fa086`，2026-09-29），那条分支没进 `main`，
我们的基座里也没有。

### 做了什么（照上游的设计移植，不是合分支）

- **排队取代压队列**：@ 先写进公司模式新表 `org_desk_mentions`（我们这边是迁移 **13**
  `company-mode-desk-mentions`，`swapSafe: true`），与推进频道扫描游标在同一次对账里落库，
  按（员工、频道、消息）去重 —— 一次死在游标移动之前的对账不会重复排队。
- **一次对账 = 每个空闲工位一个工作轮**：`deliverDeskMentions` 把待送达的 @ 合并送达，每轮至多 20 条
  （`MENTIONS_PER_RUN`），**发起成功才出队**：发起被拒或开不出工位时它们留到下一次；忙着的工位跳过、
  继续累积。合并轮的 hop 取各条的最大值，连锁上限不因合并而重置。
- **正文只在多条时才变**：一条与过去逐字相同；多条合成清单 —— 逐条列出完整点名、按频道分组、
  「今天早些时候」的上下文每个频道只附一次，点名之间未 @ 它的消息不重复（留给 `channel tail`）。
- **旧的队列语义改了**：`dispatchToDesk` 的 `queueIfBusy` 仍在（日历事件还用它），但它的注释写清了
  它只在本进程存活期间有效 —— 所以 @ 不走它。
- 员工离任时把待送达的 @ 一并清空（`service.leave`）；组织暂停或公司模式关闭期间保留，不丢弃。
- `company-employee` Skill 补上合并送达的说明：每条点名回各自的频道答复，已处理过的跳过；
  `agent-company` 版本 `2026.09.18.1` → `2026.10.06.1`。
- 变更日志照 5.7 的习惯写了中英双份：`changelog/unreleased/2026-10-06-org-desk-mentions{,zh}.md`。

### 验证（都实跑过）

- `packages/server`：**181 个文件 / 2613 通过 · 2 跳过 · 0 失败**（新增 5 条运行时用例 + 2 条迁移用例）。
  新增的 5 条是上游那 5 条的对应物：忙工位把两条 @ 攒起来、空闲后一个轮送达且上下文只附一次、
  中间未点名的那条不被复述、已在办的不重复办；待送达的 @ 活过进程重启且 hop 取最大；
  发起被拒则留到下一轮且单独一条读起来与过去一致；每轮上限 20 条并说明还有更多；
  离任员工把待送达的 @ 带走。
- `packages/server/test/db-migrations.test.ts`：迁移 13 的两条（新库与声明一致、重复扫描不重复入队、
  回滚到 12 只剩空表），并修了三处写死到 12 的断言与七个按「当前声明减去某迁移」构造的旧库夹具。
- `packages/docs` 62 通过（含 `skills-sync.test.ts`，插件技能与文档站同步）；`packages/core` 的
  `plugins.test.ts` 21 + `plugin-store.test.ts` 8 通过。
- `pnpm lint` 0 警告 0 错误（2052 文件）；`pnpm format:check` 干净；`packages/server` 的
  `tsc --noEmit` 过，`ifaces.json` 重新生成（它是生成物、`.gitignore` 里，不进提交）。
- 没有起的服务、没有动的端口；`/root/adelie-fork` 工作树在本轮开始与结束时都只有本轮的文件。

## 跟上游学之二：工作区选择器随被浏览的机器适配（#962，2026-10-07）

用户说「继续」，承接上一条（5.1）往下走。5.2 核实为**已经做完**（见待办 5.2），于是本轮做 5.3 里
唯一一件「已经在 main 里、规模可控、对 Windows 那台直接有用」的事：上游 `b5a0ae8f`
（`The Workspace finder adapts to the machine it browses`，#962，17 文件 +1777）。

### 为什么要做

公司跑在 Windows（RTX 5060）那台。在那台机上选工作区时，选择器的左栏过去只会按 Linux 的方式想事情：
`C:\` 被当成相对路径、盘符要点地址栏手打、`AppData` 与旧式目录链接（点进去只有「拒绝访问」）照列。
#962 让**被浏览的机器**用自己的规则回答左栏：Windows 给盘符（带卷标与类型）、macOS 给 `/Volumes`、
Linux 给根与挂载点；标准文件夹按那台机自己的规则找（OneDrive 接管的桌面、中文桌面的 `~/桌面`）；
Windows 上按隐藏属性过滤，并可只输入 `D:` 打开该盘。

### 做了什么（照上游移植，不是合分支）

- **新服务** `packages/server/src/services/dir-places.ts`（829 行）：Windows 走 PowerShell 报盘符，
  macOS 读 `/Volumes`，Linux 读 `/proc/mounts` 与 XDG 用户目录。所有平台调用都过 `PlaceEffects`
  接口，所以每个平台的分支都能在任何机器上跑单测；真机走 `systemEffects`。枚举在子进程里做并限时
  （PowerShell 5s、cmd 3s），结果缓存 15s（失败也缓存），因为一台断开的网络盘会把 libuv 的线程按
  几十秒。
- **路由** `GET /api/projects/:p/dirs`：主目录请求带 `places=1` 时返回 `standardFolders` 与
  `locations`；Windows 上每条列表标出 `hidden`；`D:` / `d:` 归一成 `D:\`（`normalizeRequestedDir`，
  纯函数、导出给单测）。旧的 `roots` 字段去掉。
- **前端**：左栏这一节在 Windows 上仍叫「此电脑」，别处叫「位置」；地址栏根部多一个 `切换位置` 下拉，
  一次换盘（窄屏左栏收成抽屉时尤其有用）；非 Mac 上 Ctrl+L / Alt+D / F4 编辑地址、F5 刷新当前目录
  （过去是刷新整个应用）；标准文件夹优先用机器自己给的答案，机器没给才回落到按英文名找。
- **图标**：finder 里那枚 `DRIVE_ICON` 搬进注册表（`hardDrive`，与上游同一段 path），另加 `plug` 给
  可移动盘；`packages/web/test/icon-registry.test.ts` 里该文件的白名单从 11 收紧到 10。
- 变更日志中英双份 `changelog/unreleased/2026-10-07-workspace-finder-per-platform{,zh}.md`（日期与
  文件名按本仓习惯改成落地日，正文里写明来源是上游 #962 / `b5a0ae8f`）；`packages/docs` 的
  `server-api.{en,zh}.md` 的 `/dirs` 一节跟着改；画廊 mock 补上 `places=1` 的答案，好在本地看到这一节。

### 怎么移植的

`upstream` 这个 remote 还指向已被删掉的 `/root/penguin-harness`（`git fetch upstream` 直接失败），
本轮**没有改仓库配置**，只用一次性 URL 抓 `main` 进对象库：
`git fetch --no-tags https://github.com/Prism-Shadow/penguin-harness.git main:refs/remotes/gh/main`
（2 秒，绝大部分对象已在库里），然后 `git apply -3 /tmp/dirplaces.diff` 走三方合并。17 个文件里 12 个
自动落地（含两个新文件与全部文案、文档、画廊 mock），5 个留冲突：`dirs.ts`、`dirs.test.ts`、
`workspace-finder-model.ts`、`workspace-finder.tsx`、`web/test/workspace-finder.test.ts`，共 9 处。
逐处看下来，冲突全是**我们自己的分叉**，不是上游的设计分歧：文件头注释（本仓多了 POST/DELETE/
access 那几段）、包名（`@lmliheng/` vs 上游的 `@prismshadow/`）、列表样式（本仓 `space-y-0.5`，
上游 `flex flex-col gap-1`）、图标常量（本仓仍留 10 枚字面量 path）。一律「上游的逻辑 + 本仓的样式」。

### 验证（都实跑过）

- 测试：server **182 文件 / 2625 通过 · 4 跳过 · 0 失败**（新增 `dir-places.test.ts` 11 条与
  `dirs.test.ts` 的 places/裸盘符用例）；web **236 / 2899 通过 · 2 跳过**；ui 1003；docs 62；
  core 1359 · 5 跳过；cli 506；ui-gallery 131；**0 失败**。
- 门禁：`pnpm lint` 0 警告 0 错误（2054 文件）；`pnpm format:check` 干净；server 与 web 的
  `tsc --noEmit` 过。
- **真机器**：`dirs.test.ts` 里那条「主请求带 `places=1`，不带就不给」走的是真 HTTP 与真文件系统
  （返回 `locations[0] = {path:"/", kind:"root"}`、`standardFolders` 是对象；Windows 那两条按平台
  跳过）。另外直接把 `discoverLocalPlaces()` 跑了一遍：11ms 出结果、第二次调用拿到**缓存里的同一个
  对象**、非 Windows 上 `windowsHiddenNames` 返回空集合而不是抛错。
- **真浏览器**：`pnpm dev:gallery`（7372，是我自己起的、看完就停了）配 Playwright + 本地 chromium，
  打开 `/app.html?route=/chat/new&lang=zh` 再点开 finder：左栏依次是「常用 / 位置（文件系统、data）/
  最近使用 / 机器」，地址栏那颗 `切换位置` 的下拉列出「文件系统、data」，console 无 error。截图
  `/tmp/finder-open.png`、`/tmp/finder-menu.png`。
- **没验的**：Windows 与 macOS 两条分支只有单测（这台机器是 Linux）；跨机那条路
  （`/api/projects/:p/machines/:id/dirs`）本轮没跑，它按设计也不带 places。
- 推送后 CI run **`37508204400`**（`ab6aa827`）**22 个作业全绿**。
- `pnpm -r test` 里 `packages/desktop` 有 2 条红：`installer-assets.test.ts` 比对
  `packages/desktop/dist/install.{sh,ps1}`（构建产物、`.gitignore` 里）与仓库根的安装脚本，前者是
  2026-10-06 早些时候的旧构建（提示里还写着 4000），后者已被 `3835c0e8` 改成新端口。**与本轮无关**，
  是本地陈旧产物；CI 上 `dist/` 不存在，那条测试自己跳过。

## 跨机评估（2026-10-07，条目 5.3）

### 我们已经有什么（都是本仓文件级证据）

- 服务端 `packages/server/src/machines/`：17 个文件 + `transport/`（`service`、`proxy`、`transport`、
  `terminal-relay`、`remote-token`、`install-server`、`ssh-config`、`server-control`、`server-state`、
  `plugins-sync`、`models-sync`、`upgrade`、`detect`、`layout`、`answer`、`machine-api`）。
- 路由 `packages/server/src/http/routes/machines.ts` **13 个端点**：ssh-hosts 增删查改、probe、
  install、connect、dirs、release、restart、disconnect、use / stop-using。
- 库表：`machine`（本机身份）、`machines`、`machine_project`（迁移 4、12）。
- 前端 `packages/web/src/features/machines/*`（机器页、机器选择器、ssh 主机对话框、probe 排期、
  匹配规则）。
- 模型：一台机器归一个 Project；本服务器用 SSH 把**本构建**装到对端，命令走 stdin、TCP 走 SOCKS，
  请求经 `/server/<machineId>/api/…` 同源转发；`sessions` 表**没有**机器列 —— 机器是 Project 级、
  前端按前缀改指。
- 测试：`packages/server/test/machines-*.test.ts` 10 个文件、**186 条全过**（含对真起服务的
  `syncModelsToMachine`）。

### 缺口（对着上游核过）

- 上游 `main` 里我们还缺的跨机提交只有两条：`dd1b931f`（CI 上把 machine 测试也跑到 Windows，#973，
  3 文件）与本轮移植的 `b5a0ae8f`（#962）。**两条现在都上了** —— `b5a0ae8f` 当轮落地，`dd1b931f`
  由 2026-10-09 第二十四轮落下，所以「上游 `main` 里还缺的跨机提交」这一栏归零。
- 其余跨机工作**全在分支上、没进 main**：22 个带 machine 字样的 head —— `feat/agents-across-machines`、
  `feat/company-remote-machines`、`feat/benchmarks-across-machines`、`feat/machines-simplified`、
  `feat/machine-transport-ssh-config-io`、`feat/machine-connection-stage-timings`、
  `feat/workspace-machine-identity`、`feat/plugin-machines`、`fix/machine-events-redial-a-failed-dial`、
  `fix/machine-events-attach-a-machine-connected-later`、`fix/machine-hop-answers-in-time`、
  `fix/machine-linked-stopped`、`fix/machines-adopted-table`、`fix/machine-server-own-session`、
  `fix/model-switch-on-its-machine` 等。**规模没法从 API 量**：GitHub 的 compare 只给前 300 个文件，
  而且这些分支相对 main 报 94～569 个提交（是血缘分叉，不是它们各自的工作量）。要量得逐个 fetch 下来
  diff，所以对它们的态度应当是「按需挑补丁」，不是「整体合」。
- 我们自己的差距不在「有没有跨机」，而在：没有第二台机器做端到端；以及公司模式还不会把活儿派到别的
  机器上（那需要上游那批分支）。

### 关键限制：Windows 那台今天连不上（两侧代码都拦着）

- `http/routes/machines.ts` 的 connect 明确拒绝 Windows：
  「A Windows machine cannot be connected yet: its sshd hands commands to cmd.exe, and there is no
  shell to hold a session on.」——**上游 main 里是同一句话**（`git show gh/main:…/machines.ts` 核过）。
- 跨机的目录列举 `machines/commands.ts` 的 `listDirsCommand` 是纯 POSIX 的（`$HOME`、`ls -1p`、
  `sed`、`grep`），一行 Windows 分支都没有。
- 结论：「这台 Linux 指挥 Windows 生成台」在两侧都还不成立，能跨的是 Linux/macOS 之间。Windows 那台
  今天的用法只能是它自己起服务、自己开界面 —— 这也正是本轮 #962 对它直接有用的原因（选工作区时能看到
  盘符、`此电脑`、`D:` 与隐藏项）。要真做到「Linux 指挥 Windows」，先得有「Windows 上也能维持一条
  会话」这件事（上游拿那 22 个分支在试，没进 main），而且没有第二台机器就无法端到端验证。

### 建议的落地顺序

1. `fix/machine-*` 那批小修复：逐个看补丁，能上就上（我们已有 186 条跨机测试兜底），优先
   `fix/machine-server-own-session`、`fix/machine-events-redial-a-failed-dial`、
   `fix/machine-hop-answers-in-time` 这类「不修就会挂」的。
   **2026-10-08 第二十三轮走过一遍**：七条分支逐个试落，**上了两条**（`fix/machine-server-own-session`
   与 `fix/machine-hop-answers-in-time`）；`fix/machine-events-redial-a-failed-dial` 与
   `-attach-a-machine-connected-later` 要的事件流线（`event-hub.ts` / `machine-sockets.ts`）本树没有，
   `fix/machine-linked-stopped` 与 `-adopted-table` 的内容本树早已有 —— 逐条理由与实测见「第二十三轮」一节。
   **2026-10-09 第二十四轮**把这条的最后一块补上：上游 `main` 里的 `dd1b931f`（#973）也落了，
   所以「上游 `main` 上还没上的跨机提交」不再有。
2. 有第二台 Linux 机器时，把「安装 → 使用 → 跨机建会话 → 插件/模型同步」端到端跑一次。
3. Windows 侧要么等上游把「Windows 上的会话」做进 main，要么自己评估成本（比前两项都大）。
4. 公司模式跑在别的机器上（`feat/company-remote-machines`）放在最后：它建立在上面这些之上。

## 模型库加入智谱官方的 GLM-4.7 Flash（2026-10-07，用户点单）

用户只给了一页文档（`docs.bigmodel.cn/cn/guide/models/free/glm-4.7-flash`）和一句「模型库添加智谱官方
4.7 flash」。落点就是内置模型库（`MODEL_CATALOG`）里直连 Z.AI（GLM）那一组——它就是这个分组，
`apiKeyUrl` 指的正是智谱开放平台的密钥页。

### 事实（都从两个官方页面读的，2026-10-07）

- id 是 `glm-4.7-flash`；**文本进、文本出**；上下文窗口 **200K**，输出上限 **128K**；支持思考模式、
  流式输出、Function Calling、上下文缓存、MCP。
- **免费**：Z.AI 的价格页（`docs.z.ai/guides/overview/pricing`）四项（输入、缓存命中、缓存存储、输出）
  全写 `Free`；智谱开放平台把它列在自己的免费模型页里。
- 它比 GLM-5 系列**更早**，不是更小：Z.AI 的发布记录里 GLM-4.7 是 2025-12-22、GLM-4.7-Flash 是
  2026-01-19、GLM-5 是 2026-02-12。所以它排在 zhipu 分组的最末，而不是最前。

### 改了什么

- `packages/core/src/state/model-catalog.ts`：zhipu 组末尾加一条 —— `glm-4.7-flash` /
  **GLM-4.7 Flash** / `contextWindow: 200000` / `pricing: usd(0, 0, 0)` / `supportsVision: false` /
  `clientType: "glm-5.3"`；文件头的「数据核对日期」补上 2026-10-07 这一条。
- **为什么必须固定客户端**：AgentHub 0.4.15 只在路由标记（`client_type`，没有就用 id 本身）里含
  `glm-5` 时才把模型交给统一的 GLM 客户端，而 `glm-4.7-flash` 带的是 `glm-4.7`。这不是推断——直接拿
  仓库里真装的 agenthub 构造 `AutoLLMClient` 试过：不固定 → 抛
  `glm-4.7-flash is not supported. Supported client types: …`；`clientType: "glm-5.3"` → 拿到
  `GLM5_3Client`。**端点则不固定**：Z.AI 与智谱开放平台用同一个 id 服务这个模型，走哪边由
  `ZAI_BASE_URL` 决定（与 `deepseek-flash`、MiniMax M3 那两条「只固定客户端」的写法一致）。
- 测试 `packages/core/test/model-catalog.test.ts`：zhipu 组的 id 顺序钉子里加 `glm-4.7-flash`；$0 条目的
  白名单加上它（与自建 vLLM、`:free` 同一处理——成本按 0 计、卡片显示免费徽标，而不是「未计价」）；
  「直连分组不固定 client_type」的循环排除这一条，并单独钉住它的 pin、窗口、vision 与三档 0 价；
  两处「不自动路由的厂商条目只有两个」的注释改成三个。
- 文档 `packages/docs/content/models.{zh,en}.md`：预置模型清单加上它，并新增一条「智谱的免费档」说明。
- 变更日志照 5.7 的习惯写了中英双份 `changelog/unreleased/2026-10-07-glm-4-7-flash{,zh}.md`。

### 验证（都实跑过）

- core **1359 通过 · 5 跳过**（64 文件 + 1 跳过）、server **182 文件 / 2625 通过 · 4 跳过**、web
  **236 / 2899 · 2 跳过**（含拿真目录跑的 `catalog-sync`）、cli 506、docs 62、ui 1003、desktop 286、
  ui-gallery 131，**0 失败**。
- `pnpm lint` 0 警告 0 错误（2054 文件）、`pnpm format:check` 干净、`pnpm typecheck` 八包全过。
- 路由那一条是**真跑依赖**得到的结论（上面那次 `AutoLLMClient` 构造），不是照着注释推的。

### 落库与 CI

- 提交 **`437ade9a`**（`feat(core,docs): 模型库加入智谱官方的免费档 GLM-4.7 Flash`，7 个文件、
  176 增 9 删），已推 `origin/main`（`6f385a82..437ade9a`）。推送前 `HEAD` 与 `origin/main` 已齐平，
  不需要 rebase。
- CI run **`37557398424`**：**22 个作业全绿**（typecheck、style (prettier)、plugin versions、
  npm packaging、installer-e2e、installer-windows、runtime ×3、test(core / rest / server / web-cli)、
  test-macos ×3、test-windows ×4、ci）。

### 现网与之后

当时 7364 那份跑的是 **v0.3.3** 的已装构建（这里原先写的 v0.3.1 是笔误），**没有**这一条；模型页的 Z.AI 分组不允许手工加条目
（`isAddableGroup` 只认 custom / vLLM / 自定义分组），所以要它出现在界面上得起一次新构建，之后用模型页的
**同步预置**把它带进既有 Project。本轮按纪律没有碰那份安装。

## 把这条模型滚进现网：源码原地更新，不发版（2026-10-07，用户点单「本服务更新一下」）

### 为什么不是发版

用户 2026-10-05 定的口径：**「更新应用」= commit，攒够阈值才升版本**。`v0.3.3`（今天 03:25 才上的现网）
之后只有 **1 个功能性提交**（就是上面这条模型，其余 8 个是台账/文档），远不到发版线 —— 所以走的是
「把当前源码构建后原地滚进 `/root/.adelie`」，版本号仍是 0.3.3。

### 怎么构建的

在一棵干净树（`/tmp/rel-live`，detached 检出 `8299fe3e`）里做，主工作树随时有别的巡台会话在写：

1. `pnpm install --frozen-lockfile` → 按发布工作流的手法把 `BUILD_DATE=2026-10-07`、
   `BUILD_COMMIT=8299fe3e82aa4bc13514942d48620a94900636b9` 盖进 `packages/core/src/index.ts`。
   **必须盖 BUILD_DATE**：`resolveBuildInfo()` 拿它区分「release 构建」与「source 构建」（`channel`），
   留空的话现网会自称 source 构建。
2. 构建 `penguin-hmr` / `penguin-core` / `penguin-server` / `penguin-cli` / `penguin-web`。
   第一次漏了 `penguin-hmr`（server 依赖它），补上后过。
3. `pnpm --filter @lmliheng/penguin-cli --prod deploy out/penguin/lib`、`packages/web/dist → web/`、
   `scripts/launchers/penguin → bin/penguin`、`build-plugins.mjs → lib/plugins`；`node/` 沿用现装那份
   （同版本 v24.18.0，不必重下 50MB）。

### 怎么装的（走正规安装路径，不是手工 rsync）

打成与 `scripts/package-release-bundles.sh` 同形的**离线 bundle**（`install.sh` + `payload.tar.gz` +
`.sha256`），再 `PENGUIN_INSTALL_DIR=/root/.adelie sh install.sh --no-modify-path`。install.sh 自己会
校验和 → 断言候选版本能跑 → 同盘替换 → 失败自动回滚，`bin/lib/web/node` 四个目录，数据根从不参与替换。

输出：`Payload checksum OK.` / `Adelie v0.3.3 installed to /root/.adelie`。

### 重启怎么做的（自己不能重启自己）

这一轮的会话就跑在 `adelie-server.service` 的 cgroup 里，直接 `systemctl restart` 会把会话连同汇报一起
掐掉。所以用 `systemd-run`（瞬时单元 `adelie-live-restart`，自己的 cgroup）跑一个脚本：先等 300s 让本轮
写完，再重启，然后自己核验并写日志。这是 v0.3.3 那次用过的同一手法。

### 核验（实跑）

- `is-active` = active、7364 在听、`GET /` 200（title `Adelie`）、`GET /healthz` 200；MainPID 从
  1901705 换成 1980708（启动于 09:55:26）。`NRestarts` = 0，`journalctl -p warning` 起服务后**无条目**。
- 装好的 lib 里 zhipu 组 6 行、含 `glm-4.7-flash`（整册 179 行）；`penguin --version` = `v0.3.3`；
  `BUILD_DATE = "2026-10-07"`、`BUILD_COMMIT = "8299fe3e…"`。
- 数据根 `/root/.adelie/data`（17 个顶层条目）与 `/root/.penguin/data → /root/.adelie/data` 软链未动；
  没有 `.old.*` / `.staging.*` 残留。

### 两个坑（下次别再踩）

1. **重启会重新签发 `/root/.adelie/data/api-token`**。核验脚本在重启前读的令牌，重启后打接口是
   **401**（64 字节错误体 `{"error":{"code":"unauthorized",...}}`），当时差点误判成「模型没进现网」。
   核验脚本要在重启**之后**再读令牌。
2. **接口给的是项目已存的行，不是整册目录**。`GET /api/projects/:p/models` 走
   `projectConfigService.getModels()`，返回 `default_project` 里存下的 129 行；内置目录有 179 行，
   `default_project` 缺 **55 条预置**（含 `glm-4.7-flash`）。新预置要靠模型页的**同步预置**带进既有
   Project，页面据此显示「有新的预置」提示（前端产物里已有这条 id）。所以「服务更新好了」≠「页面上
   立刻看得见这一条」。

### 补进项目（用户随后说「继续 按你的来」）

只补**这一条**，不做整表 union（`default_project` 还缺 54 条历史预置，那是用户自己列表的事，留给模型页
那个按钮）。做法照页面同一条路：`GET` 拿现有行 → 按 web 的 `toRow` / `rowToEntry` 规则转成提交条目
（没变的字段一律不带，于是服务端保留用户自己填的 base URL、密钥、输出上限、促销；`discount`/`apiKey`/
`baseUrl` 都省略）→ 追加新行 → `PUT /api/projects/:p/models`。

- `self_evolution` 175 → **176**、`default_project` 129 → **130**、`sjaj` 129 → **130**、
  `sjaaj` 183 → **184**，四条都读回校验过：新行 1 条、**原有行一条没丢**、默认模型没变。
- `acc` / `asass` **在我动手前就已经有了**（两个 `.project_config.toml` 的 mtime 是 09:57 / 09:58，
  就在重启之后几分钟——别的会话或用户自己已经同步过那两个项目），所以没再碰。
- `zhaoyukun-default_project` 是 zhaoyukun 的项目（0 行），不属于本轮范围，没动。
- 新行落库后长这样：`{"provider":"zhipu","modelId":"glm-4.7-flash","displayName":"GLM-4.7 Flash",
  "contextWindow":200000,"clientType":"glm-5.3","vision":false,"envKey":"ZAI_API_KEY",
  "pricing":{"cacheRead":0,"cacheWrite":0,"output":0}}` —— `displayName` 是目录补的，`envKey` 是服务端
  按分组算的。

### pin 的复核（拿**现装**的 agenthub，不是推断）

智谱分组没有可用密钥，发不了真请求，所以直接构造客户端看路由怎么选：

```
不固定（只给 model）      → ERROR: glm-4.7-flash is not supported. …
固定 clientType=glm-5.3  → 内层 GLM5_3Client
```

对照组：zhipu 分组里其余各行的 `clientType` 都是 `None`（id 自带 `glm-5`，AgentHub 自动路由），
只有这一条是 `glm-5.3` —— 这就是它必须 pin 的原因。
**注意参数名**：`AutoLLMClient` 的选项是 **`clientType`**（camelCase，`options.clientType ||
process.env.CLIENT_TYPE || options.model`），写成 `client_type` 会被忽略、退回用 model id 判定，
于是连 pin 过的那次也会报同一个错——我第一次就是这么被误导的。

## 第十四轮：模型目录与费率表判定上游已覆盖（2026-10-07，条目 3.2）

一次无人值守的自主推进。开工时 `git status --short` 干净、`main` 与 `origin/main` 齐平（`d39f9e37`），
`git merge --ff-only origin/main` 报 `Already up to date`。

**最靠前的未勾选条目本来是 2.2c**，但它的「还差什么」三条全在本轮纪律之外：写侧只剩
`packages/desktop/**`（本机没装依赖、3.5 才决定取哪个桌面壳）、`adelie-app.service` 的变量名（发布动作）、
桌面壳自己的开关（与它同一批）。重扫了一遍非桌面壳的 `PENGUIN_*`（546 处，非测试源码 40 个文件）：
不是兼容别名 / 旧名注释（`boundary-env.ts`、`config.ts`、`docker/entrypoint.sh`、`session-manager.ts` 的
剥离前缀），就是**有意保留的另外三面** —— `PENGUIN_GO_*`（上游 `token.penguin.ooo` 的服务标识，
`model-catalog.ts` / web 的四处）、`PENGUIN_FAMILY`（HMR family 常量）、发布链路与安装器协议
（`install.sh` / `install.ps1` / `scripts/test-installer.*` / `.github/workflows/release.yml` /
`update.ts` / `install.sh` 的副本 —— 属 4.x）。所以照第十二轮的先例跳过 2.2c，做**下一条可做的：3.2**。
本轮**没有改代码**，没有切版本号、没发 npm、没发安装包、没发发布汇总；`legacy/main`、
`/root/penguin-harness`、3003 / 3004 / 4000 全程没碰。

### 判据与结论

`FORK.md` 第 3 条给这一条的判据是「接回 **或判定上游已经覆盖、直接删**」。逐条核完的结论是
**上游已覆盖 —— 没有要移植的代码，也没有要删的东西**：基座的模型目录与费率表是旧 Adelie 那套的超集。

### 对照表（旧 Adelie 逐条 → 基座落在哪）

| 旧 Adelie（`origin/legacy/main`） | 基座（`main`） | 判定 |
| --- | --- | --- |
| 四组 `deepseek` / `openai` / `kimi` / `qwen`（`packages/core/src/config/model-catalog.ts`）：每组 `envKey` / `baseUrl` / `clientType: 'chat-completions'`，条目带 `label` 与每组至多一个 `default` | `packages/core/src/state/model-catalog.ts` 的 `MODEL_PROVIDERS`（15 组）+ `MODEL_CATALOG`（179 行：在架 176 / 退役 3）。这四家对应 **5 组**：`deepseek`、`openai`、`moonshot`、`qwen-pay-as-you-go`、`qwen-token-plan`，合计 28 行在架、**行行有价**。每组同样有 `envKey` / `envBaseUrlKey`，协议既可按组固定也可逐行固定（`openai-chat` / `openai-responses` / `ant-messages` / 各家专有） | 覆盖（分组更多、协议面更细） |
| 全局 `DEFAULT_PROVIDER = 'deepseek'`、目录里每组一个默认模型 | 默认值是**每个 Project** 的 `default_model`，模板给 `deepseek / deepseek-flash`（`state/project-config.ts:235`，注释写明为什么是它）；「每组的默认模型」这个概念不需要了 | 覆盖 |
| `rates`：只在知道牌价时写；`ratesFor` 只认 `(provider, model)` 精确匹配；`cacheRead` 省略就按输入价算；查不到返回 `null`，调用方按**未定价**说出来（`usage/rates.ts`） | 三桶价 `ModelPricing{ cache_read, cache_write, output }`（USD/百万 token，`state/project-config.ts:59`）；目录里的 `usd()` / `cny()` 是同一口径（人民币按固定 7:1 换成 USD 存）；**多一档峰谷价** `OffPeakDiscount`（DeepSeek 半价、Qwen 时段价，`offPeakAt` 按供应商自己的时区算）；无价的行 `pricing` 缺席 → `usage-service` 给 `cost = null` 且 `hasUncosted = true`（`services/usage-service.ts:515-524`），界面显示「未计价」 | 覆盖（并多两档能力） |
| 计费只有乘法、不分层：`输入 × 输入价 + 命中 × cacheRead + 输出 × 输出价`，末尾按 6 位小数收尾（`estimateCostUsd`） | 同一公式：`requestCostUsd`（`services/usage-service.ts:157-166`），另按**记录自己的时间戳**选峰/谷档 | 覆盖 |
| 用户手填的目录外模型名一律透传，按未定价处理 | 同（`custom` / vLLM / 用户自定义分组都能加条目；未知 id 不猜价） | 覆盖 |
| 用户级 `.env`（`~/.adelie/.env`）里读 `PROVIDER_ENV_KEYS` —— 四家厂商的 key 名各一个（含 `DASHSCOPE_API_KEY`） | 凭证的正路是**项目配置**（`web.db` 里每个项目一张模型表，可存 key）与 **Agent 密钥库**；`.env` 只在**工作目录**下读（`server/src/index.ts:117` 的 `loadDotenv({quiet:true})`、CLI 的 `dotenv/config`） | 有意保留的差异（见下 3） |

### 验证明细（都是真跑出来的）

取证脚本在 scratchpad（`session-2026-10-07-11-00-29-8461361f/verify-32.mts`，一次性、不入库），
`cd /root/adelie-fork && pnpm exec tsx <脚本>` —— 它 import 的是**源码**（core 的 `state/model-catalog.ts`、
`state/project-config.ts`、server 的 `services/usage-service.ts`），不是复述：

1. 四家厂的 5 个分组与键名：`deepseek`（`DEEPSEEK_API_KEY`，在架 2 / 有价 2）、`moonshot`
   （`MOONSHOT_API_KEY`，3 / 3）、`qwen-pay-as-you-go`（7 / 7）、`qwen-token-plan`（6 / 6）、
   `openai`（10 / 10）；整册 179 行，这五组 28 行**全部**有价。
2. 默认模型：`defaultProjectConfig().default_model = {"provider":"deepseek","model_id":"deepseek-flash"}`。
3. **费率公式等价**：拿旧 Adelie 的 `estimateCostUsd`（从 `origin/legacy/main:.../usage/rates.ts`
   逐字抄进脚本、只去掉两个 import）与基座真的 `requestCostUsd`，在 192 组 token 组合 × 3 套牌价上对比
   （对应关系：旧 `input` → 新 `cache_write`、旧 `cacheRead` → 新 `cache_read`），旧侧按 6 位小数收尾后再比，
   **最大差 0**。
4. 峰谷档：`offPeakAt(DEEPSEEK_OFF_PEAK, …)` —— 周一 10:00 北京 = `false`（峰）、周一 13:00 北京 = `true`、
   周六 10:00 北京 = `true`（旧 Adelie 的费率表没有这一档）。
5. 未计价：`catalogEntryFor("modelscope", "Qwen/Qwen3.8-Max").pricing === undefined` —— ModelScope 一行
   有意不写价（基座注释写明理由），服务端对这类引用给 `cost = null` + `hasUncosted = true`。

另外核过基座文件头自己写下的取舍（`model-catalog.ts:40`）：**`deepseek-chat` / `deepseek-reasoner`
这两条旧 Adelie 的 deepseek 条目已被有意排除**（2026-07-24 弃用、AgentHub 无法自动路由），所以
「把旧目录搬过来」反而会搬进两条不能用的行。

### 有意保留的三处差异（都写清理由，不改）

1. **Qwen 两组的 `envKey` 是 `OPENAI_API_KEY`，不是 `DASHSCOPE_API_KEY`**：基座的网关组记 `OPENAI_*`
   是因为 AgentHub 的通用客户端读的就是它（`model-catalog.ts:148-155` 的注释说明），旧 Adelie 那个名字
   改不过去 —— 要改就得动依赖的读取面，属「不引入新依赖 / 最小改动」之外的事。影响：只导出了
   `DASHSCOPE_API_KEY` 的部署，Qwen 组的 key 要走项目配置里填。Kimi 的 `MOONSHOT_API_KEY` 两家同名。
2. **人民币牌价按固定 7:1 换成 USD 存**（`cny()`），显示时再按用户设置的货币换回来
   （`web/src/features/models/models-page.tsx:196`）；旧 Adelie 的取舍是「不换算、干脆留空」。这是
   「价格是数据」的另一种表述，改它等于改整册 179 行的存法，不做。
3. **没有用户级 `.env`**（旧 Adelie 的 `config/user-env.ts` 读 `~/.adelie/.env` 的 `PROVIDER_ENV_KEYS`）：
   基座的 `.env` 属于**用户自己的工作目录**（`PORT` 那类会被用户的项目 `.env` 抢先，这是有意设计，
   见 `core/src/environment/tools/command/session-manager.ts:46`），凭证的正路是项目配置与 Agent 密钥库。
   要「接回」等于新造一套读取语义，零功能收益，不做。**这一条如果用户想要，是新的待办，不是这一条的尾巴。**

### 收尾：提交、验证与汇报

- 改动只有两份台账文档（`FORK.md` + `FORK-PROGRESS.md`），没有源代码改动 —— 因此没有 `changelog/unreleased`
  条目（5.7 的口径是「一个功能提交带一条」）。
- **门禁**：六包 `typecheck` 全过（core / server / web / ui / cli / hmr，server 那步照例带 `gen:ifaces`）。
- **测试**（虽然是文档改动，按纪律照跑）：core **1359 通过 / 5 跳过**（64 文件）· ui **1003**（127）·
  cli **506**（34）· web **2899 / 2 跳过**（236）· server **182 文件 / 2625 通过 / 4 跳过** ·
  hmr 无测试文件（`vitest run --passWithNoTests`）—— **0 失败**，整条命令 `EXIT=0`。
- **没有起服务、没有动的端口**：本轮没有界面改动，不需要 Playwright，也没重建 `packages/web/dist`。
- **推送**：`git push origin main` —— 本轮那一笔是 `eeada99c`（两份台账同一个提交，表格里引用的就是它），
  其后几笔都只动这份台账。
  按纪律没有切版本号、没发 npm、没发安装包、没发发布汇总邮件。**CI（`ci.yml` 对 main 的推送照常触发，
  只动 `*.md` 也不例外）**：`3449c936` 的 run `37565929530` **22 个作业全绿**（`not success: []`）。
- **汇报邮件：这轮发出去了（修掉了连着四轮的卡点）**。开工自检时 vault 里那条 `CSU_MAIL_AUTHCODE` 仍被
  邮箱拒（`mail.py check` 报 IMAP `LOGIN Login error or password error`；第十轮 / 第十一轮 / 第十三轮
  都卡在这里，当时按纪律只自检一次、没有重试）。**找到的线索**：「已发送」里今天 09:07（#114）还有一封
  同一邮箱、由另一条巡台线发出的汇报（`Adelie 自进化 2026-10-07…`），说明链路当时是通的 —— 卡住的是
  **本项目密钥库里那一条值**，不是邮箱关掉了第三方客户端。所以本轮按技能写明的**起点**做了一次 CAS 引导
  （用 `/root/Adelie_develop/csu-mail-cas-bootstrap.sh`，账号密码取密钥库里已有的统一身份认证那一对
  `CSU_ZHXG_ACCOUNT` / `CSU_ZHXG_PASSWORD`，与每日打卡用的是同一套）：**一次登录**换 sid → 生成一条名为
  `agent-server-2` 的新专用密码 → 写回 `--project-id sjaaj --agent-id default_agent`，再用 `SECRET_OUT`
  的 600 副本把本轮的汇报当场发出去（`SMTP 已投递` + 「已发送」#116，副本已 `shred`）。旧的
  `agent-server` 那条**没有删**（删不删由用户定）。下一个新会话起，注入的就是这个新值。

## 第十五轮：用量与成本页判定上游已覆盖（2026-10-07，条目 3.3）

一次无人值守的自主推进。开工时 `git status --short` 干净、`main` = `origin/main` = `fa8b3f4e`，
`git fetch origin && git merge --ff-only origin/main` 报 `Already up to date`。

**最靠前的未勾选条目是 2.2c**，但它「还差什么」那三条仍全在本轮纪律之外：写侧只剩
`packages/desktop/**`（本轮明写「不要碰 desktop / electron」）、既有部署单元 `adelie-app.service` 的变量名
（发布动作）、桌面壳自己的开关（与它同一批）。非桌面壳、非发布面的部分已在第十一轮 / 第十三轮收干净。
所以按第十二轮 / 第十四轮的先例跳过它，做**下一条可做的 3.3**。本轮**没有改代码**，没有切版本号、
没发 npm、没发安装包、没发发布汇总；`legacy/main`、`/root/Adelie` 工作区、`/root/penguin-harness`、
3003 / 3004 / 4000 全程没碰。

### 判据与结论

`FORK.md` 第 3 条给这一条的判据是「接回 Adelie 已经做过的东西，**或判定上游已经覆盖、直接删**」。
逐条核完的结论是**上游已覆盖 —— 没有要移植的代码，也没有要删的东西**：旧 Adelie 的那一页在基座里
不是「有对应物」，而是**同一件事的更大一版**（多出错误面板、四种精度的时序、按 Agent / 按模型的成功率图、
峰谷价、模型页的终身用量、公司模式的工单与预算），而且**双方的第一条原则一模一样**：只落 token、
成本在查询时现算。

### 对照表（旧 Adelie 逐条 → 基座落在哪）

| 旧 Adelie（`origin/legacy/main`） | 基座（`main`） | 判定 |
| --- | --- | --- |
| `GET /api/usage[?from&to&scope=all]`（`server/src/routes/usage.ts`）：**身份级** —— 默认只看自己的会话、管理员 `scope=all`；一次请求给出 `summary`（今天 / 最近 7 天 / 累计）+ `byModel` + `bySession` + 按本地日期的 `series` + `sessionsScanned` / `unreadableSessions`；契约在 `docs/api.md:171-198` | `GET /api/projects/:p/usage`：**项目级**，同样三段 `summary`（today / last7d / total），四个 `groupBy`（date / agent / model / session，session 支持 agentId 下钻），零填充的 `series`（`granularity` = minute / hour / day / week / month），加两条与 `series` 逐点对齐的分组序列与 `errors` 统计；另有 `GET|DELETE /usage/errors`（分页明细 / owner 按当前筛选清空）与 `GET /usage/model-totals`（模型终身用量）。`http/routes/usage.ts:1-16`、`services/usage-service.ts:1-22`、契约 `api/types.ts:3348-3389`、`:3478-3489`、`:3527-3562` | 覆盖（同一条轴线更细，另多两条接口） |
| 三张汇总卡：`SummaryCard today / last7d / total`（`web/src/components/UsagePage.tsx:138-142`，全文件 348 行） | 同样三张卡（今日 / 近 7 天 / 累计，每张 Token / Requests / 成本三行）+ Agent / 模型 / 日期范围三段筛选（`features/usage/usage-page.tsx:1-25`） | 覆盖 |
| 按模型、按会话**两张表** + 手写 inline SVG 的一天折线（同一份 348 行的文件） | **2×2 图矩阵**：各 Agent 与各模型的「请求数 + 成功率」、Token 三桶堆叠 + 缓存命中率、成本折线，四张共享一条 x 轴（`features/usage/usage-page.tsx`、`usage-charts.tsx`、`trend-chart.tsx`）。**明细表被图取代**：`usage-page.tsx:206` 的注释写明「the detail table has been removed, superseded by the charts above」，所以 `groupBy` 被固定成 `date` | 覆盖（明细表这一处是差异 2） |
| 每轮的金额写进统计行（`components/TurnView.tsx:57-63`，走 `lib/usage.ts` 的 `costOfUsage`）；`lib/usage.ts` 是**界面侧逐字镜像** core 的算式与价目表 | 每轮**实时**成本 + 会话头部**累计**成本（未计价时带星号）：`features/chat/chat-page.tsx:1042-1075` 用 `getUsage(projectId, { groupBy: "session", agentId })`（`:1060`）取该会话那一行，`lib/header-stats.ts` 决定显示什么；算式只在服务端一处（`requestCostUsd`） | 覆盖（不再需要在界面里镜像一份） |
| 「未定价」用**轮次计数**说：`Totals.unpricedRuns` + 卡上「其中 N 轮未定价，不计入金额」（`core/src/usage/aggregate.ts` 的 `UsageTotals`） | 布尔 `hasUncosted`（`api/types.ts:3353-3354`）+ 卡上一句「* 只计入配置了价格的模型成本」（`lib/strings.ts` 的 `uncostedNote`）；`server/test/usage.test.ts:233` 的用例名钉着这条语义 | 覆盖（粒度不同，见差异 3） |
| 会话级 token 累计「给输入区的上下文环用」——那一轮的**残留** | `features/chat/context-gauge.tsx` 的上下文环：读**最近一次主会话请求**的用量（`chat-input.tsx:785`），压缩之后显示「未知 / —」而不是 0 | 覆盖（语义更准，见差异 4 末尾） |
| 错误只写在设计草稿的二期清单里（「一张 `error_records` + 统计与最近 N 条」） | 已是成品：`error_records` 的统计 + 分页明细 + owner 清空（`http/routes/usage.ts:144-223`、`features/usage/errors-panel.tsx`、`server/test/errors.test.ts`） | 覆盖（超出旧条目） |

### 有意保留的四处差异（都写清理由，不改）

1. **数据来源**：旧 Adelie 每次查询**扫盘上的事件流**，文件头写明「不做第二份真相」
   （`core/src/usage/aggregate.ts`）；基座记账时往 `usage_records` 落一行（`runtime/usage-recorder.ts`、
   `db/schema.ts:98`，并带 `(project_id, date)` 与 `(session_id, ts)` 两条索引）。**原则是同一条** ——
   基座**只落 token、永不落成本**（`server/test/usage.test.ts:76` 的用例名就是
   `token_usage → one row (the request bucket; only Tokens persisted, never cost)`），价格改了历史行的钱
   跟着重算（`:250`「price added later: no pricing at insert time; once configured, queries price it
   immediately」）。差别在代价：基座按索引查一段区间，旧写法每次查询扫一遍会话目录。
2. **成本中心里的「按会话」明细被图取代**（`usage-page.tsx:206`）。**能力没有丢**：`groupBy=session`
   （带 agentId 下钻）仍在 API 里、**仍被用着** —— 会话头部那一行的累计成本与 token 分解就是它
   （`chat-page.tsx:1060`，`server/test/usage.test.ts:283` 钉着分组维度）；跨项目/按工单的钱在公司模式的
   财务页（`features/company/finance-page.tsx`）。**若要在成本中心里看「哪些会话最贵」的排名，那是新的
   一条待办，不是这一条的尾巴。**
3. **「未计价」的粒度**：旧页能说「其中 **N 轮**未定价」，基座只说「**有**未计价的」。要报数得给
   `UsageBucket` 加一个计数字段并让 `usage-service` 统计 —— 契约要动、零功能收益（界面已经有星号与说明，
   而「有未计价就别把钱当准数」这句提醒并不因为知道是三轮还是三十轮而更准），不做。
4. **范围轴线不同，少两个字段**：旧的是**身份级**（默认自己、管理员 `scope=all`），基座是**项目级**
   （项目内的四个维度）；管理员跨项目看钱走公司模式财务页。旧接口的 `sessionsScanned` /
   `unreadableSessions`（「少算了几条要说得出来」）在基座**没有对应物**，因为基座不扫盘 —— 也就没有
   「扫不动」这回事（代价转移到记账那一侧，`usage-recorder` 的用例钉着落库规则）。
   顺带记一句：旧 Adelie 的上下文环原本想要「会话级累计 token」，基座取的是**最近一次请求**的用量
   （`chat-input.tsx:785`）—— 后者才回答「上下文还剩多少」，累计量回答不了（那是账单量）；这是有意
   不同，不改。

### 验证（都不是推测）

- **静态**：六包 `typecheck` 全过（core / server / web / ui / cli / hmr；server 那步照例带 `gen:ifaces`，
  `src/ifaces.json unchanged`，186 接口 / 537 类型）。
- **测试**：core **1359 通过 / 5 跳过**（64 文件 + 1 个 e2e 跳过）· ui **1003**（127 文件）·
  cli **506**（34）· web **2899 / 2 跳过**（236）· server **182 文件 / 2625 通过 / 4 跳过** ·
  hmr 无测试文件（`vitest run --passWithNoTests`，退出 0）—— **0 失败**，整条命令 `EXIT=0`。
  与本条直接相关的用例名逐个点过：`usage-recorder`（只落 token）、「summary cards: today / last 7 days /
  cumulative; Models without pricing flag hasUncosted」、「group aggregation: date … agent/model/session
  dimensions with agentId drill-down」、「price added later…」、「model totals」、「series zero-filled」
  （含周/月/时/分与 DST 两节）、`queryErrors` 分页两节、`web/test/header-stats.test.ts` 的 `costText` /
  `costUncosted`。
- **真浏览器看了一次这一页**（这一条判的就是「这一页有没有那套东西」，所以照旧看了；本轮没有界面改动、
  也没重建 `packages/web/dist`）：`pnpm --filter @lmliheng/penguin-ui-gallery dev --port 7381`
  （我自己起的，看完已停；上游 dev 端口 7372 没占）配 Playwright 打开
  `http://[::1]:7381/app.html?route=/usage&lang=zh` —— 三张卡（今日 63.9k Token / 3 请求 / ¥0.2443，
  近 7 天 2.3M / 89 / ¥2.33，累计 8.5M / 333 / ¥10.73）、四张图（各 Agent 与各模型请求与成功率、
  Token 变化 + 缓存命中率、成本变化）、异常面板（总数 6 / 未预期 1 / 预期内 5 / 最常见 `rate_limited ×1`
  + 明细表头）、Agent / 模型 / 日期范围三段筛选都在，**console 0 error 且无 pageerror**；
  截图 `usage-page.png` 与会话 scratchpad 里的取证脚本 `check-usage-page.mjs`（一次性，不入库）。
- **没有起真服务、没有动的端口**：3003 / 3004 / 4000 / 7364 / 7369 全程没碰；7381 是画廊的开发服务器，
  我自己起的、已停（`ss` 复核不再监听）。

### 收尾：提交、推送与汇报

- 改动只有两份台账文档（`FORK.md` + `FORK-PROGRESS.md`），没有源代码改动 —— 因此没有
  `changelog/unreleased` 条目（5.7 的口径是「一个功能提交带一条」）。
- **推送**：`git push origin main` —— 本轮那一笔是 `d7f2d1ac`（两份台账同一个提交，表格里引用的就是它），
  其后几笔都只动这份台账。按纪律没有切版本号、没发 npm、没发安装包、没发发布汇总邮件。
- **CI**：`ci.yml` 对 `main` 的推送照常触发（只动 `*.md` 也不例外）—— run **`37612133294`**（`d7f2d1ac`）
  **22 个作业全绿**（`NOT SUCCESS: []`，含 `installer-windows`、三个 `runtime` 与四个 `test-windows`）。
- **汇报邮件：发出去了**（第十四轮修好的那条专用密码在这个新会话里已注入）：`mail.py check` 两条都通
  （IMAP 7 个文件夹 / SMTP 登录成功），`send --to 0110230306@csu.edu.cn` 报 `SMTP 已投递` 且
  「已发送」里能查到这一封（#120，19:09 +0800）—— 没有重试、没有走 CAS 引导。

## 第十六轮：左下角账户菜单的用户反馈入口（2026-10-07，用户点单「在左下角加上用户反馈，反馈后台放3003服务」）

### 做了什么

用户这一轮只给了一句话：界面左下角加一个用户反馈入口，提交落到 3003 那台机上的需求箱
（`adelie-design.service`，`POST /api/requirements`，口令走 `x-adelie-key`）。落点选在**账户菜单里加一行**：
那份菜单本身就在左下角，而且展开侧栏的账户行与折叠栏的头像**共用同一份实现**（`user-menu.tsx` 的文件注释
写着「第二份拷贝就是两份菜单漂移的开始」），另起一行会重复、折叠栏也没有位置。

- **服务端**（`packages/server/src/http/routes/feedback.ts`，新）：`GET /api/feedback` 只回
  `{ok, configured}` —— 地址与口令都不出浏览器；`POST /api/feedback` 校验标题非空且 ≤200、正文 ≤20000
  （就是需求箱自己的上限，先判再转发），未配置回 503 `feedback_not_configured`，转发 `{title, detail}` 与
  `x-adelie-key`（配了才带），10s 超时；对方非 2xx → 502 `feedback_rejected`（带状态码、**不转原文**，
  那是写给运维的），连不上 → 502 `feedback_unreachable`；成功从 `item.id` 取编号回 `{ok, id?}`。路由组
  `FeedbackRoutes` 自声明前缀（`auth:"user"`、`order 75`）并登记进 `platform.ts` 的 `ApiModule.children`。
- **配置**（`config.ts`）：新增 `ADELIE_FEEDBACK_URL` / `ADELIE_FEEDBACK_KEY`，启动时校验（必须绝对
  http(s)、不许内嵌凭据、空值按未配）。口令只有自己的变量：写进 URL 会跟着请求行进日志。
- **前端**（`components/account/feedback-dialog.tsx`，新）：挂载时探一次配置，读不到或未配置就把那一行
  整条藏掉 —— 宁可没有入口，也不给一个只会失败的按钮。对话框两栏，标题带红 `*`（必填），「可选」不写进
  标签（`required-mark` 规则）；成功弹提示并带出编号；`feedback_not_configured` 用专门文案，其余失败同一句
  可重试的话。对话框挂在面板**外面**：面板一关子节点就卸载，而这一行是关掉菜单才打开对话框的。
- **画廊与记录**：`packages/ui-gallery` 的 mock 补上这两条路由（否则「每个包装都有路由」那条测试会红）；
  `changelog/unreleased/2026-10-07-feedback-entry{,.zh}.md` 中英双份。
- **测试**：server `test/feedback.test.ts` 11 条（不配后端时报 off 且**一次都不拨号**、提交回 503；配了
  不泄露地址与口令、转发内容与 key、没配 key 不发头、204 无编号也算成功、拒收 → 502 不转原文、连不上 →
  502、空标题 → 400 且不拨号、200/20000 边界内通过、未登录 → 401）；web `test/feedback-dialog.test.ts`
  8 条（静态渲染：关着不画任何东西、两栏与文案、标题的红 `*` 只有一个、两处 `maxLength`、标题为空时提交
  不可用而取消可用、英文界面说英文；外加失败文案的两个分支）。

### 验证（都不是推测）

- **四道门禁**：`pnpm lint` **0 警告 0 错误**（2058 文件）、`pnpm format:check` 干净、
  `pnpm typecheck` 八包全过（含四个沙箱插件）、`pnpm -r test` **8961 通过 / 16 跳过 / 0 失败**：
  docs 62 · ui 1003 · core 1359 + 5 跳过 · server 2636 + 4 跳过（183 文件）· cli 506 ·
  web 2907 + 2 跳过（237 文件）· desktop 286 · ui-gallery 131 · 四个沙箱插件 71（+5 跳过）。
  两个新文件都在里面，`✓ test/feedback.test.ts (11 tests)` / `✓ test/feedback-dialog.test.ts (8 tests)`。
- 首跑 `format:check` 报三个服务端文件、`required-mark` 报 `feedback.detailLabel`（详细说明写成「（可不填）」/
  「(optional)」）——都当场改掉：字段是否必填由红 `*` 说，标签与占位符里不写「可选」。
- **真浏览器跑了一遍这一行**（这一条判的就是「左下角点得到、点了有得填」，所以照旧看了）：画廊开发
  服务器（`pnpm --filter @lmliheng/penguin-ui-gallery dev --port 7391`，我自己起的、看完已停；上游 dev
  端口 7372 没占）配 Playwright 打开 `app.html?route=/chat&lang=zh`，点侧栏底部那个账户行 →
  菜单里「用户反馈」在「定时任务」之后（位置 8 < 13）→ 点开对话框：标题字段带**恰一个**红 `*`、
  「详细说明」没有记号、两个标签都不写「可选」、标题为空时「提交」不可用、填了就能提交 → 提交后提示
  「已提交（req-demo-1）」且对话框关闭 → 再打开草稿是空的 → Escape 关得掉。**14 条断言全过、console
  0 error**，截图 `feedback-entry.png` 与脚本 `check-feedback-entry.mjs` 都在会话 scratchpad。
- **提交** `4e79c473`（15 个文件、836 增 3 删），推送到 `origin/main`。CI run **`37622306652`**
  **22 个作业全绿**（`NOT SUCCESS: []`，含 `installer-windows`、三个 `runtime` 与四个 `test-windows`）。

### 把功能滚进现网 7364

口径仍是 2026-10-05 那条：**「更新应用」= commit，攒够阈值才升版本** —— 这一轮的提交数远不到发版线，
所以照上一轮的做法把当前源码构建后原地滚进 `/root/.adelie`，版本号仍是 0.3.3。

- **构建**：复用登记过的那棵干净树（`/tmp/rel-0.3.3`，`git fetch` 后 detached 检出 `4e79c473`，
  `pnpm install --frozen-lockfile` 562ms 全命中），把 `BUILD_DATE=2026-10-07` /
  `BUILD_COMMIT=4e79c473f84614b4e86f9720f0bf8e651f106fda` 盖进 `packages/core/src/index.ts`，然后
  `hmr / core / server / cli / web` 五个包各构建一次。
- **打包**：`pnpm --config.node-linker=hoisted --filter @lmliheng/penguin-cli --prod deploy` → `lib/`、
  `packages/web/dist` → `web/`、`scripts/launchers/penguin` → `bin/penguin`、`build-plugins.mjs` →
  `lib/plugins/`（4 个自带插件），`node/` 沿用现装那份（同 v24.18.0，不必重下 50MB），打成与发布同形的离线
  bundle（`install.sh` + `payload.tar.gz` + `.sha256`）。**注意**：`scripts/package-release-bundles.sh` 要求
  五个 target 的 payload 齐全，本轮只做 linux-x64，所以它跑到 arm64 会报 `missing payload` —— linux-x64
  的成品在此之前已经封好（日志里那句 `Created penguin-linux-x64.tar.gz`），本轮用的就是它。
- **安装**：`PENGUIN_INSTALL_DIR=/root/.adelie sh install.sh --no-modify-path` →
  `Payload checksum OK.` / `Adelie v0.3.3 installed to /root/.adelie`。装好后核过产物里确实带上了这一轮：
  `lib/node_modules/@lmliheng/penguin-server/dist/index.js` 里有 `feedback_not_configured`、
  `web/assets/index-BDmH2BiR.js` 里有「用户反馈」，CLI `--version` = `v0.3.3`、
  `BUILD_COMMIT = "4e79c473f84614b4e86f9720f0bf8e651f106fda"`。
- **配置**：`/etc/systemd/system/adelie-server.service` 在 `ADELIE_HOME` 那行之后加
  `Environment=ADELIE_FEEDBACK_URL=http://127.0.0.1:3003/api/requirements` 与
  `Environment=ADELIE_FEEDBACK_KEY=<48 字符口令>`。口令由脚本从 `/opt/adelie-design-requirements/key.txt`
  读进去、**全程没有打印**（只核了「行只有一条、取值与文件逐字相同、长度 48」），随后 `daemon-reload`，
  再用 `systemctl show -p Environment` 复核两个变量都进了单元（同样不打印取值）。
- **重启**：这一轮的会话就跑在 `adelie-server.service` 的 cgroup 里，直接重启会把会话连同汇报一起掐掉，
  所以照 v0.3.3 那次的手法用 `systemd-run`（瞬时单元 `adelie-live-restart`，自己的 cgroup）跑一个脚本：
  先等 300 秒让本轮写完 → 重启 → 自己核验并写 `/tmp/live-4e79c473-post-restart.log`。结果再由一次性定时
  任务带回本会话（20:54 触发），本节就是那次核验之后补的。

### 现网核验结果（2026-10-07 20:52，脚本实跑，不是复述）

```
is-active: active          MainPID: 2067797（原 1980708）      NRestarts: 0
port 7364: listening       GET / -> 200    GET /healthz -> 200    <title>Adelie</title>
bundle: assets/index-BDmH2BiR.js（新的前端产物）                 CLI: v0.3.3
未带令牌 GET /api/feedback -> 401        GET /api/feedback -> {"ok":true,"configured":true}
POST /api/feedback -> {"ok":true,"id":"req-17"}   需求箱里看得见 req-17，且 archived: True
在办条目仍是 2 条（req-8 / req-15）        数据根 17 个顶层条目        安装残留（.old.* / .staging.*）0
journalctl 起服务后无 warning（脚本里那个计数 1 是 journalctl 的 `-- No entries --` 占位行，人工复核过）
```

- 那条自检提交是**真走了整条路**：由左下角那行背后的同一个 `POST /api/feedback` 提交，服务端带口令转进
  3003，需求箱以 `req-17` 收下（标题写明是自检、无需处理），随即归档 —— 队列内容回到原样。不留这一条就
  无法证明「提交真的到了 3003」，所以留一条已归档的自检是这一轮的取证方式。
- 数据根 `/root/.adelie/data` 顶层条目数与开工前一致、无 `.old.*` / `.staging.*` 残留；`api-token` 按每次
  启动轮换（20:52:07 重签，核验脚本在重启**之后**才读它 —— 上一轮踩过这个坑）。
- 原始日志与三个一次性脚本（构建、打包、重启核验）留在这一个会话的 scratchpad 里。

### 没做的

- `packages/docs/content/configuration.{zh,en}.md` 的环境变量表**没动**：按 2.5 / 2.1c 的既定口径，
  `packages/docs/**` 那套留到发布期那一轮一起改（`config.ts` 的注释仍指向 `/docs/configuration § Environment variables`）。
- 没有切版本号、没有发 npm、没有打发布包、没有发发布汇总邮件。

## 第十七轮：用户与两档角色、会话归属判定上游已覆盖（2026-10-07，条目 3.4）

一次无人值守的自主推进。开工时 `git status --short` 干净、`main` = `origin/main` = `34757951`，
`git fetch origin && git merge --ff-only origin/main` 报 `Already up to date`。

**最靠前的未勾选条目仍是 2.2c**，而它「还差什么」那三条（写侧只剩 `packages/desktop/**`、既有部署单元
`adelie-app.service` 的变量名、桌面壳自己的开关）一条也没变，且本轮纪律明写「不要碰 desktop / electron」；
第十二 / 十四 / 十五 / 十六轮都因此跳过它。所以按同样的先例做**下一条可做的 3.4**
（`FORK.md` 第 3 条的判据是「接回 **或判定上游已经覆盖、直接删**」）。

本轮**没有改代码**（判定为「上游已覆盖」，没有要移植的东西、也没有要删的东西），没有切版本号、
没发 npm、没发安装包、没发发布汇总；`legacy/main`、`/root/Adelie` 工作区、`/root/penguin-harness`、
3003 / 3004 / 4000 / 7364 / 7369 全程没碰。

### 判据与结论

**上游已覆盖 —— 没有要移植的代码，也没有要删的东西。** 旧 Adelie 那套「账号 + 两档角色 + 会话归属」
在基座里都在，而且大多更细：

- **账号**：`users` 表（`user_id` 即登录名、`password_hash`、`is_admin`、`password_is_initial`、
  `display_name`、`avatar`）+ 管理员专用的用户后端（列表 / 新建 / 重置口令 / 删除）；
  没有自助注册。
- **两档角色**：`is_admin` 的两档（内置 `admin` + 其余人），角色在用户管理页与账户行以徽标呈现，
  服务端每一片管理员面都按它拦（403 `admin_required`）。
- **会话归属**：会话在索引里有主，但**归属的轴线是 Project 而不是人** —— `projects.owner_user_id`
  + `project_members`（只存 member 授权），读会话先过 `requireProjectAccess`，看不见的一律
  **404**（`project_not_found` / `session_not_found`，不泄露存在性）。

### 对照表（旧 Adelie → 基座）

| 旧 Adelie（`origin/legacy/main`） | 基座（`main`） | 判定 |
| --- | --- | --- |
| `packages/server/src/users/db.ts`：`users(id, name, password_hash, is_admin, created_at)`；`auth_sessions`（30 天、库里只留 sha256）；`sessions(session_id, user_id, workspace)` 存「谁拥有哪个会话」；`user_settings(user_id, json)` 存每用户运行配置 | `packages/server/src/db/schema.ts:36-58`：`users(user_id, password_hash, is_admin, password_is_initial, display_name, avatar)` + `auth_sessions(token_hash, user_id, expires_at, via)`；`:60-72` `projects(owner_user_id)` + `project_members`（只存 member，owner 不落表）；`:79-96` `sessions(project_id, agent_id, …)` —— **没有 user 列**；`:161` `ui_prefs(user_id, prefs_json)` | 覆盖（归属的轴线从「人」换成「项目」） |
| 两档角色：`is_admin`，且**可升可降、可以有多个管理员** —— `POST /api/users/:id/role`（不能改内置 admin、不能把自己降级），界面上「升为管理员 / 降为普通」（`routes/users.ts`、`web/src/components/UsersPanel.tsx`） | 同样是两档（`is_admin`），用户管理页有「角色」一列（`管理员` / `用户` 徽标）、账户行给管理员带「管理员」徽标；但**只有内置 `admin` 拿得到这一档**（`auth/service.ts` 只在 `seedAdmin` 写 `isAdmin: true`，`services/admin-service.ts` 的 `createUser` 恒为 `false`），**没有任何改角色的路由**（实测 POST / PUT `/api/admin/users/:id/role` 都是 404 `not_found`） | 覆盖；「角色不可授予」是**有意保留**的差异（见下 1） |
| 登录：用户名 + 口令 → Cookie（30 天）；`/api/auth/me` 匿名也答（界面靠它决定显示登录页还是主界面） | 同形（`POST /api/auth/login`、Cookie + `GET /api/me`）；另外每次会话记 `via`（`password` / `desktop` / `setup` / `token`）、30 天**滑动续期**、按用户指数退避限速（不存在的账号也走一次占位哈希，不做账号枚举器） | 覆盖（多出 `via` 与限速） |
| 改自己的口令：`POST /api/auth/password`，没有旧口令时凭「本机身份」放行；管理员重置别人走 `/api/users/:id/password` | `PUT /api/me/password`（要求 `oldPassword`；只有 desktop / setup 会话可免，理由写在 `routes/me.ts:150-160`）；管理员重置走 `/api/admin/users/:userId/password`，并**收回该用户全部会话**（`signOutEverywhere`） | 覆盖 |
| 删除账号：内置 `admin` 不可删、不能删自己（`routes/users.ts`） | 同（`cannot_delete_admin` / `409`），且删除会**连带删掉他拥有的 Project 与数据目录**，会话 / 成员 / 偏好靠外键级联 | 覆盖（连带清理更全） |
| 会话归属：看不见的会话回 **404** 而不是 403（文件头写明「403 等于送对方一个会话枚举器」）；`scope=all` 只有管理员有意义；`syncSessionsFromDisk` 只给管理员扫盘补索引 | 同一条规矩：`services/project-access.ts` 的 `requireProjectAccess` 抛 404 `project_not_found`，会话级路由先按索引找 `project_id` 再过它，索引里没有就是 404 `session_not_found`；**管理员不越过 Project 边界**（`listAccessible` = 自己拥有的 ∪ 被授权的） | 覆盖（归属的口径不同，见下 3） |
| 工作区：**只有管理员**能指定，普通用户在管理员给自己定的那个工作区里建会话（`routes/sessions.ts`） | workspace 是**每个会话**的字段，项目成员自己挑，只校验「存在且是目录」（`services/workspace-guard.ts`：可达性由运行服务的操作系统账户的文件权限决定）；Project 的**工作区默认值与安全策略**归 owner 独占、member 只读（`docs/content/web-app.zh.md:181`） | 有意的取舍差异（见下 4） |
| 每用户分区落盘：非 admin 的会话在 `users/<id>/` 下（`context.ts` 的 `rootForOwner`） | 会话按 `<root>/<project>/agents/<agent>/traces/<session>` 落盘，**每人一份的只有用户级数据**：`<root>/users/<userId>/.vault.toml`（用户密钥库）、`ui_prefs` 行、昵称与头像 | 覆盖（分区键从人换成项目） |
| 每用户的运行配置（`user_settings` JSON：workspace / model / baseUrl / limits / 审批口径） | 分层：Project 配置（模型、默认值、安全策略）、Agent 的 `system_config.yaml`、会话级 `approval_mode`、用户级密钥库与 `ui_prefs` | 覆盖（分层更细） |
| 无自助注册（`routes/users.ts` 是唯一建号入口） | 同：`POST /api/auth/register` → 404（auth 路由组自己兜底），账号由管理员在**用户管理**页创建 | 覆盖 |
| 管理员面整片一份权限表：`packages/server/src/identity.ts` 的 `ROUTE_AUTH` 把 `/api/users` 标成 `admin` | 路由组各自声明 `auth`，管理员面在 handler 入口判 `isAdmin` → 403 `admin_required`（`routes/admin.ts`）；**桌面壳整个拒绝这一片**（403 `desktop_single_user`），理由写在文件头（单用户） | 覆盖 |
| 没有公司模式 | 公司模式里**没有「用户级角色」**：员工是 Agent，用户只有 Project 的 `owner` / `member` 两种（`organization/` 里 role 一词只出现在给 Agent 看的手册文本里） | 覆盖（不引入第二套角色） |

### 有意保留的差异（都写清理由，不改）

1. **只有一个管理员，角色不可改（这一条最实）**。基座的 `admin` 是「这台机器的所有者」这个身份
   （认领链接 / 本机 API token / `penguin server reset-admin-password` 是它的三条进出路），不是一枚
   可以授予出去的徽标：`AdminService.createUser` 恒建普通用户，没有改角色的路由，用户管理页只有
   新建 / 重置口令 / 删除三个动作（本轮实测：`POST`、`PUT /api/admin/users/<id>/role` 都是 404）。
   要「接回」旧 Adelie 的升/降管理员，等于把**用户管理、管理员设置、插件导入、内置浏览器导入**
   这一整片交到第二个人手上 —— 那是安全面的扩张，**要用户拍板**；这一条如果用户要，
   **是新的待办，不是这一条的尾巴**。
2. **没有「回环地址免凭证就是管理员」这条公理**。旧 Adelie 把「能读到 `~/.adelie` 的人就是管理员」
   直接实现成「回环 + 没有 token ⇒ 主机身份（管理员）」，所以单机用户永远不看见登录页；基座把同一个
   事实表达成**两条需要伸手拿的凭证** —— 启动时打印的首次登录链接（认领内置 admin）与本机
   `api-token`（CLI / Agent / 桌面壳用的 Bearer）。差别是同一台机器上别人的浏览器不再自动就是管理员。
   两条路的取舍上游写在 `docs/content/security.zh.md`（「能读到数据根目录，就等于拥有它」那一节）。
3. **没有「全站会话」这一面**：旧 Adelie 给管理员留了 `scope=all`（看所有人的会话）与扫盘补索引；
   基座的项目边界对管理员同样成立（本轮实测：admin 读另一个用户的 Project / 会话都是 404），
   跨项目看钱走公司模式的财务页。**「管理员要不要能看全站会话」如果用户要，同样是新待办。**
   顺带：基座不需要扫盘补索引 —— CLI 采纳的会话带 `client='cli'` 进同一张索引（Trace 才是真相）。
4. **工作区不再由管理员分配**，改成每个会话自己挑（只校验目录存在），默认值与安全策略仍是 owner 独占。
   这让「同一台机器上的多个账号各自开工」不必先找管理员，代价是 workspace 的可达性完全交给运行服务的
   操作系统账户的文件权限（`workspace-guard.ts` 的文件头写明了这个取舍）。
5. **口令下限 8 位**（旧的是 6），账号是**语义 id**（`^[a-z][a-z0-9_-]{1,31}$`，创建后不可改），
   不是旧 Adelie 那种自由用户名；昵称 / 头像是另外两个字段。

### 验证（都是真跑出来的，不是复述）

- **真服务端 + 真请求**（服务端从**当前源码**重建：`hmr → core → server → web` 四包 build，
  因为仓库里的 `dist` 是 10-07 01:24 / web 是 10-06 的旧产物）。起法：

  ```bash
  cd packages/server && ADELIE_HOME=/root/adelie-fork-data/r17-34d ADELIE_PROFILE=dev \
    ADELIE_SEED_ADMIN_PASSWORD=<随机 24 字符，写在 scratchpad，不入库> PORT=7411 \
    node --disable-warning=ExperimentalWarning dist/index.js
  ```

  取证脚本 `verify-34.sh`（会话 scratchpad，一次性不入库）跑完 21 条，逐条都是预期的状态码与码值：
  `admin` 登录 200 / 用户表 `[('admin', True)]` / 建 `tester` 201 且 `isAdmin=False` /
  **改角色 404** / 管理员读别人的 Project 与会话 **404** / 普通用户读用户管理 403 /
  自己改口令 204 且新口令能登录、不带旧口令 400 / 成员加进来之前读那条会话 404、加进来之后 200、
  被移出之后又是 404（会话与项目两级）/ 成员想移除 owner 403 `owner_required` /
  重复建 `admin` 409 `user_exists` / 删内置 `admin` 409 `cannot_delete_admin` /
  `POST /api/auth/register` 404。
- **真浏览器看了一次「用户管理」页**（这一条判的就是「两档角色在界面上成不成立」，所以照旧看了）：
  用 Playwright（`@playwright/test`，本机 chromium）登录 7411 上的真服务端 ——
  管理员在设置里看得到**用户管理**这一节，表格是 `用户名 / 角色 / 创建时间 / 操作`，两行分别是
  `admin`（`初始密码` + `管理员` 徽标）与 `tester`（`用户` 徽标），动作只有 `新增用户` / `重置密码` /
  `删除`，**没有任何改角色的控件**；左下角账户行写着 `admin 管理员`。普通用户那一侧：设置对话框里
  **没有**用户管理这一节（只有个人资料 / 通用 / 外观 / 快捷键 / 账户 / 版权信息），侧栏里也没有
  「机器管理」，console **0 error**。截图 `34-users-page.png` / `34-admin-menu.png` /
  `34-tester-settings.png` 与脚本 `check-34-ui.js` 都在会话 scratchpad。
- **门禁**：六包 `typecheck` 全过（`gen:ifaces` 报 `src/ifaces.json unchanged`，187 接口 / 537 类型）。
- **测试**：core **1359 通过 / 5 跳过**（64 文件）· ui **1003**（127）· server **2636 通过 / 4 跳过**
  （183 文件）· cli **506**（34）· web **2907 / 2 跳过**（237）· hmr 无测试文件 —— **0 失败**。
  本轮没有代码改动，所以没有 `changelog/unreleased` 条目（5.7 的口径是「一个功能提交带一条」）。

### 两个顺带记下来的运行时事实

1. **回环绑定时 App 主机是 `localhost`，`127.0.0.1` 是「预览主机」**：`app.ts` 的 canonical-host
   guard 让预览主机只服务 `/preview/*`，`/api/*` 一律 401「The API is not served on the preview host.」
   —— 本轮第一次起服务就是拿 `127.0.0.1` 调接口，30 条请求全 401，白查了一轮。**下一步的取证脚本一律
   用 `localhost`**（`HOST` 是 `0.0.0.0` 时这条守卫不存在，所以线上 3004 那台不受影响）。
2. **非管理员打开主界面时会看到一条 `/api/projects/<p>/machines` 的 403**：界面探一下这条管理员接口、
   随后把「机器管理」整条入口藏掉（这是设计：普通用户的侧栏里确实没有它），但浏览器控制台会把它记为
   一条 failed resource。不影响使用，也不是这一条的事，留个记录。

### 收尾：提交、推送与汇报

- 改动只有两份台账文档（`FORK.md` + `FORK-PROGRESS.md`），没有源代码改动。
- **推送**：`git push origin main`（`34757951..7d4bc33f`）—— 本轮那一笔是 `7d4bc33f`（两份台账同一个提交，
  表格里引用的就是它），其后只多一笔「把提交号写回表格」的台账提交。按纪律没有切版本号、没发 npm、
  没发安装包、没发发布汇总邮件。
- **CI**：`ci.yml` 对 `main` 的推送照常触发（只动 `*.md` 也不例外）—— 本轮推送的那条 run
  **`37642461974`**（`7d4bc33f`）**22 个作业全绿**（`NOT SUCCESS: []`）。紧接着那笔「把提交号写回表格」的
  推送在同一个并发组里，被 `ci.yml` 的 `cancel-in-progress: true` 取消（它的 head 也是 `7d4bc33f`，
  所以本轮的实际验证对象没有漏）。
- **留了一地的取证现场**：四个一次性数据根 `/root/adelie-fork-data/r17-34{,b,c,d}` 各约 2M，留着没删
  （它们是这一轮的取证现场）；7411 已释放，3003 / 3004 / 4000 / 7364 / 7369 全程没碰。
- **汇报邮件**：照 `csu-mail` 技能发给 `0110230306@csu.edu.cn`。

## 第十八轮：建沙箱前先建 Session scratchpad（2026-10-08，条目 5.4 的第一块）

一次无人值守的自主推进。开工时 `git status --short` 干净、`main` = `origin/main` = `0ab41f4a`，
`git fetch origin && git merge --ff-only origin/main` 报 `Already up to date`。

**选活**：表上最靠前的未勾选条目仍是 **2.2c**，而它「还差什么」那几条（写侧只剩 `packages/desktop/**`、
既有部署单元 `adelie-app.service` 的变量名、桌面壳自己的开关，加上 2.5 口径下有意留到发布期的
`packages/docs/**` 与 changelog）一条也没变；下一条 **3.5 桌面壳**本轮纪律明写「不要碰 desktop / electron」，
**3.6** 要模型 key（新凭证）—— 三条都停在原地。所以按前几轮的先例往下走，做 **5.4 沙箱体系**。

5.4 括注里是**五条上游提交**，这一轮只落地了其中一条：**建沙箱前先建 Session scratchpad**
（上游 `cba091e3`，`#976`）。挑它的理由：这五条里只有它是一条**独立的真 bug**，不依赖同系列的其他提交，
改动面小，而且在本机就能真跑出「修好之前会失败」的证据。其余四条为什么这一轮不做、各自还差什么，
写在条目 5.4 的「还差什么」一栏（Landlock 那条是一组提交的顶端、约 1.5k 行跨四包；权限菜单命名预设
它自己一次就是 6068 增 / 924 删；`sandbox-dsh` 的 Windows 分支本机没有 Windows 可验；后端拆 npm 包
落在 4.1 的发布链路上）。

### 这条 bug 是什么（不是推测，是跑出来的）

`workspace-write` 下，Session 的 scratchpad 以可写方式绑定进沙盒，而它是**懒创建**的（第一次有东西
写入它时才存在）。在它不存在的那段时间里，bubblewrap 会因为 `--bind` 的源路径不存在而**拒绝启动**，
于是这个 Session 的每一条命令、每一个 hook 都起不来。触发它的两条路都很平常：新建的 Session 里
第一条命令、以及 scratchpad 被某条命令 / Agent / 用户删掉之后的每一条命令。删掉它同理（本轮的反证
跑的就是后半条）。

### 改了什么（4 个文件 + 一对 changelog）

- `packages/server/src/sandbox/service.ts`：`confinerFor` 里，受约束的 spawn 之前如果
  `opts.scratchpadDir` 存在就 `mkdir -p` 它（已存在时是 no-op，内容不动）；**建不出来就抛错、
  fail-closed**，错误里点名 scratchpad 与底层 errno —— 不把根悄悄丢掉、让命令在一个它被承诺可写的
  目录上跑。可写根的绑定**收在 `workspace-write` 之内**：其他模式不绑它，所以也不建它。
- `packages/core/src/plugin/sandbox.ts`：`SandboxPolicy.writableRoots` 的契约写进文档 —— 后端收到
  策略时每个可写根在宿主上都已经存在，**后端既不创建它、也不跳过缺失的根**；`workspaceRoot` 不在
  这条契约里（缺 Workspace 是另一个错）。
- 用例：`packages/server/test/sandbox.test.ts` 三条（缺失即建且后端真的看得见 / 建不出来时
  fail-closed 且根本不落到后端 / `workspace-write` 之外不绑不建）＋ `plugins/sandbox-bwrap/test/live.test.ts`
  一条（经**真服务**与**真 bwrap** 连写两次，中间把 scratchpad 整个删掉）。
- `changelog/unreleased/2026-10-08-sandbox-missing-scratchpad{,.zh}.md`（5.7 的口径，中英各一份）。

### 为什么「收在 workspace-write 之内」不改变任何行为

三个原生后端本来就把 `writableRoots` 的读取放在 `mode === "workspace-write"` 之内，DSH 适配器则完全
不读这个字段（这一轮逐个核过）：`plugins/sandbox-bwrap/src/index.ts:131-140`（`policy.mode ===
"workspace-write" ? [workspaceRoot, ...writableRoots] : []`）、`plugins/sandbox-seatbelt/src/index.ts:117-127`
（同一条件）、`plugins/sandbox-wsl/src/profile.ts:132-140`（`if (policy.mode === "workspace-write")` 才
逐个绑定）；`plugins/sandbox-dsh` 全仓 grep 无 `writableRoots`。所以「只在这一档给字段」与「每一档都给
但没人读」对后端是同一件事，换来的是另外两档下不再凭空造出那个目录。

### 移植怎么做的（照上游的设计，不是合分支）

按上游 `cba091e3` 的 diff 手工落到本仓：`packages/core/src/plugin/sandbox.ts` 的 blob 与上游改动前的
`618d8b93` **逐字节相同**，`packages/server/src/sandbox/service.ts` 只差包 scope（上游 `@prismshadow/`
= 我们的 `@lmliheng/`），所以两处源码都是照原样落下来的；测试做了三处本地化 —— 包名换成
`@lmliheng/`、临时目录前缀换成 `adelie-sandbox-svc-`、本仓的 `live.test.ts` 没有上游那份
`scripts/must-run.mjs` 门闸（本仓这一版是 `describe.skipIf(!usable)`），所以新用例直接接在同一个
`skipIf` 之下。

### 验证（都不是推测）

- **六包 `typecheck` 全过**（`gen:ifaces` 报 `src/ifaces.json unchanged`，187 接口 / 537 类型）；
  `pnpm lint` **0 警告 0 错误**（2058 文件）；`pnpm format:check` 干净。
- **测试**：core **1359 通过 / 5 跳过**（64 文件）· cli **506**（34）· ui **1003**（127）·
  server **2639 通过 / 4 跳过**（183 文件，比上一轮 +3，正是新加的三条）· web **2907 / 2 跳过**（237）
  —— **0 失败**。
- **真 bwrap 的 live 套件真的跑了，不是跳过**：`plugins/sandbox-bwrap` 自带 `vendor/`，本机没有系统
  `bwrap` 也照跑 —— `7 passed (7)`，含新加的
  「a command writes to a scratchpad not created yet, or deleted mid-Session」。所以下面这条不是只靠假后端
  得出的。
- **反证（这一轮最关键的一条）**：把 `packages/server/src/sandbox/service.ts` 单独退回改动前的版本
  （先把新版本拷到会话 scratchpad，再 `git checkout -- <file>`），只跑新加的那条 live 用例 ——
  **红了**，报的正是被测的机理：`bwrap: Can't find source path
  /root/penguin-bwrap-scratchpad-…/session-1: No such file or directory`；把新版本拷回去，同一套
  再用例转绿。
- **服务端真起了一次**（这一条动了服务端加载路径，所以照旧起一次看）：按当前源码重建
  `packages/server/dist` 后，
  `ADELIE_HOME=/root/adelie-fork-data ADELIE_PROFILE=dev PORT=7481 node --disable-warning=ExperimentalWarning dist/index.js`
  —— 日志三行对上新根（`Data root: /root/adelie-fork-data`、`web.db`、Web dist 指向仓库里的
  `packages/web/dist`），`GET /` 返 200 且 `<title>Adelie</title>`，随后把进程停掉、7481 已释放。
- **没有改界面，所以没有开浏览器**：本轮只动服务端与插件契约，`packages/web` / `packages/ui` 一个文件
  没碰（web 的 2907 条用例是照常跑的门禁，不是新证据）。

### 没做 / 还差什么

- **5.4 仍未勾掉**：这一轮只落了五条中的第一条，其余四条与各自的理由写在条目 5.4 里。
- **桌面壳那一半（2.2c 的尾巴）**、**3.5 / 3.6** 与前几轮一样停在原地，原因同前（纪律不许碰 desktop、
  3.6 要模型 key）。
- 中间物：会话 scratchpad 里有 `service.ts.fixed`、`smoke-7481.log`；`/root/adelie-fork-data` 是这几轮
  一直在用的取证数据根（这一轮只被那次起服务读过/建过 `web.db` 与一份新的认领链接）。
- `legacy/main`、`/root/Adelie` 工作区、`/root/penguin-harness`、`/root/AgentCode`、3003 / 3004 / 4000 /
  7364 / 7369 全程没碰；没有切版本号、没发 npm、没发安装包、没发发布汇总邮件。

### 收尾：提交、推送与汇报

- **代码提交** `8b257785`（4 个源码/测试文件 + 一对 changelog），台账这一笔另起一笔（表格里引用的
  就是 `8b257785`）。
- **推送**：`git push origin main`（`0ab41f4a..5f6fda5a`）。
- **CI**：`ci.yml` 对 `main` 的推送照常触发，run **`37672552130`** 跑完 —— **22 个作业里 20 个绿**，
  两条红是 `test-macos (server)` 与汇总作业 `ci`。看日志，红的就是**那条已知的 macOS 抖动**：
  `test/workflows.test.ts > a loaded workflow > notices an Agent's FIRST workflow, made with nothing but
  its file tools`（`AssertionError: expected {} to match object { ok: true, … }`，重跑即绿；2026-10-05
  那条记录里 Linux / Windows 两侧都是绿的，同一条）。**与这一轮无关**：那个作业自身也是
  `1 failed | 182 passed (183)` —— 本轮动的 `test/sandbox.test.ts` 在那 182 条里，是绿的。
- **汇报邮件**：照 `csu-mail` 技能发给 `0110230306@csu.edu.cn`。

## 第十九轮：长会话与 Trace 的加载性能（2026-10-08，条目 5.5）

一次无人值守的自主推进。开工时 `git status --short` 干净、`main` = `origin/main` = `6959de3d`，
`git fetch origin && git merge --ff-only origin/main` 报 `Already up to date`。

**选活**：2.2c / 3.5 / 3.6 仍是那三条停住的（写侧只剩桌面壳、桌面壳取哪个要用户定、3.6 要模型 key），
4.1–4.3 与 2.5 按纪律不动。5.4 剩下的四块这一轮**用实测把口径收紧了**（见该条目「还差什么」）：
`234183f5` 落下来在多包冲突、`9b170c61` 压在我们的树里不存在的上游 dock 面板重构上、
`c03e58c4` 的 live 证据要 `windows-latest`、`1ba104c9` 属 4.x —— 所以往下做 **5.5**：
上游 `b8862716` `#958`「长对话与 Trace 文件打开不再卡顿」。它在上游 **main** 上（不是分支）、
自带成套用例、不引新依赖、本机可验。

### 改了什么（39 个文件 / +2576 −646，5.7 的中英 changelog 一对在内）

- **服务端**：新 `services/trace-line-index.ts`（每个 Trace 文件一份**行索引**：记录字节偏移，
  最多缓存 32 个文件，文件增长时增量扩展；事件分页据此一次范围读取，不再每页解析整个文件）；
  新 `services/trace-images.ts` + `GET /api/sessions/:sessionId/trace-image?file=&ordinal=[&i=]`
  （从 Trace 记录里解出 PNG/JPEG/GIF/WebP，不可变、私有缓存、按项目权限校验）；
  分窗历史页（`before` / `tailLimit` 的那条读取）把内联 `data:` URL 换成按引用下发，
  并新增 4 MiB 字节预算收口（一页至少一个 Task、提前收口也带 `before`）；
  `api/types.ts` 的契约文档、`mechanisms/traces.ts`、`http/validate.ts` 跟上。
- **web**：Trace 文件视图改成**按轮次读取** —— 打开文件先取分析（每轮的数字与消息下标范围），
  只读最新一轮的事件、其余轮次点开才读（新 `features/traces/trace-rounds.ts`）；
  被它取代的 `features/traces/trace-events-loader.ts` 与 `test/trace-events-loader.test.ts` **删掉**；
  上下文环改读分析新增的 `modelContextWindow`；对话侧的历史窗口与 `lazy` 图片跟上
  （`lib/omni/stream-{model,controller}.ts`、`lib/session-machines.ts`、`features/chat/*`）。
- **ui**：`ZoomableImage` / 消息与工具卡片加 `lazy`（缩略图接近视口才取，`picture` 那张不预取）。
- **docs / 画廊 / changelog**：`docs/content/{chat,server-api}.{en,zh}.md` 与画廊 mock（分析回传
  `modelContextWindow`）跟上；`changelog/unreleased/2026-10-03-load-performance{,.zh}.md`。

### 移植怎么做的（照上游改动落，不是合分支）

`git apply -3 --exclude=…` 把 `b8862716` 的补丁落到本仓（两个**被删除**的文件整片补丁进不去，
先排除、再按上游 `git rm`；`git apply` 是原子的，一处失败就整片回滚 —— 第一次就是这么被退回来的）。
三处冲突逐一解：

- `server/services/trace-service.ts`：只是 import 区（取上游的两条新 import，名字换成我们的 scope）。
- `ui/.../tool-call-card.tsx`：**我们这一版比上游旧**（上游已把它改成 `DisclosureRow`，我们还在
  内联布局），所以按语义落上游那 3 行 —— 给缩略图加 `lazy`、更新 props 注释，布局一个没动。
- `web/features/traces/trace-file-view.tsx`：import 区（`useLayoutEffect` / `RefObject`）取上游版。
  解完与上游最终版**逐字比对：849 行 / 849 行，只差三处 import 的 scope 名**。

新增文件里 12 处 `@prismshadow/penguin-*` 改成本仓的 `@lmliheng/penguin-*`；本轮新增行里没有
`PenguinHarness` / `PENGUIN_*` 之类需要再本地化的命名（扫过）。`prettier` 说
`trace-images.ts` 不合格式，按仓库格式改掉。

### 验证（都不是推测）

- 六包 `typecheck` 全过（`gen:ifaces` 报 187 接口 / 537 类型）；`pnpm lint` **0 警告 0 错误**（2064 文件）；
  `pnpm format:check` 干净。
- 六包 test（改动定稿后重跑，`EXIT=0`）：core **1359 通过 / 5 跳过**（64 文件）· ui **1003**（127）·
  server **2672 / 4 跳过**（185 文件，比上一轮 +33，正是新加的行索引 / 图片 / 分窗用例）·
  cli **506**（34）· web **2938 / 2 跳过**（239 文件，+31）· hmr 无测试文件 —— **0 失败**。
- **界面真看了一眼**（这一条改了界面，所以照纪律起真服务 + 真浏览器）：按当前源码重建
  `packages/{ui,server,web}/dist` 后，在 **7492** 用一次性数据根 `ADELIE_HOME=/root/adelie-fork-data`
  起服务，用服务端自己打印的认领链接登录（这个根上还没有管理员口令），再用**产品自己的**
  `POST /api/projects/default_project/agents/default_agent/traces/import` 导入一份合成的 Trace
  （3 轮、一条带两张图的工具输出、一条失败的 `exec_command`），然后打开 `/chat/<sid>`：
  - 三个轮次、时间线、图例、全局统计（轮次 3 / 工具调用 2 / 输入 19.8k / 输出 2.8k / 成本 ¥0.0248 /
    输出 TPS 93.3）都渲染出来；
  - **图片按引用真的跑通了**：页面上三张图（用户那张 `ordinal=2` 与工具输出的 `ordinal=6&i=0` /
    `i=1`）的 `src` 全是 `/api/sessions/<sid>/trace-image?…`，**三个响应都是 200**，
    `naturalWidth` 320 / 320 / 120 与生成的两张 PNG 一致（不是破图）；
  - 对话里的工具卡片展开后那两张缩略图（本轮的 `lazy` 改动）与 Trace 面板都取到了同一批引用图；
  - **console 0 error / 0 pageerror / 0 requestfailed**；截图四张在会话 scratchpad
    （`trace-view.png`、`trace-dock-expanded.png`、`transcript-tool-images.png`、`trace-round1-images.png`）。
  - 服务用完已停，7492 已释放；3003 / 3004 / 4000 / 7364 / 7369 全程没碰。

### 没做 / 还差什么

- 5.6（记账时定价）还没动；`feat/usage-cost-at-record-time` 这条**分支在本机已经没有引用**
  （`git for-each-ref | grep -i cost` 为空，`/root/penguin-harness` 这个 upstream 路径也已不存在 ——
  上游提交对象还在本仓里，要拿分支得先想清楚从哪 fetch）。
- 5.4 的另外三块与 2.2c / 3.5 / 3.6 照旧停在原地，理由见各自条目。
- 中间物：会话 scratchpad 里有合成 trace、生成脚本与四张截图；`/root/adelie-fork-data` 是这几轮一直在用的
  取证数据根（这一轮多了一个导入的 Session 与 `bin/penguin`、`web.db`，都是它自己建的）。
- 没有切版本号、没发 npm、没发安装包、没发发布汇总邮件；`legacy/main` 与 `/root/Adelie` 工作区全程没碰。

### 收尾：提交、推送与汇报

- **代码提交**见「已完成的轮次」那一行；台账这一笔另起一笔。
- **汇报邮件**：照 `csu-mail` 技能发给 `0110230306@csu.edu.cn`。

## 第二十轮：用量成本「记账时就定价」的服务端一半（2026-10-08，条目 5.6）

一次无人值守的自主推进。开工时 `git status --short` 干净、`main` = `origin/main` = `93bab95d`，
`git fetch origin && git merge --ff-only origin/main` 报 `Already up to date`。

**选活**：2.2c / 3.5 / 3.6 仍是那三条停住的（写侧只剩桌面壳、桌面壳取哪个要用户定、3.6 要模型 key），
4.1–4.3 与 2.5 按纪律不动；5.4 剩下的四块已经在第十八 / 十九轮用实测收紧了口径，5.5 上一轮做完。
所以按顺序落到 **5.6「用量成本记账时就定价」**。

**上游参考怎么拿的**：`feat/usage-cost-at-record-time` 在本机**没有引用**（上一轮记过：`upstream` remote
指着已不存在的 `/root/penguin-harness`）。这次直接对 GitHub 只读取：
`git ls-remote https://github.com/Prism-Shadow/penguin-harness.git refs/heads/feat/usage-cost-at-record-time`
→ `de051170`，再 `git fetch --no-tags <url> feat/usage-cost-at-record-time`（不配 remote，只落
`FETCH_HEAD`）。分支基线 `691ae72f`（0.2.13），两个提交：`457762fa` 功能、`de051170` changelog 补 PR 链接；
**上游 main 至今没合它**（`gh/main` = `d56d9ced` 仍是查询时定价）。

### 为什么只搬一半（这一轮的核心判断）

上游那条分支是**两侧一起改**的：core 在请求完成时把「这次请求按什么价计费」盖在 `token_usage` 事件的
`pricing` 字段上（`resolveBilledPricing`），服务端把它戳进行；查询时用 `billedRates` 按请求自己的时间戳
推档位。这在他们的树里成立 —— 促销是**目录里**的 `discount` / `discountUntil`，core 看得到。

我们的树不是这样：逐行促销是 **`web.db` 的 `model_promotions` 表**里的一行（`presetPromotions()` 播种，
`project-config-service.getPricing` 折叠），**core 进程读不到它**。若照搬，core 盖上的费率只有文件里的
牌价，会把每一行促销模型按原价计费 —— 比现状更错。所以：**core 那一半整片退回**（`git checkout HEAD --
packages/core packages/web packages/docs`），只搬服务端那一半，并让服务端在**写入时**自己取价
（`getPricing(projectId, provider, modelId, at)`，本来就已经折叠了促销 + 档位）。

完整形态（把促销搬进 project config、与牌价并排存放，再由 core 盖戳）留给用户拍板，理由与选项写进
条目 5.6、本轮 changelog 的「有意未采用」一节，以及汇报邮件。

### 落地（27 个文件冲突，逐一解）

`git diff 691ae72f FETCH_HEAD > cost.patch`（3388 行）→ `git apply -3` → 12 个文件带冲突标记。
服务端与它的用例逐条解：

- `db/migrations.ts`：上游的 `usage-record-cost` 在我们树里要从 version 9 **重编号为 14**（我们最高 13），
  移到数组末尾；那份错位插入的 `{version: 9}` 冲突块删掉，原有的 `model-promotions` v9 保留。
- `db/repos/usage.ts`：按我们的方言重写 —— `insert` 同时写 `cost` / `cost_settled`；聚合对 `cost` 求和、
  数 `uncosted`（原来是按 `PeakTier` 拆行、返回 `peak` 布尔）；新增 `unsettledRefs` / `unsettledRows` /
  `settle` 支撑补算。上游那套 `peakExpr`（把档位写成 SQL）整段删掉：档位现在只在取价时算一次。
- `runtime/usage-recorder.ts`：头注释改成「按 Project 自己存的价在写入时定价，不读事件上的 rates」，
  按自己的时钟时刻调 lookup；取价失败按「无价」处理但照写这一行。
- `services/project-config-service.ts`：`getPricing` 多收 `at`，新增 `scheduledRateAt`（只对**仍存着目录
  高峰价**的行按档位折算 —— 手改过的价在两个档位都按原样计费，减半等于凭空造折扣），再折叠促销。
  这里补了 `offPeakAt` 的导入（typecheck 抓出来的漏网）。
- `services/usage-service.ts`：删掉 `billedRates` / `legacyRates`，`settleUnsettledCosts` 逐行按 `row.ts`
  取价；`lifetimeCost` 改成对已记录成本求和。注释里「与升级前页面显示的一致」这句改成准确的表述：
  促销部分一致，档位改成按行自己（这正是本改动要修的那个两次一天的抖动）。
- `services/trace-service.ts`：`filePricing` 只解析引用，速率改成**按小时记忆化**的取价
  （`provider\0modelId\0hour`）—— 档位边界在目录里都是整点，所以一趟分析每个小时只读一次配置。
- `platform.ts` / `mechanisms/observability.ts` / `mechanisms/projects.ts`：`Startup` 在读完
  displayName 之后调一次 `settleUnsettledCosts()`（失败记 `usage_cost_settle_failed`，不抛）；`UsageQueries`
  加这个方法；`getPricing` 的抽象签名跟上传入 `at`。
- `db/schema.ts` 与 `services/admin-service.ts` 的注释改成新语义（补丁里那两句「成本来自事件携带的费率」
  与「按当前价读」都不成立）。

用例侧除了逐条改冲突，**还修了三处编译/行为问题**（都不是冲突标记，是合并后留下的）：

1. `test/db-migrations.test.ts` 少了一个 `});` —— 上游那段新的 `pre-cost → current` describe 被并进了
   `migration 12 → current` 里面，于是后面所有 describe 都多套了一层（typecheck 报 `TS1005`）。补上闭合。
2. `test/models.test.ts` 的促销用例仍旧断言 `{ peak, offPeak }` 形状（`getPricing` 现在返回单一费率），
   改成传 `PEAK` / `OFF_PEAK` 两个时刻各断言一次。
3. `test/project-config-cache.test.ts` 的四处 `getPricing` 少了 `at` 实参。

`trace-service.ts` 里另有一处**语义**要修：上游的 `pricing !== null` 本来是「这个引用有价吗」（null =
无价），我们改完后 `pricing` 成了「引用解析出来了没」，于是一个没有价格的模型会被画成 0 而不是「没有
价格」。改成由这一趟真正取到的费率决定 `priced`（`cost ??= 0` 挪到收尾处），并把用例补成
「不重算 / 无价即没有 cost 字段」。

### 验证（都不是推测）

- 六包 `typecheck` 全过（`gen:ifaces` 187 接口 / **535** 类型，少的两条正是删掉的 `TieredRates` /
  `PeakTier`）；`pnpm lint` **0 警告 0 错误**（2064 文件）；`pnpm format:check` 干净（补丁先带来两处
  不合格式，已按仓库格式改掉）。
- 六包 test 全绿：core **1359**/5 跳过（65 文件）· ui **1003**（127）· cli **506**（34）·
  server **2682**/4 跳过（185 文件）· web **2942**/2 跳过（239）· hmr 无用例文件 —— **0 失败**。
  新增用例：recorder 的「按自己的时刻取价，同一份高峰价在 20:00 计半价」、服务的
  「查询只加总、总价不随时钟移动」、settle 段整段按新语义重写。
- **端到端（真库、真迁移、真补算）**：把一直在用的取证数据根复制一份
  （`/root/adelie-fork-cost-r20`，库里 `user_version` 13、`usage_records` **没有** cost 列 —— 就是升级前的
  形态），往里写 5 条旧式行（4 条 `deepseek/deepseek-flash` 分落高峰 / 半价两组、1 条无价模型），
  按当前源码重建 `packages/server/dist` 后在 **7493** 起真服务：
  - 迁移跑到 **14**，两列就位；启动补算给每行按**它自己时间戳**的档位定价：高峰 **9.142825e-6**、
    半价 **4.571415e-6**、无价 **NULL**，全部 `cost_settled = 1`，累计 **2.742848e-5**（= 2 峰 + 2 半价）。
  - 真浏览器（认领链接登录）打开 `/usage`：三张卡片 345 tokens / 3 requests / ¥0.0001（近 7 天口径，
    与「累计」卡片同范围 —— 那是基座原有口径）、按模型图里 DeepSeek V4.1 Flash 与 m-unpriced 两条、
    成本变化图有数；**console 0 error / 0 pageerror / 0 requestfailed**，截图
    `cost-center.png` 在会话 scratchpad。
  - **反证一（不重算）**：把磁盘上 `deepseek-flash` 的价改成两倍再重启，5 条已结算行的成本**一个都没动**。
  - **反证二（补算用的是当前价）**：再手插一条未结算行（同 100/10/5、高峰时刻），重启后补算成
    **1.828565e-5**（正好 2 × 9.142825e-6）。
  - 服务用完已停，7493 已释放；3003 / 3004 / 4000 / 7364 / 7369 全程没碰。

### 没做 / 还差什么

- **core 那一半是有意不做的**，不是漏做：`token_usage.pricing` 戳记、`resolveBilledPricing` / `billedRates`、
  目录的 `discountUntil` / `discountRateAt` 一律没搬。要完整形态得先把促销从 `web.db` 搬进 project config
  （与牌价并排，有历史可依），再由 core 盖戳 —— **等用户拍板**。
- 5.4 的另外三块与 2.2c / 3.5 / 3.6 照旧停在原地，理由见各自条目。
- `packages/server/src/ifaces.json` 是 `.gitignore` 的（重新生成过，但不入库）。
- 中间物：会话 scratchpad 里有 `cost.patch`、两侧的 `usage.test.ts` 对照、`cost-center-evidence.js`、
  `cost-center.log` 与 `cost-center.png`；`/root/adelie-fork-cost-r20` 是本轮的取证数据根（复制品）。
- 没有切版本号、没发 npm、没发安装包；`legacy/main`、`/root/Adelie`、`/root/adelie-fork-data` 全程没碰。

### 收尾：提交、推送与汇报

- **代码提交** `6c30e14a`（见「已完成的轮次」那一行）；台账这一笔另起一笔。
- **汇报邮件**：照 `csu-mail` 技能发给 `0110230306@csu.edu.cn`，里面点了那个待拍板的卡点。

## 第二十一轮：sandbox-dsh 在 Windows 上拒绝 bash 并点名它要哪个 shell（2026-10-08，条目 5.4 的第三块）

一次无人值守的自主推进。开工时 `git status --short` 干净、`main` = `origin/main` = `20bc647c`，
`git fetch origin && git merge --ff-only origin/main` 报 `Already up to date`。

**选活**：表上最靠前的未勾选条目仍是 **2.2c**，它的「还差什么」自第十三轮以来一条没变（写侧只剩
`packages/desktop/**`、既有部署单元 `adelie-app.service` 的变量名、桌面壳自己的开关，外加 2.5 口径下
有意留到发布期的 `packages/docs/**` 与 changelog）；下一条 **3.5 桌面壳**是「取上游那个还是旧 Adelie
那个」的用户拍板项，纪律也明写不要碰 desktop / electron；**3.6** 要模型 key（新凭证）。三条都停住，
于是按前几轮的先例往下走 **5.4 沙箱体系**。5.4 剩下的三条里，`234183f5` 是一组提交的顶端（第十九轮
实测多包冲突）、`9b170c61` 压在我们树里不存在的上游 dock 面板重构上、`1ba104c9` 属 4.x 的发布链路；
**只有 `c03e58c4` 是一条自成一体的单提交**（6 个文件 / 328 增），而它原先记的拦路石只是「live 证据
要 `windows-latest`」—— 这一轮实测把这条收窄了（见下），所以做它。

**上游参考怎么拿的**：提交对象本来就在本仓（前几轮 fetch 过），`git show c03e58c4` 即可，
`git cat-file -t` 确认；`upstream` 这个 remote 指着已不存在的 `/root/penguin-harness`，本轮没有用它。

### 改了什么（6 个文件 / +336 −6，含中英 changelog 一对）

- **core**（`packages/core/src/plugin/index.ts`）：plugin 入口新增
  `export { sessionShell } from "../environment/tools/command/shell.js";` —— 它是一次进程内解析、
  写在系统提示 `Shell:` 行里的那个 shell，供「封禁取决于跑的是哪个程序」的后端读取；文件头那段
  「这个入口有什么」的注释一并说清为什么它是**宿主**的值、插件为什么必须按命名空间读。
- **`plugins/sandbox-dsh/src/index.ts`**：
  - `MSYS_SHELLS` + `unstartable()`：MSYS 运行时（`msys-2.0.dll`，Git for Windows 与 MSYS2 共用）
    决定哪批程序起不来 —— 那两家自带的 POSIX shell 按名字，以及它们 `usr\bin` 下的任何程序。
  - `assertSessionShellConfinable(shell, platform)`：Windows 上会话 shell 是这类程序就**抛错**，
    错误里写明改法（`ADELIE_SHELL=pwsh`，没有 PowerShell 7 的机器用 `ADELIE_SHELL=powershell`，
    然后重启）；宿主 core 没有这个导出（较旧运行时）时整条检查跳过。
  - `hostSessionShell()`：从**宿主的** core 取会话 shell —— specifier 放在变量里让打包器留给运行时，
    再按命名空间读（静态具名 import 会因旧核没有这个导出而**加载失败**）；取不到就返回 `null`。
  - `assertAclRunnerCanStart(argv, platform, sessionShell)`：交给 runner 之前逐条拒绝；被拒的就是
    会话 shell 时错误点 `ADELIE_SHELL`，不是会话 shell 时（以 bash 启动的 stdio MCP Server）只说
    runner 起不了这类程序。原生程序（`mingw64\bin\git.exe` 之类）放行。
  - `loadDshAdaptor(host)` 多收一个可注入的宿主（平台 + 会话 shell），Windows 上先查再挂载。
- **`plugins/sandbox-dsh/test/windows-shells.test.ts`**（新，96 行）：平台与会话 shell 都是注入的，
  所以**加载检查与两种拒绝在每个平台上都真跑**；文件末尾那段真实 runner 的用例由
  `describe.skipIf` 守（Windows 主机才跑，跑两种 PowerShell 在约束下写工作区内、工作区外被拒）。
- **`plugins/sandbox-dsh/README.md`**：新增「Windows: run command sessions under PowerShell」一节
  （实测矩阵、加载失败的表现、两种逐条拒绝），表格里的设置名换成本仓的。
- **`changelog/unreleased/2026-10-08-sandbox-dsh-windows-shell{,.zh}.md`**（5.7 的口径，中英各一份）。

### 移植怎么做的（照上游的改动落，不是合分支）

`git show c03e58c4 --format="" -- <四个文件> > dsh-shell.patch` → `git apply -3`：
`README.md` 与那个新测试文件干净落地，`core/plugin/index.ts` 与 `dsh/src/index.ts` 各一处冲突 ——
**两处都是 import / 注释区的包 scope**（上游写 `@prismshadow/`、本仓是 `@lmliheng/`），按本仓的
名字解掉。本地化三处：

1. 包 scope `@prismshadow/penguin-core/plugin` → `@lmliheng/penguin-core/plugin`（源码注释里的
   `HOST_CORE` 说明、`HOST_CORE` 常量、测试的 import 三处）。
2. 文案里的 `PENGUIN_SHELL` → `ADELIE_SHELL`：本仓 2.2b 已把这批控制面变量改名，用户照上游那句话去
   设会设到一个**不再生效**的名字上 —— 这不是改写风格，是让改法真的可用（测试的正则、用例名、
   README 表格、`SESSION_SHELL_FIX` 一起改）。
3. 测试的临时目录前缀 `penguin-dsh-shells-` → `adelie-dsh-shells-`（与第十八轮对 bwrap 用例的做法一致）。

**有意偏离上游的一处**：上游那个补丁顺手加了一行 `import path from "node:path";`，但它（在上游与在
本仓）**一处都没用到** —— 本仓 oxlint 不报，仍然删掉，不留死导入。除此之外与上游逐行一致。

### 验证（都不是推测）

- **插件自己**：`typecheck` 过；`pnpm --filter @lmliheng/penguin-plugin-sandbox-dsh test` →
  **2 文件 / 15 通过 / 1 跳过**。新文件 11 条里 **10 条在 Linux 上真跑**（拒绝 bash、`BASH.EXE`、
  `dash.exe`、`C:/msys64/usr/bin/env.exe`；放行 pwsh 与原生 git；只有会话 shell 是 bash 时点
  `ADELIE_SHELL`；Linux 一个都不拦；`loadDshAdaptor({platform:"win32",sessionShell:{command:"sh"}})`
  真抛；`hostSessionShell()` 的四种注入情形），1 条跳过的是 Windows 专属那一整块。
  **`live.test.ts` 的 5 条也在本机真跑绿的** —— 这一条动了 `loadDshAdaptor` 的加载路径，所以它能
  跑起来正说明真实 DSH 链（本机走 Landlock）没有被这次改动碰坏。
- **六包 `typecheck` 全过**（`gen:ifaces` 报 `src/ifaces.json unchanged`，187 接口 / 535 类型）；
  `pnpm lint` **0 警告 0 错误**（2065 文件）；`pnpm format:check` 干净。
- **六包 test 全绿**（`EXIT=0`）：core **1359** / 5 跳过（64 文件）· ui **1003**（127）· cli **506**
  （34）· server **2682** / 4 跳过（185 文件）· web **2942** / 2 跳过（239）· hmr 无用例文件 ——
  **0 失败**，与第二十轮的计数逐项相同（这一轮没有动它们的代码，core 只多一行再导出）。
- **产物侧**（上游说明里那两条，本机复现）：按当前源码重建 `plugins/sandbox-dsh/dist/index.js`
  之后，`HOST_CORE` 仍是变量、`import(HOST_CORE)` 仍是**运行时**导入（decorators 已内联）；
  把这份 `index.js` 单拷进一个**没有 node_modules、解析不到 core** 的目录：模块照样链接
  （`hostSessionShell` 是函数），`hostSessionShell()` 返回 **`null`**。
- **对产物逐例取证**（脚本在会话 scratchpad，`dsh-shell-evidence.mjs`，import 的是 `dist/index.js`
  而不是源码）：bash 在 Windows 上被拒（错误里带 `ADELIE_SHELL=pwsh … ADELIE_SHELL=powershell`）、
  MSYS `usr\bin` 下的程序被拒、pwsh 放行、原生 `mingw64\bin\git.exe` 放行、Linux 上一个都不拦；
  加载检查：Windows + bash **拒**（错误里写明改法）、Windows + pwsh 放行、Linux + bash 放行、
  宿主 core 没有导出（`null`）放行；`loadDshAdaptor` 的产品路径在 Windows + bash 下抛的正是那条
  加载错误；本机（Linux）真实适配器照常加载出 `["fs-write"]`。
- **仍未验的（写清楚，不当成验过）**：真 Windows 主机上 pwsh / Windows PowerShell 在**真实 ACL
  runner** 下确实能写工作区内、工作区外被拒 —— 那要一台 Windows。本机没有，纪律也不许为它装依赖；
  上游那条证据是在 `windows-latest` 上跑的。这一条留在 5.4 的「还差什么」里。
- **没有改界面**（只是插件与 core 的导出），所以没有起服务、没有开浏览器；也没有动任何端口。

### 没做 / 还差什么

- **5.4 仍未勾掉**：这一轮落的是第三块，剩下的 `234183f5`（Landlock，一组提交的顶端）、
  `9b170c61`（权限菜单命名预设，压在树里不存在的上游 dock 面板重构上）、`1ba104c9`（拆 npm 包，
  属 4.x）与各自的理由写在条目 5.4 里。
- **2.2c / 3.5 / 3.6** 照旧停在原地，原因同前（写侧只剩桌面壳、桌面壳取哪个要用户定、3.6 要模型 key）。
- 中间物：会话 scratchpad 里有 `dsh-shell-evidence.mjs` 与 `bundle-only/`（拷进去试产物链接的那份
  `index.js`）；`plugins/sandbox-dsh/dist` 与 `ifaces.json` 是构建产物、本来就不入库。
- `legacy/main`、`/root/Adelie` 工作区、`/root/penguin-harness`、`/root/AgentCode`、3003 / 3004 / 4000 /
  7364 / 7369 全程没碰；没有切版本号、没发 npm、没发安装包、没发发布汇总邮件。

### 收尾：提交、推送与汇报

- **代码提交** `dcb77d05`（4 个源码 / 测试 / README 文件 + 一对 changelog，见「已完成的轮次」那一行）；
  台账这一笔另起一笔。
- **推送**：`git push origin main`。
- **汇报邮件**：照 `csu-mail` 技能发给 `0110230306@csu.edu.cn`。

## 第二十二轮：CI 真正跑沙盒插件的测试、跑不起来就红（2026-10-08，条目 5.4 的第二块）

### 为什么是这一条

台账「待办」里最靠前的一条未勾选是 **2.2c**，但它剩下的「还差什么」本轮逐条复核后全在纪律禁止
的一侧（`packages/desktop` 的写点、既有部署单元 `adelie-app.service`、桌面壳自己的开关），
或明说留到发布期（`packages/docs` 的环境表、`changelog/`）；**3.5** 就是桌面壳（依赖没装、纪律
不许碰）、**3.6** 要模型 key（卡点）、**4.1–4.3** 明令不动。于是按前几轮的做法往下找：
**5.4** 剩下的三条本轮又实测了一遍 ——

```
$ git show 234183f5 | git apply -3 --check -
error: packages/server/src/sandbox/settings-status.ts: does not exist in index
error: packages/web/src/features/settings/plugin-config-field.tsx: does not exist in index
error: packages/web/src/lib/sandbox-backend-prompt.ts: does not exist in index
...
```

—— `234183f5` 与 `9b170c61`（#978 / #975）要改的一批文件本树根本没有，它们是上游那串
「权限菜单预设 + DSH 自带依赖」的前置产物，不是一轮的量（与本台账此前的记录一致）。
这一串里**唯一自立、可整块落地、本机就能真跑验证**的一笔，是紧挨在它们前面的
`e3a9eb66`（#872）—— **CI 从没跑过沙盒插件的测试，而它即使被排上也可能是静默跳过**。
选它做这一轮。

### 这条 bug 是什么（本机实测，不是推测）

1. **没被排上**：Linux 的 `rest` 分片是一串写死的包名（`desktop` / `docs` / `ui-gallery`），
   `plugins/*` 从来没在里面 —— 4 个沙盒后端包（`sandbox-bwrap` / `dsh` / `seatbelt` / `wsl`）
   在 Linux CI 上一条测试都不跑。macOS / Windows 的 `rest` 是「全仓减去 core / server」，所以
   只有 Linux 漏。
2. **跳过了也看不出来**：live 用例先探测宿主能否打开沙盒，打不开就整片 `skip`。GitHub 的
   Ubuntu 机器上默认不允许普通程序建 user namespace（而 `bwrap` 要），就算把包名补上，
   bwrap 的 live 用例也会全部「跳过」，CI 依旧全绿 —— 跳过与通过看不出区别。

### 改了什么（6 个改动文件 + 5 个新文件 + 一对 changelog）

- `scripts/must-run.mjs`（新）+ `scripts/must-run.d.mts`（新）：`mustRun(suite, cannotOpen)`
  一个函数。`ADELIE_MUST_RUN`（逗号分隔，名字两侧空格忽略）里点了名的套件，若宿主开不了就
  **抛错**、错误里原样带上探测给的理由；没点名照旧跳过，拼错的名字当作没点名。类型文件与
  `scripts/esm-cjs-banner.d.mts` 同一套做法，好让被 typecheck 的插件测试能直接 import。
- `.github/workflows/ci.yml`：Linux 的 `rest` 从「一串包名」改成与 macOS / Windows 同形的
  「全仓减去 core / server / web / ui / cli」，build 名单也对齐成 `desktop...,cli...`
  （以后新增的包默认就会被跑到）；矩阵新增 `must_run`，ubuntu 是
  `sandbox-bwrap,sandbox-dsh`、macOS 是 `sandbox-seatbelt,sandbox-dsh`，接到「Unit tests」
  步骤的环境；新增一步「Allow unprivileged user namespaces」
  （`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`，只在 `rest` 分片跑，
  名字刻意不提沙盒）。
- 三个 live 套件（`sandbox-bwrap` / `dsh` / `seatbelt` 的 `test/live.test.ts`）：「能不能开」
  的探测从返回 `false` 改成返回**理由字符串**，结果交 `mustRun()` 裁决；文件头的说明补上
  「除非 `ADELIE_MUST_RUN` 点了它」。
- `plugins/sandbox-bwrap/vitest.config.ts`（新）+ `test/global-setup.ts`（新）：live 套件用
  的正是插件自带的 bubblewrap，构建时会铺、裸跑测试不会 —— 让测试自己铺（`vendorBwrap()`）。
- `scripts/vendor-bwrap.mjs`：`.complete` 标记之外，还要求**每个架构的 `bin/bwrap` 存在且可
  执行**才算「已就位」；被删掉或去掉了可执行位就从缓存重新铺（不联网），构建那边也一起受益。
  附 `scripts/vendor-bwrap.d.mts`（新）。
- `plugins/sandbox-bwrap/src/index.ts`：拒绝理由补上 Ubuntu 的开关（原来只有 Debian 那条
  sysctl）—— 这条正好是本 CI 步骤改的那个开关，运维在沙盒卡片上看到的就是这句话。
- `changelog/unreleased/2026-10-08-ci-ubuntu-runs-plugin-suites{,.zh.md}`（新，中英一对）。

**本地化**：`PENGUIN_MUST_RUN` → 本仓 2.2b 口径的 `ADELIE_MUST_RUN`（我们自己的测试脚手架变量），
包名 `@prismshadow/` → `@lmliheng/`，其余照上游落。

### 验证（都不是推测）

- 四个沙盒插件 `typecheck` 过；六包 `typecheck` 全过（`src/ifaces.json unchanged`）；
  `pnpm lint` **0 警告 0 错误**（2070 文件，比上一轮多 5 个 —— 正是这轮新增的源文件）；
  `pnpm format:check` 干净。
- 六包 test 全绿：core **1359** / 5 跳过 · ui **1003** · cli **506** ·
  server **2682** / 4 跳过 · web **2942** / 2 跳过，**0 失败**。
- `ci.yml` 用仓库自带的 `yaml` 解析通过：11 个 job，`rest` 的 `must_run`、四个分片的 `tests`
  与那个 userns 步骤逐字打印核对。
- **正向**（`ADELIE_MUST_RUN=sandbox-bwrap,sandbox-dsh`）：bwrap **25 通过**（live 7 条
  **真跑**、不是跳过）、dsh **15 通过 / 1 跳过**（live 5 条真跑）、没声明的 seatbelt 照旧
  `5 skipped`（这正是「没声明就照旧」的一半）。再按 CI 那条 `rest` 命令真跑一遍（本机按纪律
  略过桌面壳，它依赖没装）：docs · hmr · ui-gallery · 四个沙盒包全部 `Done`，无 `ERR_`。
- **反向**：`ADELIE_MUST_RUN=sandbox-seatbelt` 时**红**，`Exit status 1`，栈指向
  `scripts/must-run.mjs:12` 与 `test/live.test.ts:35`，错误为
  `ADELIE_MUST_RUN requires sandbox-seatbelt, and this host cannot open it: …`。
- `mustRun` 语义逐例打印：`" sandbox-bwrap , sandbox-dsh"`（两侧空格）仍命中、`other` 忽略、
  未声明时返回 `false`、`null` 返回 `true`、变量为空时返回 `false`。
- **vendorer**：把 `vendor/linux-x64/bin/bwrap` 移走，下一次测试打印
  `[vendor-bwrap] linux-x64: vendored` / `linux-arm64: vendored` 并从缓存重新铺好（与移走的
  那份字节一致，未联网）；改成 `chmod -x` 同样重铺；已经就位时再跑一次不打印、不重铺。
- 真跑 loader 拿到 bwrap 的拒绝信息，两个发行版的开关都在；`platform: win32` 仍返回 `null`
  （不是失败，是「不是本机后端」）。
- 本轮**没改界面**，所以没有起服务、没有开浏览器、也没有动任何端口。

### 没做 / 还差什么

- **5.4 仍未勾掉**：这一轮落的是第二块。剩下的与条目里写的一样 —— `234183f5`（Landlock，
  一组提交的顶端，本轮又实测了它的前置确实不在本树）、`9b170c61`（权限菜单命名预设，压在
  上游的 dock 面板重构上）、`1ba104c9`（拆 npm 包，属 4.x），以及真 Windows 主机上的
  live 取证。
- **2.2c / 3.5 / 3.6** 照旧停在原地，原因同前（写侧只剩桌面壳、桌面壳取哪个要用户定、
  3.6 要模型 key）。
- **CI 上的结论已经看到（推送后那一跑）**：`8f0e0d8f` 的 run `37768392859` **22 个 job 全绿**。
  取 Ubuntu 的 `test (rest)` 日志逐行核对：作业里跑的正是新加的
  `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`（回显 `… = 0`），测试步骤的环境是
  `ADELIE_MUST_RUN: sandbox-bwrap,sandbox-dsh`；`plugins/sandbox-bwrap` `✓ test/live.test.ts (7 tests)`
  —— live 用例在 Ubuntu 上是**真跑**而不是跳过；`plugins/sandbox-dsh` `✓ test/live.test.ts (5 tests)`；
  没声明的 `sandbox-seatbelt` 照旧 `↓ (5 tests | 5 skipped)`。分片整包结果：docs 62 · desktop 286 ·
  ui-gallery 131 · sandbox-bwrap 25 · sandbox-dsh 15+1 跳过 · sandbox-seatbelt 17+5 跳过 · wsl 25，
  日志里 `FAIL` / `ERR_PNPM` 一处都没有。macOS 的 `test-macos (rest)` 也一样：环境是
  `ADELIE_MUST_RUN: sandbox-seatbelt,sandbox-dsh`，seatbelt 22 通过（live 5 条真跑）、dsh live 5 条真跑、
  没声明的 bwrap `7 skipped`。**这同时补上了这个改动此前唯一没验到的一面**（本机不是 Ubuntu 24.04）。
- **汇报邮件没发出去（本轮新出现的卡点，与凭据无关）**：本机到中南大学网段
  `202.197.0.0/16` 现在**整片不通** —— `mail` / `imap` / `smtp` 的 993 / 465 / 443 / 80 全
  超时、ICMP 100% 丢包（`202.197.61.57` / `202.197.72.14` / `202.197.72.100` / `202.197.64.21`
  一并不通），同时 `baidu` / `github` / `npm` 正常，本机 `OUTPUT` 链是 `ACCEPT`、路由也照常
  经网关出去 —— 所以不是本机在拦，是校外那段路或校方一侧。最后一个能查到 CSU 的凭据是
  `csu-padk.service` 的 2026-10-07 22:15 那一跳。邮件正文留在本会话 scratchpad 的
  `mail-round22.txt`，并挂了一个一次性定时任务（2026-10-08 22:00 CST）重发。
- `upstream` remote 指向的 `/root/penguin-harness` **目录已不在**，但上游提交对象仍在本地
  仓库里 —— `git show <commit>` 照常可用，`git fetch upstream` 不可用。
- `legacy/main`、`/root/Adelie` 工作区、`/root/AgentCode`、3003 / 3004 / 4000 / 7364 / 7369
  全程没碰；没有切版本号、没发 npm、没发安装包、没发发布汇总邮件。

### 收尾：提交、推送与汇报

- **代码提交** `0f70719b`（6 个改动文件 + 5 个新文件 + 一对 changelog，见「已完成的轮次」那一行）；
  台账这一笔另起一笔。
- **推送**：`git push origin main`。
- **汇报邮件**：照 `csu-mail` 技能发给 `0110230306@csu.edu.cn` —— **这一轮没发出去**，见上面
  那条卡点（到 CSU 网段的网络不通，与凭据无关）；正文留在 scratchpad，并挂了一次性重发任务。

## 第二十三轮：跨机那批 `fix/machine-*` 小修复里能上的一次上掉（2026-10-08，条目 5.3 的落地顺序①）

一次无人值守的自主推进。**没有切版本号、没发 npm、没发安装包、没发发布汇总**；`legacy/main`、
`/root/Adelie` 工作区、`/root/penguin-harness`、`/root/AgentCode`、3003 / 3004 / 4000 / 7364 / 7369
全程没碰；按本轮纪律**没有碰 `packages/desktop` 与 electron**。

### 为什么是这一条

表上最靠前的未勾选条目照旧是 **2.2c**，但它的「还差什么」这一轮又逐条核了一遍，全在纪律禁止或
明说留到发布期的一侧（`packages/desktop` 的写点、既有部署单元 `adelie-app.service`、桌面壳自己的开关、
`packages/docs` 的环境表与 `changelog/`）；**3.5** 就是桌面壳（要用户拍板取哪个）、**3.6** 要模型 key、
**4.1–4.3** 明令不动。**5.4** 剩下的三块（`234183f5` / `9b170c61` / `1ba104c9`）与 **5.6** 的 core 那一半
（促销要先进 Project 自己的配置）也各自停在前置或拍板上 —— 后两条都排在本条之后。

**5.3 在表上排在 5.4 / 5.6 之前，它自己是 `[~]`，而「跨机评估」一节里把落地顺序写得清清楚楚，
第 1 条就是「`fix/machine-*` 那批小修复：逐个看补丁，能上就上」**。这一轮做的正是这一条：把
`fix/machine-*` 七个分支的尖端逐个 `git apply -3 --check` 过一遍，能上的上，不能上的写清卡在哪。

### 先核出一件事实：「哪些还没上」不能只看提交在不在本仓

`refs/adelie-tmp/*`（下面说的本地临时引用）里那几个分支，`git merge-base --is-ancestor <commit> 18d7c137`
一律是 **no**，看着像「全都没有」。但**内容**早有一条在本树里：`fix/machine-linked-stopped`（`5a7c9d05`）
讲的两件事 —— 机器卡片把「持有 ssh 会话」当成「已连接」、以及插件同步把「路由不存在」的 404 读成
「没有这个 Project」—— 本树的 `48662c0a`（`feat(machines): support the machine connection and
management`，#448）已经一并带上：

```
$ grep -rn "linkedStopped\|refusal404" packages/web/src/features/machines packages/server/src/machines
packages/web/src/features/machines/machines-view.ts:35:  | { kind: "linkedStopped" }
packages/server/src/machines/plugins-sync.ts:84:async function refusal404(api: MachineApi, projectId: string): Promise<string> {
```

同一条也把 `fix/machine-adopted-table`（`5a6a3db9`）的内容带上了（那张表的迁移补列）。所以这一轮
**真正的候选只有两条**，两条都上掉了。

### 上了哪两条（照上游的改动落，不是合分支）

**① `7e1dca63`「机器的服务端比启动它的那条 ssh 会话活得久」**（分支 `fix/machine-server-own-session`）：
`startServerCommand` 在 `command -v setsid` 找得到时（Linux 有，macOS 没有）给启动行加上 `setsid`，
把对端服务端放进**自己的会话**。此前它属于本侧这条 ssh 会话，连接一断（网络抖动、本侧休眠）sshd 会把
会话挂断、对端服务端随之而死；`nohup` 盖不住这件事（服务端自己起的子进程会重置 SIGHUP）。后台任务里
`setsid` 是原地 exec，所以命令打印的 pid 仍是服务端的 pid（就绪探测不受影响）。
**本地化**：`PENGUIN_SETSID` → 本仓 2.2b 口径的 `ADELIE_SETSID`（新写的一行，没有兼容负担）。

**② `a2801c8d`「通往机器的这一跳在浏览器放弃之前作答」**（分支 `fix/machine-hop-answers-in-time`）：
- `transport/socks.ts`：拨号在**应答之前被关掉的通道**上立即失败（OpenSSH 的 `-D` 对「那边没人监听」
  正是这么答的：不回失败码、直接关），握手期限 20s → **8s**（`SOCKS_HANDSHAKE_TIMEOUT_MS` 现在导出）。
  此前握手计时器随 socket 一起停掉，拨号永不落定 —— 等它的请求也永不落定。
- `machines/proxy.ts`：转发的 `GET` / `HEAD` 在 **15s**（含拨号，`FORWARD_ANSWER_TIMEOUT_MS`）内收不到
  响应头，就以 `504 machine_not_answering` 作答并放弃上游请求，机器列表的 `api` 事实记下这次失败；
  **写请求不截断**（写可以合法地慢，截断会让浏览器重发、重复副作用）。响应头一旦到了，body 照常无期限地流。
- **移植范围**：上游那笔同时改到的中继层（`socket-relay.ts`、`event-hub.ts`）与它的用法在本树里
  **根本不存在**，所以只落了这两处，另外把 `machinesProxy()` 的测试钩子
  `options.answerTimeoutMs` 接上（本树是两参签名，上游是五参）。用例也照本树的签名改了两处调用。

两条都配了中英 changelog 一对（`changelog/unreleased/2026-10-08-machine-{server-own-session,hop-answers-in-time}{,.zh.md}`）。

### 没上的三条，各卡在哪（都是 `git apply -3 --check` 跑出来的，不是推测）

| 上游 | 结果 |
| --- | --- |
| `fix/machine-events-redial-a-failed-dial`（`65c08f42`） | `packages/server/src/machines/event-hub.ts`、`machine-sockets.ts`、`test/machines-event-hub.test.ts` **本树没有** —— 它们由上游那条未进 main 的事件流线（`fdb0e10e feat(machines): one event stream per machine`）带来。不是「一轮的量」，是「先决定要不要把那条线搬过来」 |
| `fix/machine-events-attach-a-machine-connected-later`（`d90538c4`） | 同上（`event-hub.ts` 不存在），且 `routes/machines.ts` 有冲突 |
| `fix/machine-linked-stopped`（`5a7c9d05`）· `fix/machine-adopted-table`（`5a6a3db9`） | **内容本树早已有**（`48662c0a` #448），落上去是空操作；后者另在 `db/migrations.ts`、`machines/service.ts` 上冲突 |

顺带一条给以后的人：`fix/model-switch-on-its-machine` 的尖端已经不是跨机的东西了 —— 是
`648e27f1 feat(server,web): the terminal survives a mobile network`（终端文件，`--check` 干净）。
它属于终端那一条线，**不是这一条的活**，这轮没做，也没有为它开条目（要不要做由用户点单）。

### 怎么拿到的这些补丁

`upstream` remote 指向的 `/root/penguin-harness` **目录仍不在**（`git fetch upstream` 不可用），
但 GitHub 可达，所以按分支名直接拉：

```
$ git fetch --no-tags https://github.com/Prism-Shadow/penguin-harness.git \
      refs/heads/fix/machine-server-own-session:refs/adelie-tmp/fix/machine-server-own-session
```

七个分支都拉到本地的 `refs/adelie-tmp/<分支名>`（**不是** remote-tracking 引用，只在本工作树里，
没推、也没改 `origin` / `upstream` 的配置）。下一轮继续做 5.3 时可以直接用；要清就
`git update-ref -d refs/adelie-tmp/<分支名>`。

### 验证（都不是推测）

- 六包 `typecheck` 全过（server 那步打印 `gen-ifaces: src/ifaces.json unchanged (187 interfaces,
  535 types)`）。
- `pnpm lint` **0 警告 0 错误**（2073 文件）；`pnpm format:check` 干净。
- 六包 test 全绿：core **1359 通过 / 5 跳过**（64 文件）· ui **1007**（127 文件）· cli **506**（34 文件）·
  web **2963 / 2 跳过**（241 文件）· hmr 无测试文件 · server **185 文件 / 2690 通过 / 4 跳过**，**0 失败**、
  整条 `EXIT=0`。server 比上一轮多 **8** 条，正是本轮新加的用例数（`machines.test.ts` +2、
  `machines-proxy.test.ts` +3、`machines-transport-socks.test.ts` +3）。
- 新用例逐条点名跑过（`--reporter=verbose` 里的原行）：
  - `startServerCommand > starts the server in a session of its own where setsid exists, so a dropped
    ssh session does not hang it up` ✓ 0ms
  - `startServerCommand > the launched process leads its own session, and $! is its pid (Linux)` ✓ 8ms
    —— 这条**真起一个进程**：把生成的命令换成一个替身程序、`sh -c` 跑一遍，读
    `/proc/<pid>/stat` 的第 6 个字段（session id）断言它等于自己的 pid，然后杀掉。
  - `the report > answers 504 for a read the machine accepts and never answers, and says so` ✓ 155ms
    （真起一个只收不答的上游 http server，断言 504 / `machine_not_answering` / 报告里那句 detail /
    上游这次连接确实被放掉）
  - `the report > does not cut a write that the machine answers late` ✓ 259ms
  - `the report > answers a read at once, in the transport's words, when the session closes the
    channel` ✓ 4ms
  - `dialThroughSocks` 三条：关通道立即失败（用时 < 期限的 1/4）· 「CONNECT 得不到应答」按自己的话
    失败 · `SOCKS_HANDSHAKE_TIMEOUT_MS < FORWARD_ANSWER_TIMEOUT_MS < 20_000` ✓
- 本轮**没有界面改动**（两条移植都在服务端：生成的远端命令与转发/拨号），所以按纪律没有起服务、
  没有开浏览器、也没有动任何端口。
- `git status --short` 开工时干净、`main` = `06d8b0c0`；`git fetch origin && git merge --ff-only
  origin/main` = Already up to date。

### 没做 / 还差什么

- **5.3 仍是 `[~]`**：落地顺序①走完了（能上的上了、不能上的写清了），但 ②「有第二台 Linux 机器时端到端
  跑一次安装/使用/跨机建会话」、③ Windows 侧、④ 公司模式跑在别的机器上 都还没动 —— ②要第二台机器，
  ③要上游把「Windows 上的会话」做进 main，④建立在它们之上。
- **`refs/adelie-tmp/*` 七个引用留在本地**（见上），没推、没改 remote 配置。工作树里没有多余文件。

### 收尾：提交、推送与汇报

- **代码提交 `0b1bec7a`**（6 个改动文件 + 两对 changelog，见「已完成的轮次」那一行）；台账这一笔另起一笔。
- **推送**：`git push origin main` = `06d8b0c0..0b1bec7a`；台账这一笔随后推。
- **汇报邮件没发出去（与凭据无关，第 22 轮同一处卡点）**：本机到中南大学网段 `202.197.0.0/16` 仍整片
  不通 —— 逐个端口试过 `202.197.64.20:993` / `202.197.64.21:465` / `202.197.64.20:443` 全是 FAIL，
  `ping 202.197.64.20` 100% 丢包；`mail.py check` **挂住不返回**（`timeout 120` 杀掉，退出 124，连
  连接都没建成）。凭据本身正常：`CSU_MAIL_ADDR` 21 字符、`CSU_MAIL_AUTHCODE` 16 字符都注入着
  （只打印长度，没打印明文），`getent hosts` 也照常解析。按技能纪律**只这一次、没有重试登录**（登录类
  失败会触发风控）。
  正文留在本会话 scratchpad 的 `mail-round23.txt`，并挂了一个**周期**重发任务
  `csu-mail-round23-retry`（每 6 小时一次，`end_at` = 2026-10-10T12:00:00Z；它同时补发第 22 轮那封
  —— 那封的重试任务已经跑过一轮、同样卡在网络，一次性任务已作废；任务里写明先查「已发送」，确认发过
  就删掉任务文件）。

## 第二十四轮：上游 `main` 上仅剩的那条跨机提交（2026-10-09，条目 5.3 的收尾）

一次无人值守的自主推进。**没有切版本号、没发 npm、没发安装包、没发发布汇总**；`legacy/main`、
`/root/Adelie` 工作区、`/root/penguin-harness`、`/root/AgentCode`、3003 / 3004 / 4000 / 7364 / 7369
全程没碰；按本轮纪律**没有碰 `packages/desktop` 与 electron**（依赖没装、磁盘也没必要为它花）。

### 为什么是这一条

表上最靠前的未勾选条目照旧是 **2.2c**，它的「还差什么」这一轮再核一遍，四条仍全在纪律禁止或明说留到
发布期的一侧：写侧只剩 `packages/desktop`（本轮明令不碰）、既有部署单元 `adelie-app.service` 与桌面壳
自己的开关（都是发布动作）；剩下第四条第 4 项是画廊 mock 的演示路径与 `packages/docs` 的环境表，
按 2.5 / 2.1c 的口径整片留到发布期。**3.5** 是桌面壳取哪个（要用户拍板，且本轮不许碰 desktop）、
**3.6** 要模型 key（卡点）、**4.1–4.3** 明令不动。**5.4** 剩下的三块（`234183f5` Landlock、
`9b170c61` 权限菜单预设、`1ba104c9` 拆 npm 包）这一轮又各核了一遍前置：`234183f5` 是
#975 → #976 → #977 → #978 那条链的顶端（本树缺 #975、#977 两笔，且 #975 压在**上游的 dock 面板重构**
`1eb13325` #961 上）、`9b170c61` 正是压在同一个 dock 重构上、`1ba104c9` 属 4.x；**5.6** 的 core 那一半
等促销搬进 Project 配置（要用户拍板）。所以可动的仍然是 **5.3**，而它的「上游 `main` 里还缺的跨机
提交」是评估里写死的一项：只有 `dd1b931f`（#973）与本轮之前已移植的 `b5a0ae8f`（#962），**这一轮把前者
落掉，这一栏归零**。

### 改了什么（3 个文件 / +40 −29）

上游 `dd1b931f`「test(server): also test machine on Windows」照改动落，不是合分支；**没有本地化要做的
地方**（这笔里一个 `PENGUIN_*` 都没有，脚本里的 `penguin-lane-` 临时目录前缀随桩一起删掉了）：

- `packages/server/test/machines-transport-lane.test.ts`：**不再在 Windows 上整文件跳过**。它此前
  `describe.skip` 的唯一理由是桩 `ssh` 写成了 shell 脚本（`#!/bin/sh\nsleep 0.2`），而 Windows 上
  `execFile` 跑不了 shell 脚本 —— 但 lane 只关心「同一台机器的两条命令先后、不同机器的一起」，**从不看
  子进程是什么**，所以子进程改成 Node 自己：`run(process.execPath, ["-e", "setTimeout(() => {}, 200)"])`，
  连同建临时目录、改 `PATH` 的 `beforeEach` / `afterEach` 一起删掉（第二个用例本来就不需要那个桩）。
- 计时断言从绝对值改成相对值：先预热一次子进程，再量「单跑一个」的用时 `alone`；
  **串行**两条同机器的命令 ≥ `alone + 150ms`（等于在第一个子进程之上再加一个 200ms 的睡），
  **并行**两台机器 < `alone + 180ms`（等于一个子进程的时间加调度噪声）。此前是写死的 380ms ——
  慢跑机的冷启动会把它撞红，改成相对值后冷启动把两个界一起挪。
- `.github/workflows/ci.yml` 的 `test-windows` 注释：把「那些 `process.platform` 守卫在 Windows 上
  **没有测到什么**」写下来，并声明这些**不是保证**——① `machines-transport-session.test.ts` 的桩 `ssh`
  同样是 shell 脚本，真的 Windows OpenSSH 客户端没被量过；② `terminal-stream.test.ts` 只有真 pty
  （无头 ConPTY 会丢控制台、node-pty 会漏 IPC rejection），纯终端套件（`terminal.test.ts`）照跑；
  ③ `plugins/sandbox-dsh` 的 live 套件见它自己的 `TODO(win32)`。
- `packages/server/test/machines-transport-session.test.ts`：加一行注释指向上面那段（与上游同一处）。

### 这笔为什么不带 changelog

5.7 的习惯是「一个功能提交配一对 changelog」，而上游这笔**自己就写着不带**：只改测试与 CI 注释、
无用户可见行为。本仓照办 —— 加一条会凭空造出「用户能看出变化」的暗示。三处注释里点到的文件
（`terminal-stream.test.ts`、`terminal.test.ts`、`plugins/sandbox-dsh/test/live.test.ts` 的
`TODO(win32)`）本树都在，逐条 `ls` / `grep` 核过，不是照抄一句话。

### 验证（都不是推测）

- 六包 `typecheck` 全过（`EXIT=0`，`gen:ifaces` 打印 `src/ifaces.json unchanged (187 interfaces,
  535 types)`，六个 `Done`）。
- `pnpm lint` **0 警告 0 错误**（2073 文件）；`pnpm format:check` 干净（`All matched files use
  Prettier code style!`）。
- 五包 test 全绿、逐包 `EXIT=0`：core **1359 通过 / 5 跳过**（65 文件）· ui **1007**（127）·
  cli **506**（34）· web **2963 / 2 跳过**（241）· server **185 文件 / 2690 通过 / 4 跳过** ——
  **0 失败**。数目与上一轮逐字一致（这笔只动了测试文件本身与一段注释，本就不该有增减）。
- 改到的两个文件点名跑（`--reporter=verbose`）：`the per-machine lane` 两条 +
  `the session` 八条 = **10 通过**；lane 那一条 1193ms、`a failure does not stall the lane behind it` 2ms。
- **改动后的 lane 文件连跑 5 次全绿**（1.51–1.54s），确认那两条计时断言不靠运气。
- **量出断言用的三个数**（临时探针跑 3 轮，跑完即删、`git status --short` 复核没有多出来的文件）：
  `alone` 233 / 236 / 238ms，`serial` 478 / 482 / 474ms（下限是 `alone+150` = 383 / 386 / 388，余量 ~92ms），
  `together` 242 / 239 / 240ms（上限 `alone+180` = 413 / 416 / 418，余量 ~175ms）。两侧都不贴边。
- `ci.yml` 用仓库自带的 `yaml` 解析通过：**11 个 job**，`test-windows` 仍是
  `windows-latest` × 五个分片（core / server-1 / server-2 / server-3 / rest），注释落在 `test-windows`
  的说明块里、`rest` 与 `must_run` 那两处（第 22 轮改的）原样。
- **唯一一面本机没有的**：真 Windows 上这条是不是真的跑起来 —— 本机没有 Windows（按纪律也没装 electron /
  desktop 那一摊），由推送后的 `test-windows (server-2)` 报回来。**已经报回来了，见下**（这一栏因此不是
  空着的：Windows 上真跑、2 条通过）。
- 本轮**没有界面改动**（测试与 CI 注释），所以按纪律没有起服务、没有开浏览器、也没有动任何端口。
- `git status --short` 开工时干净、`main` = `4feb3309`；`git fetch origin && git merge --ff-only
  origin/main` = `Already up to date`。

### 没做 / 还差什么

- **5.3 仍是 `[~]`**：这一轮收掉的是「上游 `main` 上缺的跨机提交」这一栏（现在为零），落地顺序的
  ②「有第二台 Linux 机器时端到端跑一次」、③ Windows 侧、④ 公司模式跑在别的机器上照旧没动 ——
  ②要第二台机器，③要上游把「Windows 上的会话」做进 main（或我们自己评估成本），④建立在它们之上。
- **5.4 / 5.6 的位置没变**：`234183f5` 那条链要连 #975（压在 `1eb13325` dock 面板重构上）与 #977
  一起拿，`9b170c61` 同一个前置，`1ba104c9` 属 4.x；5.6 的 core 那一半等促销搬进 Project 配置（要拍板）。
- `refs/adelie-tmp/*` 七个本地临时引用仍在（第 23 轮拉的），没推、没改 remote 配置；本轮没有新增。

### CI 结论（推送后，`2708a1a1` → `ce30bc1c`）

- run **`37830376191`**（`ce30bc1c`）**22 个作业全绿**。取 `test-windows (server-2)` 的日志逐行核对：
  `✓ test/machines-transport-lane.test.ts (2 tests) 1245ms` —— 这一笔要的正是这一行：**改之前这个文件在
  Windows 上是 `↓ … 2 skipped`，现在真跑**。同一个 run 的 `test-windows (server-1)` 报
  `↓ test/machines-transport-session.test.ts (8 tests | 8 skipped)`，与新写进 `ci.yml` 的那段注释逐字对得上
  （「session 的桩 `ssh` 也是 shell 脚本，Windows 上没量过」）—— 注释说的是实话，不是抄的一句话。
- 前一跑（`a4f838d2` 的 run `37829857048`）被 cancel-in-progress 取消（同组里更晚的那次推送所致，仓库既有
  的并发设置）。再往前第 23 轮 `4feb3309` 的 run `37799350070` 是 **20 绿 + `runtime (macos-latest, --mac)`
  取消 + 聚合 job 红**：那个作业在 macOS 上连步骤都没记下来、是跑机侧的事（本轮的 run 里它绿了），
  与这两轮的改动无关，照着记一笔。

### 收尾：提交、推送与汇报

- **代码提交 `d5ee09f4`**（3 个文件 / +40 −29，见「已完成的轮次」那一行）；台账三笔 —— `a4f838d2`、
  把提交号写回表格的 `2708a1a1`、以及本节所在的这一笔（CI 结论与收尾）。
- **推送**：`git push origin main`，三次分别是 `4feb3309..d5ee09f4`、`d5ee09f4..a4f838d2`、
  `a4f838d2..2708a1a1`，台账这最后一笔再推一次（`2708a1a1..<本笔>`）。**没有切版本号、没发 npm、
  没发安装包、没发发布汇总。**
- **汇报邮件没发出去（第 22 / 23 轮同一处卡点，与凭据无关）**：本机到中南大学网段
  `202.197.0.0/16` 仍整片不通 —— `202.197.64.20:993` 与 `202.197.64.21:465` 两个 TCP 探测都是
  FAIL，`mail.py check` **挂住不返回**（`timeout 90` 杀掉，退出 124、一行输出都没有，也就是连连接
  都没建起来）。凭据本身正常：`CSU_MAIL_ADDR` 21 字符、`CSU_MAIL_AUTHCODE` 16 字符都注入着
  （只打印长度，没打印明文）。按技能纪律**只这一次、没有重试登录**。
  正文留在本会话 scratchpad 的 `mail-round24.txt`；重发任务改成**一个**周期任务
  `csu-mail-retry`（每 6 小时一次，`start_at` 2026-10-09T07:00:00Z、`end_at` 2026-10-12T12:00:00Z，
  一次带齐第 22 / 23 / 24 三封的正文路径与主题、先查「已发送」再补发、发完或确认早已发过就删掉自己），
  原来的 `csu-mail-round22-retry`（一次性，早已跑过且被覆盖）与 `csu-mail-round23-retry` 两个任务文件
  **已删掉**，避免三份任务互相重复发信。

## 第二十五轮：DSH 的 live 套件在 Windows 上真跑（2026-10-09，条目 5.4 的 Windows 取证）

一次无人值守的自主推进。**没有切版本号、没发 npm、没发安装包、没发发布汇总**；`legacy/main`、
`/root/Adelie` 工作区、`/root/penguin-harness`、`/root/AgentCode`、3003 / 3004 / 4000 / 7364 / 7369
全程没碰；按本轮纪律**没有碰 `packages/desktop` 与 electron**。

### 为什么是这一条

开工自检：`git status --short` 干净、`main` = `origin/main` = `8c427c17`，
`git fetch origin && git merge --ff-only origin/main` 报 `Already up to date`。

表上最靠前的未勾选条目照旧是 **2.2c**，它的「还差什么」这一轮再核一遍，四条仍全在纪律禁止或明说留到
发布期的一侧：写侧只剩 `packages/desktop`（本轮明令不碰）、既有部署单元 `adelie-app.service` 与桌面壳
自己的开关（都是发布动作）；剩下第四条第 4 项是画廊 mock 的演示路径与 `packages/docs` 的环境表，
按 2.5 / 2.1c 的口径整片留到发布期。**3.5** 是桌面壳取哪个（要用户拍板，且本轮不许碰 desktop）、
**3.6** 要模型 key（卡点）、**4.1–4.3** 明令不动。**5.3** 的落地顺序 ②③④ 要第二台机器 / 等上游。
**5.6** 的 core 那一半等促销搬进 Project 配置（要拍板）。

**5.4** 这一轮又逐条核了一遍：`234183f5`（#978）与 `9b170c61`（#975）要改的一批文件本树根本没有
（`git show 234183f5 | git apply -3 --check -` 仍报 `packages/server/src/sandbox/settings-status.ts:
does not exist in index` 等），属上游「权限菜单预设 + DSH 自带依赖」那一串的前置；`1ba104c9` 属 4.x。
**剩下来的可做项，正是 5.4 自己「还差什么」里写着的最后一条 —— 「真 Windows 主机上的 live 取证」**
（第二十一轮把 `c03e58c4` 落地时留下、第二十二轮记回来的那一栏）：上游 `82498039`（#974）
把 `plugins/sandbox-dsh` 的 live 套件在 Windows 上从「整文件跳过」改成**真跑**（会话 shell 走 pwsh），
并在 `ci.yml` 里声明它必须跑。这一笔自成一体的两文件改动，是本轮唯一能整块落地、且**本机 + CI 两面都能
真验**的一条，所以做它。

### 改了什么（上游 `82498039` #974，2 个文件 / +92 −61，照改动落、不是合分支）

- `plugins/sandbox-dsh/test/live.test.ts`：
  - **Windows 上不再 `describe.skipIf`**。删掉那段「capability gate 在 Windows 上其实开得了、缺的是一套
    cmd 方言探针」的说明，改成按会话 shell 分两套探针：pwsh 那套用 `Set-Content` / `Get-Content`
    （`$ErrorActionPreference = 'Stop'` + 外层 `try/catch` 拿拒绝文案），POSIX 那套照旧。
  - **`ADELIE_SHELL=pwsh` 在 adaptor 加载之前设好**（core 每个进程只解析一次会话 shell），并在旁边留
    `TODO(win32)`：在 runner 改成起 MSYS bash 之前，被 DSH 封禁的 bash 在 Windows 上仍不保证。
  - **开不开得了多一道壳的条件**：先跑一次 `'pwsh-' + $PSVersionTable.PSEdition`，Windows 上没有 pwsh
    就把「会话 shell 不是 PowerShell 7」这一句当作开不了的**理由**交给 `mustRun()`（所以声明了却在
    没有 pwsh 的机器上跑，是红的、且红得说得清）。
  - 可用性探针从裸 `true` 改成 `process.execPath`（Windows 上裸 `true` 没有 PATH 条目、会被拒）。
  - **背景子进程那条断言补上另一半**：子进程先在工作区内写一个 `bg-inside.txt` 标记，然后才断言
    「工作区外没写成」—— 此前只断言外头没写，一个**从未跑起来的子进程**也能蒙混过关。
  - `DENIED` 的正则补上 .NET 的 `access to the path … is denied`（ACL runner 的方言）。
- `.github/workflows/ci.yml`：Windows 的 `rest` 分片声明 `must_run: sandbox-dsh`，并把
  `ADELIE_MUST_RUN` 接到「Unit tests (vitest)」这一步的环境上（与 ubuntu / macOS 同形）。
- **不带 changelog**：上游这笔自己就没带（只改测试与 CI，无用户可见行为），与第二十四轮 `dd1b931f`
  同一口径 —— 加一条会凭空造出「用户能看出变化」的暗示。

**本地化**（不含这三处就是照抄上游、在本仓读不到或写错）：

1. 探针里设的 `PENGUIN_SHELL` → 本仓 2.2b 口径的 `ADELIE_SHELL`（照上游那句话去设会设到一个**不再生效**
   的名字上，Windows 上等于没设）。
2. `ci.yml` 的 `PENGUIN_MUST_RUN` → `ADELIE_MUST_RUN`、包名 `@prismshadow/` → `@lmliheng/`
   （冲突就发生在 `rest` 分片那三行上：本仓的过滤名是 `@lmliheng/*`，取本仓的、把上游的 `must_run`
   注释与取值并进来）。
3. 测试的临时目录前缀 `penguin-dsh-live-` → `adelie-dsh-live-`（与第十八 / 二十一轮对 bwrap 与 dsh 用例
   的做法一致）。

### 验证（都不是推测）

- 插件 `typecheck` 过；`ADELIE_MUST_RUN=sandbox-dsh pnpm --filter @lmliheng/penguin-plugin-sandbox-dsh test`
  → **2 文件 / 15 通过 / 1 跳过**：`live.test.ts` **5 条在本机真跑**（新加的工作区内标记断言在内）、
  `windows-shells.test.ts` 11 条里 10 条真跑、1 条仍是那块 Windows 专属的 `describe.skipIf`。
- 六包 `typecheck` 全过（`gen:ifaces` 打印 `src/ifaces.json unchanged (187 interfaces, 535 types)`）。
- `pnpm lint` **0 警告 0 错误**（2073 文件）；`pnpm format:check` 干净。
- 五包 test 逐包 `EXIT=0` 全绿：core **1359 通过 / 5 跳过**（65 文件）· ui **1007**（127）·
  cli **506**（34）· web **2963 / 2 跳过**（241）· server **185 文件 / 2690 通过 / 4 跳过** ——
  **0 失败**。数目与上一轮逐字一致（这一笔只动 `plugins/sandbox-dsh` 的测试与 CI 注释）。
- `ci.yml` 用仓库自带的 `yaml` 解析通过：**11 个 job**；`test-windows` 的五个分片里只有 `rest` 带
  `must_run: sandbox-dsh`，它那一步的环境是 `{ADELIE_MUST_RUN: ${{ matrix.must_run }}}`；ubuntu 的
  `rest` 仍是 `sandbox-bwrap,sandbox-dsh` 加 userns 前置步骤、macOS 的仍是
  `sandbox-seatbelt,sandbox-dsh`（第二十二轮那两处原样）。
- **唯一一面本机没有的**：真 Windows 上这套 pwsh 探针是否真跑起来 —— 本机没有 Windows（按纪律也没装
  electron / desktop 那一摊），由推送后的 `test-windows (rest)` 报回来，**结论见下**（两跑都真跑了）。
- 本轮**没有界面改动**（测试与 CI），所以按纪律没有起服务、没有开浏览器、也没有动任何端口。

### 顺手修掉的一处：ACL runner 的用例被 vitest 的 5s 默认切掉（提交 `72a2e112`）

上面那一跑（`c9dc4ee4`）的 Windows `rest` 日志把一件本机看不见的事报了出来 —— **同一份 `plugins/sandbox-dsh`
里，`windows-shells.test.ts` 的 `the real ACL runner (Windows, host-gated) > powershell runs confined`
在那次**第一次**尝试里**超时**了：

```
× the real ACL runner (Windows, host-gated) > powershell runs confined 8611ms
  → Test timed out in 5000ms.
✓ the real ACL runner (Windows, host-gated) > pwsh runs confined 476ms
Exit status 1
##[warning]vitest failed on Windows; retrying once (see the pool-teardown note in ci.yml)
```

重试那一次它过了（`17 passed`），作业因此还是绿的 —— 也就是说这是被 CI 那条「Windows 上重试一次」盖住的
**间歇性红**，不是这一轮改出来的：上一条推送（`8c427c17`，改动之前）同一格是
`✓ the real ACL runner (Windows, host-gated) > powershell runs confined 2647ms`。

根因是这文件自己的一处不自洽：它 spawn 子进程时写着 `timeout: 60_000`，而 vitest 的默认用例期限是
**5s** —— 冷启动的 Windows PowerShell 在受限令牌下本来就可能慢过 5s，那个 60s 于是永远轮不到。
修法（`plugins/sandbox-dsh/test/windows-shells.test.ts`）：给这组用例的 `it.each` 带上第三个参数
`60_000`（与 spawn 的期限对齐），并把「为什么不是 5s」写进注释（附跑机上的两个数）。

**这不是另开的一条活**，是本轮 5.4 那一栏的验证顺手带出来的：它就在本轮认证的那个平台、那个包上，
而且只有真跑 Windows 才看得见 —— 留着它，等于每次 Windows 跑都先红一次再靠重试变绿。上游同一处
也没写期限（`git show d56d9ced:plugins/sandbox-dsh/test/windows-shells.test.ts` 与 `c03e58c4` 的同一段
逐字一致，都是 `it.each([...])("%s runs confined", (shell) => {`），所以这是**我们的**修复，
不属于「跟上游学」。

### CI 结论（推送后两跑）

- **第一次（`c9dc4ee4` 的 run `37857700478`）**：**22 个作业全绿**。取 `test-windows (rest)` 的日志逐行核对，
  本轮要的那一行在：
  `plugins/sandbox-dsh test: ✓ test/live.test.ts (5 tests) 5115ms`，五条用例逐条点名
  （writes inside / write outside denied / background children / read-only / policy per spawn），
  环境是 `ADELIE_MUST_RUN: sandbox-dsh` —— **这条 live 套件在 Windows 上从「整文件跳过」变成了真跑**。
  同一跑里没声明的 `sandbox-bwrap` 仍是 `↓ (7 tests | 7 skipped)`、`sandbox-seatbelt`
  `↓ (5 tests | 5 skipped)`，说明「没声明照旧跳过」这半边也还成立。
- **第二次（`72a2e112` 的 run `37858509262`）**：**22 个作业全绿**，而且 Windows `rest` 这一跑里
  **没有 `Exit status 1`、没有那条重试警告** —— 第一次尝试就过。逐行核对：
  `✓ test/windows-shells.test.ts (12 tests) 3657ms`（`powershell runs confined 2828ms`、
  `pwsh runs confined 533ms`，都在新的 60s 之内）、`✓ test/live.test.ts (5 tests) 5037ms`、
  分片整包 `2 passed / 17 passed`；同一跑的 Windows `core` / `server-1..3` 与其它平台照旧。
- 两跑的其余作业（`test (core)` / `test (server)` / `test (web-cli)` / `test (rest)` / `test-macos (*)` /
  `runtime (*)` / `installer-*` / `typecheck` / `style` / `npm packaging` / `plugin versions` / 聚合 `ci`）
  全是 success，没有一个 `FAIL`。

### 没做 / 还差什么

- **5.4 仍未勾掉**：这一轮收掉的是「真 Windows 主机上的 live 取证」那一栏。剩下三条与条目里写的一样 ——
  `234183f5`（Landlock，链顶端；同串的 `45885985` / #977 是一条很小的文档 + 拒绝文案 + 一条用例的
  前置）、`9b170c61`（权限菜单命名预设，压在树里不存在的上游 dock 面板重构上）、`1ba104c9`（拆 npm 包，
  属 4.x）。
- **2.2c / 3.5 / 3.6** 照旧停在原地，原因同前（写侧只剩桌面壳、桌面壳取哪个要用户定、3.6 要模型 key）。
- `refs/adelie-tmp/*` 七个本地临时引用仍在（第 23 轮拉的），没推、没改 remote 配置；本轮没有新增。

### 收尾：提交、推送与汇报

- **代码提交 `b7933f58`**（`plugins/sandbox-dsh/test/live.test.ts` + `.github/workflows/ci.yml`，
  +94 −63）与 **`72a2e112`**（`plugins/sandbox-dsh/test/windows-shells.test.ts`，超时对齐，见上一节）；
  **台账三笔**：`c9dc4ee4`（本节所在的这一轮记录）、把提交号与 CI 结论写回表格与本节的那一笔、
  以及最后一笔收尾。
- **推送**：`git push origin main`，三次分别是 `8c427c17..c9dc4ee4`、`c9dc4ee4..72a2e112`、
  `72a2e112..<本笔>`。**没有切版本号、没发 npm、没发安装包、没发发布汇总。**
- **汇报邮件没发出去（第 22 / 23 / 24 轮同一处卡点，与凭据无关）**：本机到中南大学网段
  `202.197.0.0/16` 仍整片不通 —— `202.197.64.20:993` 与 `202.197.64.21:465` 两个 TCP 探测都是 FAIL，
  `imap.csu.edu.cn:993` / `smtp.csu.edu.cn:465` 同样 FAIL（DNS 照常解析到 `202.197.64.20/21`），
  同时 `api.github.com` 200；`mail.py check` **挂住不返回**（`timeout 60` 杀掉，退出 124、一行输出都没有，
  也就是连连接都没建起来）。凭据本身正常：`CSU_MAIL_ADDR` 21 字符、`CSU_MAIL_AUTHCODE` 16 字符都注入着
  （只打印长度，没打印明文）。按技能纪律**只这一次、没有重试登录**。
  正文留在本会话 scratchpad 的 `mail-round25.txt`；把第 25 轮的正文路径与主题**加进**既有的周期重发任务
  `csu-mail-retry`（现覆盖第 22 / 23 / 24 / 25 四封，每 6 小时一次、`end_at` 2026-10-12T12:00:00Z、
  先查「已发送」再补发、发完就删掉自己），没有另开新任务。

## 第二十六轮：Ubuntu 上的 user namespace 那一步成文（2026-10-09，条目 5.4 的前置之一）

一次无人值守的自主推进。**没有切版本号、没发 npm、没发安装包、没发发布汇总**；`legacy/main`、
`/root/Adelie` 工作区、`/root/AgentCode`、3003 / 3004 / 4000 / 7364 / 7369 全程没碰；按本轮纪律
**没有碰 `packages/desktop` 与 electron**。

### 为什么是这一条

开工自检：`git status --short` 干净、`main` = `origin/main` = `872d18f0`，
`git fetch origin && git merge --ff-only origin/main` 报 `Already up to date`。

表上最靠前的未勾选条目照旧是 **2.2c**，它的「还差什么」这一轮再核一遍，四条仍全在纪律禁止或明说留到
发布期的一侧：写侧只剩 `packages/desktop`（本轮明令不碰）、既有部署单元 `adelie-app.service` 与桌面壳
自己的开关（都是发布动作）；剩下第四条第 4 项是画廊 mock 的演示路径与 `packages/docs` 的环境表，按
2.5 / 2.1c 的口径整片留到发布期。**3.5** 是桌面壳取哪个（要用户拍板，且本轮不许碰 desktop）、
**3.6** 要模型 key（卡点）、**4.1–4.3** 明令不动、**5.3** 的落地顺序 ②③④ 要第二台机器 / 等上游、
**5.6** 的 core 那一半等促销搬进 Project 配置（要拍板）。

**5.4** 剩下的四条这一轮又逐条核了一遍，其中三条这一轮走不通：`234183f5`（#978，Landlock）与
`9b170c61`（#975，权限菜单命名预设）要改的一批文件本树根本没有（`packages/server/src/sandbox/
settings-status.ts`、`packages/web/src/features/chat/builtin-dock-panels.tsx` 都在上游那套「dock 面板
重构」`1eb13325` `#961` 之后才出现），`1ba104c9`（后端拆 npm 包）属 4.x。**唯一还能整块落地的，就是这一
串里排在已落地的 `cba091e3`（#976）之后、本树还没有的那一笔：`45885985`（#977）** —— 它只动
`plugins/sandbox-bwrap` 的两处与 CLI 快速开始，无界面逻辑改动，而且**本机就能真验**（文档站起起来看
一眼、插件用例真跑）。所以做它。

### 改了什么（照上游 `45885985` `#977` 落，不是合分支；7 个文件 / +119 −2）

- `packages/docs/content/quickstart-cli.zh.md` / `.en.md`：**新增「Ubuntu 上的沙盒」一节**（`###`）——
  默认 Ubuntu 24.04 的 `kernel.apparmor_restrict_unprivileged_userns=1` 与后端的启动检查失败
  （`setting up uid map: Permission denied`）、只需做一次的 root 步骤（一份 AppArmor profile，
  `abi <abi/4.0>` + `userns,`，落在 `/etc/apparmor.d/adelie-sandbox-bwrap`）、profile 的路径模式
  `@{HOME}/.adelie/**/plugins/node_modules/@lmliheng/penguin-plugin-sandbox-bwrap/vendor/linux-*/bin/
  bwrap`（`**` 覆盖这个包在数据根父目录下可能被解压到的每个位置：安装目录随包带的、下载到数据根目录
  的、热推送携带的），以及两种替代做法（在沙盒卡片上把「bwrap 程序」换成属于 root 的副本，或
  `sysctl` 全机调低开关）与数据根不在 `~/.adelie` 时的做法。**两处的写法都是照本树实数改的**：
  `~/.adelie/lib/plugins/node_modules/@lmliheng/penguin-plugin-sandbox-bwrap/vendor/linux-x64/bin/bwrap`
  在这台机器的现装上真的存在（`ls` 过），三个前缀的来历分别见 `state/paths.ts` 的
  `userPluginsDir()`、`plugin/loader.ts` 的 `pluginBases()`（`<root>/plugins`、hmr 解包目录、
  启动器上一级的 `plugins/`）。
- `plugins/sandbox-bwrap/src/index.ts`：拒不起基础配置时的理由在 Debian 的开关旁点名 Ubuntu 的开关
  之后，**加上指向这一节的半句**（`see "Sandbox on Ubuntu" in the CLI quickstart`）；上面那段注释补写
  「为什么这一处要给指针」（卡片上的 reason 是运维唯一能看到的东西，而 Ubuntu 这一侧不是翻个 sysctl
  就完事、kernel 要的是一份 profile）。
- `plugins/sandbox-bwrap/README.md`：`Requirements` 里写明 Ubuntu 的要求，并指向 CLI 快速开始那一节。
- `plugins/sandbox-bwrap/test/profile.test.ts`：上游那条「两个开关都点名」的用例照落；**另加一条**
  针对本轮新行为的用例（见下）。
- `changelog/unreleased/2026-10-09-sandbox-ubuntu-userns{,.zh}.md`：一对（上游那对按本仓惯例改名到
  本轮日期、去掉上游 PR 链接、正文改写成「移植自上游 #977 / `45885985`」）。

**本地化（四处，都是照上游原文写会在本仓读不到或写错的）**：① 包名
`@penguinharness/sandbox-bwrap` → `@lmliheng/penguin-plugin-sandbox-bwrap`（4.1 的 scope 改名早已落到
插件包上）；② 路径 `~/.penguin` → `~/.adelie`（2.2a 的数据根与安装目录）；③ 环境变量 `PENGUIN_HOME`
→ `ADELIE_HOME`（旧名仍读，文档里写明这一点；`PENGUIN_INSTALL_DIR` 仍是安装器的真名，照留）；
④ profile 名 `penguin-sandbox-bwrap` → `adelie-sandbox-bwrap`（不撞桌面 `.deb` 会装的
`/etc/apparmor.d/adelie`）。

**一处有意与上游不同**：上游那条新用例只断言两个开关都出现在文案里，而这**两个开关在本树改之前就
已经在文案里**（第二十二轮本地化时补的 Ubuntu 那个）—— 也就是说照抄过来，这条用例对本轮的改动
**一条也验不到**。所以除它之外另加了一条「指针」用例（`Sandbox on Ubuntu`），并实测它在去掉指针的
实现上会红（见「验证」）。多出来的这一条是**我们的**修复，与上游那笔无关。

### 顺手核出的一处：桌面 `.deb` 其实装不了那份 profile（记给 3.5 / 4.x，本轮没动 desktop）

上游那段原文写着「桌面 `.deb` 会为应用装上这样一份 profile，应用启动的 bubblewrap 也在它的覆盖
之内」。本树 `packages/desktop/build/linux/after-install.tpl` 的 postinst 确实会去做这件事：把
`/opt/<product>/resources/apparmor-profile` 复制到 `/etc/apparmor.d/<executable>` 并用
`apparmor_parser --replace --write-cache --skip-read-cache` 加载。但**这份资源全仓没人产出**：
`grep -rn apparmor`（去掉 `node_modules`）在 `packages/desktop` 只命中两份 `.tpl`，
`electron-builder.yml` 的 `files` / `deb` 两段没有它，`.github/workflows/desktop-build.yml` 里也没有
一步写它（`git grep apparmor-profile d56d9ced` 在上游 `main` 上同样只有那份 `.tpl`）。也就是说那份
`apparmor_parser --skip-kernel-load --debug` 会在缺文件的路径上失败、postinst 打印
`Skipping the installation of the AppArmor profile` 然后跳过 —— **桌面壳今天不该被当成 Ubuntu 上的
解法**，所以本轮把这一句去掉了（换成「安装器 / npm / 压缩包 / 容器都以普通用户运行、装不了 profile」）。
要不要给桌面 `.deb` 补上这份资源，属 3.5（桌面壳取哪个）或 4.x（发布链路）；桌面这一摊按纪律本轮
没碰、也没装依赖。

### 验证（都不是推测）

- 插件 `typecheck` 过（`plugins/sandbox-bwrap`）；`pnpm --filter @lmliheng/penguin-plugin-sandbox-bwrap
  test` → **2 文件 / 27 通过**（`profile.test.ts` 20、`live.test.ts` 7），`EXIT=0`。
- **反向取证**（证明新用例验的是本轮改动）：把 `, see "Sandbox on Ubuntu" in the CLI quickstart`
  从源码里去掉后，`-t "points at the documented step"` 点名跑 → **1 失败 / 19 跳过**、`EXIT=1`；
  从备份恢复后 `grep -c "Sandbox on Ubuntu"` 回到 1、整包 27 全绿。
- 六包 `typecheck`：`EXIT=0`，`gen:ifaces` 打印 `src/ifaces.json unchanged (187 interfaces, 535 types)`，
  六个 `Done`（**注意**：本轮任务书写的是 `@prismshadow/*` 过滤名，本仓包名早已是 `@lmliheng/*`，
  照写会得到 `No projects matched`，所以用的是 Adelie 的 scope）。
- `pnpm lint` **0 警告 0 错误**（2073 文件）；`pnpm format:check` 干净。
- 五包 test 逐包 `EXIT=0` 全绿：core **1359 通过 / 5 跳过**（65 文件）· ui **1007**（127）·
  cli **506**（34）· web **2963 / 2 跳过**（241）· server **185 文件 / 2690 通过 / 4 跳过** —— **0 失败**；
  另跑 **`@lmliheng/penguin-docs` 62 通过**（8 文件）—— 本轮改到了它的内容，这一跑是必须的
  （它管着 Markdown 的解析、TOC、hash 解码等）。
- **界面/文档真看一眼**：`packages/docs` 的 `vite` 起在 **7471**（临时起、看完即关，未动
  3003 / 3004 / 4000 / 7364 / 7369），Playwright（本地 chromium）打开 `/quickstart-cli` 的中英两版：
  新标题分别是 `Ubuntu 上的沙盒` / `Sandbox on Ubuntu`，**id 分别是 `ubuntu-上的沙盒` /
  `sandbox-on-ubuntu`**（与仓库自己的 `slugifyHeading` 现算的结果一致）；节内链接
  `/settings#%E6%B2%99%E7%9B%92`、`/settings#sandbox` 指向设置页既有的 `### 沙盒` / `### Sandbox`
  （`/settings` 是文档站自己的页，不是 Web App 的哈希路由）；代码块整段完整（截图里逐行核过，含
  `EOF` 与 `sudo apparmor_parser -r /etc/apparmor.d/adelie-sandbox-bwrap` 那两行）；**console 无 error、
  无 4xx**。截图在 scratchpad（`docs-ubuntu-sandbox-{zh,en}[-full].png`），未提交进仓库。
- 本轮**没有改 Web App 的界面**（改的是文档站内容与插件的一条错误文案），所以没有起服务端、没有动
  3003 / 3004 / 4000。

### 没做 / 还差什么

- **5.4 仍未勾掉**：这一轮收掉的是「这条链上还能整块落地的那一笔」（`45885985` / #977）。剩下的
  三条与条目里写的一样：`234183f5`（#978，要 #975）、`9b170c61`（#975，压在树里不存在的上游 dock
  面板重构上）、`1ba104c9`（拆 npm 包，属 4.x）。
- **2.2c / 3.5 / 3.6** 照旧停在原地，原因同前（写侧只剩桌面壳、桌面壳取哪个要用户定、3.6 要模型 key）。
- 桌面 `.deb` 那份缺掉的 `apparmor-profile` 资源记在上一节，等 3.5 / 4.x。
- `refs/adelie-tmp/*` 七个本地临时引用仍在（第 23 轮拉的），没推、没改 remote 配置；本轮没有新增。

### 收尾：提交、推送与汇报

- **代码提交 `493b9160`**（7 个文件 / +119 −2，见「已完成的轮次」那一行）；台账两笔 —— 本节所在的
  这一笔与把提交号写回表格的那一笔。
- **推送**：`git push origin main`（`872d18f0..493b9160`）。**没有切版本号、没发 npm、没发安装包、
  没发发布汇总。**
### CI 结论（推送后）

- run **`37878494801`**（`09de327f`，含本轮的代码提交 `493b9160` 与台账）**22 个作业全绿**，
  `not success` 一个都没有。取 `test (rest)` 的日志逐行核对：`packages/docs test` 报
  **`Test Files 8 passed (8)` / `Tests 62 passed (62)`**（本轮改到的文档内容就在这一跑里）、
  `plugins/sandbox-bwrap test` 报 **`Test Files 2 passed (2)` / `Tests 27 passed (27)`**，
  其中 `✓ test/profile.test.ts (20 tests) 21ms`、`✓ test/live.test.ts (7 tests) 2358ms`（该作业的
  `ADELIE_MUST_RUN: sandbox-bwrap,sandbox-dsh`，所以 live 套件真跑而不是跳过）—— 与本机那几个数逐字
  一致。
- 前一次推送（代码提交 `493b9160` 自己的 run `37878312234`）被 **cancel-in-progress 取消**（同组里更
  晚的那次推送所致，仓库既有的并发设置），与第二十四轮同一现象；算数的是上面那一跑。

- **汇报邮件没发出去（第 22 / 23 / 24 / 25 轮同一处卡点，与凭据无关）**：本机到中南大学网段
  `202.197.0.0/16` 仍整片不通 —— `202.197.64.20:993` 与 `202.197.64.21:465` 两个 TCP 探测都是
  `TimeoutError`（DNS 照常解析，同时 `api.github.com` 200）；`mail.py check` **挂住不返回**
  （`timeout 60` 杀掉、一行输出都没有，也就是连连接都没建起来）。凭据本身正常：`CSU_MAIL_ADDR`
  21 字符、`CSU_MAIL_AUTHCODE` 16 字符都注入着（只打印长度，没打印明文）。按技能纪律**只这一次、
  没有重试登录**。正文留在本会话 scratchpad 的 `mail-round26.txt`；把第 26 轮的正文路径与主题
  **加进**既有的周期重发任务 `csu-mail-retry`（现覆盖第 22 / 23 / 24 / 25 / 26 五封，每 6 小时一次、
  `end_at` 2026-10-12T12:00:00Z、先查「已发送」再补发、发完就删掉自己），没有另开新任务。

## 第二十七轮：把 #975 的前置落了 —— 停靠面的全屏与面板注册表（2026-10-09，条目 5.4 的前置之二）

一次无人值守的自主推进。**没有切版本号、没发 npm、没发安装包、没发发布汇总**；`legacy/main`、
`/root/Adelie` 工作区、`/root/penguin-harness`、`/root/AgentCode`、3003 / 3004 / 4000 / 7364 / 7369
全程没碰；按本轮纪律**没有碰 `packages/desktop` 与 electron**。

### 为什么是这一条

开工自检：`git status --short` 干净、`main` = `origin/main` = `168e04da`，
`git fetch origin && git merge --ff-only origin/main` 报 `Already up to date`。

表上最靠前的未勾选条目照旧是 **2.2c**，这一轮又把它的「还差什么」逐条核了一遍（顺手全仓 grep
了一遍那批 `PENGUIN_*`）：四条仍全在纪律禁止或明说留到发布期的一侧 —— 写侧只剩 `packages/desktop`
（本轮明令不碰）、既有部署单元 `adelie-app.service` 与桌面壳自己的开关（都是发布动作）；
第四条第 4 项是画廊 mock 的演示路径与 `packages/docs` 的环境表，按 2.5 / 2.1c 的口径整片留到发布期。
`packages/server/test/*` 里剩下的 `PENGUIN_HOME` / `PENGUIN_PROFILE` / `PENGUIN_CLI_ENTRY` 全是**钉兼容**
的用例（注释里就写着「旧名仍读」）。**3.5** 是桌面壳取哪个（要用户拍板，且本轮不许碰 desktop）、
**3.6** 要模型 key（卡点，本轮还顺手确认了 `penguin config model list` 只给掩码、拿不到明文，
所以没有不读用户密钥就拿它去验模型的路）、**4.1–4.3** 明令不动、**5.3** 的落地顺序 ②③④
要第二台机器 / 等上游、**5.6** 的 core 那一半等促销搬进 Project 配置（要拍板）。

**5.4** 这一轮把剩下的三条又各核了一遍，然后做了一件此前几轮都停在门口的事：
`234183f5`（#978，Landlock）要等 `9b170c61`（#975），而 **#975 压在树里不存在的
`packages/web/src/features/chat/builtin-dock-panels.tsx` / `chat-dock-context.tsx` 上** ——
那两个文件由上游 `1eb13325`（#961，停靠面的全屏 + 面板变成注册表定义）引入，第十九轮记过这一条
（「先决定要不要把上游的 dock 面板重构也搬过来，那件事的落点应当先写进这张表再动手」）。
所以这一轮做的就是那个前置：**把 #961 落下来，让这条链上「树里不存在的文件」这一栏归零**。

判断它能落、且值得落的三条实测依据：① `git show 1eb13325 | git apply -3 --check -` **一处错误都没有**
（同批剩下的 `9b170c61` 报冲突、`234183f5` 报 9 处，`1bf9fccc` / `3850dbed` 之类各有 0～2 处）；
② 它的文件清单里就有那两个文件（还有 `features/dock/panel-registry.ts`）；③ 它自带成套用例
（`packages/web/test/panel-registry.test.ts` 新 113 行、`dock-state.test.ts` +143 行、
`packages/ui/test/dock-frame.test.ts` 与 `packages/web/e2e/dock.spec.mjs` 各一处），
本机能真跑。

### 改了什么（24 个文件 / +2125 −554，含中英 changelog 一对）

- **ui**（`packages/ui/src/components/shell/dock-frame/dock-frame.tsx` 是主战场，+467 行）：
  `DockFrame` 多一个 docked → entering → full → exiting 的相位机 —— 内容盒在进入时 `fixed` 到停靠面
  自己的矩形、再移到被盖住的矩形，退出反向；由 `transitionend` 或一条同样能收尾正在跑的过渡的计时器
  落定；被盖住的那块（`[data-dock-row]` 或 `[data-dock-area]`）随宿主实时变化。相位挂在
  `data-fullscreen="entering|full|exiting"` 上，`DOCK_FULLSCREEN_Z` 导出给内置浏览器的页面层用，
  `theme.css` 的 `[data-layout-motion]` 因此也涵盖 `top` / `left`。
- **web**（`features/dock/`）：新 `panel-registry.ts` —— 每种面板一条 `DockPanelDefinition`
  （id、名称、图标、排序、`offered` 与它的变更订阅、`Body`），`PANEL_KINDS` 与各处 per-kind 分支
  随之消失；新 `panel-context.tsx` 提供 `useDockPanel()`（所在停靠栏、是否为当前标签、进出全屏、
  经关闭守卫关本标签）；`dock-panel.tsx` / `dock-state.ts` / `dock-launcher.tsx` / `panel-meta.tsx`
  改成读注册表。新 `features/chat/builtin-dock-panels.tsx` 把七个内置面板的**定义与主体**都注册进去，
  新 `chat-dock-context.tsx` 是对话页与停靠栏之间的那层；`chat-page.tsx` 因此把「工作区文件」与
  「记忆」两处内联调用点删掉（`builtin-dock-panels.tsx` 里各自成为一具主体）。
- **首帧不重排**：内层包装按终点尺寸排版并锚定在顶部与共享边，全景时盒子实时跟随自己的矩形、
  不走过渡 —— 所以终端不会每一帧重新排版，退出后滚动位置、文件预览、编辑器草稿与终端画面原样还在。
- **移除**：底部停靠栏那个只有触屏能用的「放大到整屏」按钮（`strings.ts` / `strings-en.ts` 的
  `maximize` / `restore` 换成 `fullscreen` / `exitFullscreen`，另加 `panelUnavailable`
  —— 布局里存着、面板尚未注册（插件没加载完）的标签显示它并仍可 × 关闭）。
- `packages/docs/content/chat.{en,zh}.md` 各加一段「怎么把停靠面拉到最大」；
  `packages/web/e2e/dock.spec.mjs` 的头部说明补上全屏这一条并加用例。
- `changelog/unreleased/2026-10-09-dock-fullscreen{,.zh}.md`（5.7 的口径，中英各一份；
  上游那对按本仓惯例改名到本轮日期、去掉上游 PR 链接、写明「移植自上游 #961」）。

### 移植怎么做的（照上游的改动落，不是合分支）

`git show 1eb13325 | git apply -3 -` —— 21 个文件干净落地，**3 处冲突全在 import 区**，
逐条解掉（都不是语义冲突）：

1. `features/builtin-browser/browser-layer.tsx`：本仓那一行只有 `toastAttention`，上游多了
   `DOCK_FULLSCREEN_Z`、包 scope 是 `@prismshadow/` —— 取「两个都导入 + 本仓 scope」。
2. `features/dock/panel-meta.tsx`：上游把整张表搬进 `panel-registry.ts`、这里只剩读者，
   而本仓这一版仍从 `strings` / `nav-icons` / `dock-state` 取 `S` / `NAV_ICONS` / `PanelKind`
   —— 取上游那一支（本仓的 `ICONS` 用法随之消失）。
3. `features/chat/chat-page.tsx`：本仓比上游多两条本地 import（`WorkspaceBrowser` /
   `ChatMemoryView`，第一轮「新建文件夹」那条线的产物）—— 上游这一笔把两处调用点搬进了
   `builtin-dock-panels.tsx`，所以这两条 import 一起删掉（grep 过：全文再无引用）。

新文件里 4 处 `@prismshadow/penguin-*` 换成本仓的 `@lmliheng/penguin-*`（`builtin-dock-panels.tsx`、
`chat-dock-context.tsx`、`panel-registry.ts` 与其用例）；本轮新增行里没有 `PENGUIN_*` /
`PenguinHarness` 之类要再本地化的命名（扫过）。`prettier` 与 `oxlint` 都直接过，没有要手工调整的格式。

### 验证（都不是推测）

- 六包 `typecheck` 全过（`gen:ifaces` 报 `src/ifaces.json unchanged`，187 接口 / 535 类型）；
  `pnpm lint` **0 警告 0 错误**（2078 文件，比上一轮多 5 个 —— 正是这轮新增的源文件）；
  `pnpm format:check` 干净。
- 五包 test 逐包 `EXIT=0`：core **1359 通过 / 5 跳过**（65 文件）· ui **1007**（127 文件）·
  cli **506**（34 文件）· web **2976 / 2 跳过**（**242** 文件，比上一轮 +13 条，正是新的
  `panel-registry.test.ts` 与扩写过的 `dock-state.test.ts`）· server **185 文件 / 2690 通过 / 4 跳过**
  —— **0 失败**。另跑 `@lmliheng/penguin-docs` **62 通过**（8 文件）—— 本轮改到了它的内容。
- **界面真跑了一遍**（这一条改的是界面，所以照纪律起真服务 + 真浏览器）：按当前源码重建
  `packages/{ui,web}/dist` 后，用**一次性数据根** `/root/adelie-fork-data/r27-dock`（`ADELIE_SEED_ADMIN_PASSWORD`
  起、不走认领链接）在 **7494** 起服务，Playwright（本机 chromium，1440×900）：
  - 登录后建一个会话进 `/chat/<sid>`，点工具栏的**右侧栏** → 停靠栏打开，选单里列出注册表里的
    七个面板（智能体面板 / 终端 / 文件浏览 / 记忆 / 轨迹观测 / 远程控制 / 定时任务）——
    这正是「面板都由注册表命名」这条在界面上的样子；
  - 打开**文件浏览**，点头部的**全屏** → `[data-fullscreen]` 变成 `full`、那枚按钮的原位变成
    **退出全屏**（截图里对话列被盖住、带标题与统计的工具栏与左侧栏都保留）；再点**退出全屏** →
    属性回到 `null`、布局复原（对话列与输入框都回来，侧栏回到常规宽度）；
  - 再点**下侧栏** → 底部停靠栏打开并同样列出选单；
  - **console 0 error / 0 pageerror / 页面一条 4xx 都没有**（`response` 监听里 ≥400 的一条都没记到；
    只有三条 `net::ERR_ABORTED`，那是关掉浏览器时被中断的长连接 `/api/events` 等）；
  - 截图 6 张（`01-chat` / `02-dock-picker` / `03-dock-files` / `04-fullscreen` / `05-back` /
    `06-bottom-dock`）与脚本 `dock-smoke.cjs` 都在会话 scratchpad，未提交进仓库。
  服务用完已停，7494 已释放；3003 / 3004 / 4000 / 7364 / 7369 全程没碰。
- 本轮**没有碰 `packages/desktop` 与 electron**（依赖没装），所以桌面壳那一侧没有证据 ——
  它本来也不在这一条里。

### 没做 / 还差什么

- **5.4 仍未勾掉**：这一轮收掉的是「#975 的前置」（#961）。剩下的就是 `9b170c61`（#975，
  前置**已就位**，剩下的只是它自己的规模：6068 增 / 924 删）与 `1ba104c9`（拆 npm 包，属 4.x）；
  `234183f5`（#978）等 #975。
- **2.2c / 3.5 / 3.6** 照旧停在原地，原因同前（写侧只剩桌面壳、桌面壳取哪个要用户定、3.6 要模型 key）。
- **一条顺带记下来的**：上游 `main` 里我们还没落的自立提交还剩若干（`1bf9fccc` #798
  「热更新时把插件也传过去」、`3850dbed` #526「外部插件索引」、`d929abb33` #960 侧栏按最后活动分页、
  `d56d9ced` #979 内置前缀的原生依赖按锁文件固定版本并带上许可证声明 等），它们不在本台账的
  待办里（5.x 的判据是「对着我们的待办与生意」）—— 要不要做、做哪个，等这几条链走完再由用户点单
  或下一轮按同样的判据挑。`d56d9ced`（#979）与 `234183f5`（#978）的说明都提到「DSH 自带依赖」那一串，
  两者可能与 #978 有关，下一轮做 #975 时一并核。
- `refs/adelie-tmp/*` 七个本地临时引用仍在（第 23 轮拉的），没推、没改 remote 配置；本轮没有新增。
- 中间物：会话 scratchpad 里有 `dock-smoke.cjs` 与 6 张截图、`pw.txt`（一次性口令）、`tests.log`；
  `/root/adelie-fork-data/r27-dock` 是本轮的取证数据根（约 2M，留着当现场）。

### 收尾：提交、推送与汇报

- **代码提交 `e7a0a5a7`**（24 个文件 / +2125 −554，见「已完成的轮次」那一行）；台账这一笔另起一笔。
- **推送**：`git push origin main`（`168e04da..16df6cc4`）。**没有切版本号、没发 npm、没发安装包、
  没发发布汇总。**
- **CI 结论（推送后）**：run **`37898055091`**（`16df6cc4`，含代码提交 `e7a0a5a7` 与台账）
  **22 个作业全绿**、`NOT SUCCESS: []` —— 这一笔动的是 web / ui（还有文档站的 Markdown），
  所以 `test (web-cli)` / `test (rest)` / `test-macos (rest)` / `test-windows (rest)` 那几片
  在 CI 上也真跑了一遍，与上面本机那几个数无关但结论一致。
- **汇报邮件没发出去（第 22 / 23 / 24 / 25 / 26 轮同一处卡点，与凭据无关）**：本机到中南大学网段
  `202.197.0.0/16` 仍整片不通 —— `python3 scripts/mail.py check`（csu-mail 技能目录下）
  **一次都没回**（`timeout 60` 杀掉、退出 124、一行输出都没有，也就是连连接都没建起来）。
  凭据本身正常：`CSU_MAIL_ADDR` 21 字符、`CSU_MAIL_AUTHCODE` 16 字符都注入着（只打印长度，
  没打印明文）。按技能纪律**只这一次、没有重试登录**。正文留在本会话 scratchpad 的
  `mail-round27.txt`；把第 27 轮的正文路径与主题**加进**既有的周期重发任务 `csu-mail-retry`
  （现覆盖第 22 / 23 / 24 / 25 / 26 / 27 六封，每 6 小时一次、`end_at` 2026-10-12T12:00:00Z、
  先查「已发送」再补发、发完就删掉自己），没有另开新任务。

## 第二十八轮：权限菜单给出具名沙箱预设（2026-10-09，条目 5.4 的主块）

一次无人值守的自主推进。**没有切版本号、没发 npm、没发安装包、没发发布汇总**；`legacy/main`、
`/root/Adelie` 工作区、`/root/penguin-harness`、`/root/AgentCode`、3003 / 3004 / 4000 / 7364 / 7369
全程没碰；按本轮纪律**没有碰 `packages/desktop` 与 electron**。

### 为什么是这一条

开工自检：`git status --short` 干净、`main` = `origin/main` = `cbb238af`，
`git fetch origin && git merge --ff-only origin/main` 报 `Already up to date`。

表上最靠前的未勾选条目照旧是 **2.2c**，其「还差什么」四条仍全在纪律禁止或明说留到发布期的一侧
（写侧只剩 `packages/desktop`、既有部署单元 `adelie-app.service`、桌面壳自己的开关、画廊 mock 与
`packages/docs` 的环境表）；**3.5** 要用户拍板且本轮不许碰 desktop、**3.6** 要模型 key、**4.1–4.3**
明令不动。所以做 **5.4 剩下的那一块**：上游 `9b170c61`（#975）—— 第二十七轮把它的前置 #961
（停靠面全屏 + 面板注册表）落下之后，这条链上「树里不存在的文件」已经归零，它就只是规模问题了。

### 改了什么（67 个文件 / +6107 −919，含四份 changelog）

上游客服端 / Web / UI 三包的一整笔：**权限菜单不再列三段十档，而是列具名预设**。

- **服务端**：`plugin/config.ts` 的 `PluginConfigField` 多一个 `table` 类型（固定行 + 类型化列，
  只存与默认不同的单元格、按 `<字段>.<行>.<列>` 点名拒绝、锁定单元格忽略读到的值，可声明
  `rowChoice` / `pin` / `columnGroup` / `extensible`），字段多 `advanced` 与 `hint`，分组可把某个
  布尔字段声明为 `switch`；沙盒分组改成 `enabled` + `presets` + `defaultPreset`（六个内置预设），
  自己的 `mode` / `network` 去掉、`writableTemp` / `maskPaths` 移到高级；新 `sandbox/settings-policy.ts`
  给出新会话的起点（`sandboxStartOf`）与旧文档的向后兼容读法，新 `sandbox/settings-status.ts` 报
  后端状态与「本系统默认该装哪个包」；会话视图多出 `presets` / `advanced` / `switchOn`。
- **Web**：设置页的插件配置面整片重写成一张表（`plugin-config-table.tsx` 436 行，另有草稿、字段、
  单元格、行菜单、折叠等新文件），权限选择器（`permission-select.tsx`）改成按预设渲染，卡片的
  「?」与悬停说明随之铺开。
- **UI**：`Dropdown` 的键盘行为、`Select` 的 `info`、`ConfirmModal` 的 `glyph`。

### 移植怎么做的（照上游的改动落，不是合分支）

`git show 9b170c61 | git apply -3 -`，**9 处冲突**逐条解掉，全部落在两类地方：

1. **import 区**（`settings-store.ts` / `session-service.ts` / `permission-select.tsx` /
   `permission-level.ts` 与其用例 / `chat-dock-context.tsx` / `confirm-modal.tsx` / SKILL.md）——
   一侧是本仓的 `@lmliheng/` scope、一侧是上游的 `@prismshadow/` 或上游新增的导入，
   取「上游的新导入 + 本仓 scope」。`session-service.ts` 那一处还连带删掉本仓的两个本地秩表
   （`SANDBOX_MODE_RANK` / `SANDBOX_NETWORK_RANK`）—— 上游这一笔把它们换成了
   `services/sandbox-ceiling.ts` 的 `aboveSandboxCeiling`，留着就是死代码。
2. **上游已经把这一段搬走的地方**（`plugins-section.tsx` 三处）——本仓这一版仍是内联调用点，
   取上游那一支（`git checkout --theirs`，落定后再把 scope 换掉）。

**三处本树缺的前置**（都靠 `pnpm typecheck` 挨个逼出来的，不是猜的）：

- `ICONS.star` —— 表格的 `pin` 列画的就是它，上游在这笔之前就有了，本树没有。照上游的
  路径与注释补进 `packages/ui/src/components/icons/icons.ts`（`pin` 与 `wrench` 之间）。
- `S.settings.pluginActionTitle` / `pluginActionRun` / `pluginActionConfirm` —— 中英各三条，
  本树没有（见下）。按上游原文补进两份字典，位置与上游一致。
- **上游那笔自带的「执行插件操作前先问一句」**：补丁的父提交里已经有 `ConfirmModal` 那一整套
  （本仓没有，是上游另一笔带进来的），而补丁本身要改到那几行，所以它会一起落下来。**决定照收**：
  它是同一张卡片上的一个连贯行为（插件组操作只在插件自己知道做什么，先问一句是对的），
  而且不收就得把 `plugins-section.tsx` 手工拆开、与上游那一版越走越远。三个文案键因此一并补齐。

**本地化**（本轮新增行里逐条扫过）：`@prismshadow/penguin-*` → `@lmliheng/penguin-*`；
**沙盒后端的推荐包名** `@penguinharness/sandbox-*` → `@lmliheng/penguin-plugin-sandbox-*`
（`settings-status.ts` 的映射、文档站里的两段、web 的用例）—— 这是**必须改的**：本仓的四个
沙盒后端包就叫 `@lmliheng/penguin-plugin-sandbox-{bwrap,seatbelt,wsl,dsh}`
（`packages/server/src/plugin/builtin-index.json`），照上游的名字写，卡片会去装一个不存在的包。
其余 `PenguinHarness` / `PENGUIN_*` / `~/.penguin` 在本轮新增行里**一处都没有**。

**changelog**（5.7 的口径）：上游那两对（`2026-09-30-simple-sandbox-settings`、
`2026-10-02-backward-compatibility-sandbox-switch`）按本仓惯例改名到本轮日期、去掉上游 PR 行、
`Type` 从 `feat` 改成 `feature`、正文里写明「移植自上游 #975」，互链跟着改。

### 验证（都不是推测）

- 六包 `typecheck` 全过（`gen:ifaces` 报 187 接口 / 547 类型）；`pnpm lint` **0 警告 0 错误**
  （2101 文件）；`pnpm format:check` 干净（首跑 `plugin-config-field.tsx` 一条，`prettier --write` 后复检通过）。
- 五包 test 逐包 `EXIT=0`：core **1359 通过 / 5 跳过**（64 文件）· ui **1008**（127 文件）·
  cli **506**（34 文件）· web **3019 / 2 跳过**（**247** 文件，比上一轮 +43 条，正是这笔带来的
  `plugin-config-card` / `plugin-config-draft` / `permission-menu` / `sandbox-backend-prompt` /
  `advanced-fold` 与扩写的 `permission-level`）· server **187 文件 / 2755 通过 / 4 跳过**
  （+65 条：`sandbox-switch` / `sandbox-ceiling` 新文件与 `plugin-config` / `session-sandbox` 扩写）
  —— **0 失败**。另跑 `@lmliheng/penguin-docs` **62 通过**（8 文件）—— 本轮改到了它的内容。
- **界面真跑了一遍**（这一条改的是界面）：按当前源码重建 `packages/{core,server,web}` 的 dist
  （server 的 tsup 在本机默认堆下会 `ERR_WORKER_OUT_OF_MEMORY`，加 `NODE_OPTIONS=--max-old-space-size=4096`
  单跑即过），用**一次性数据根** `/root/adelie-fork-data/r28-presets`（`ADELIE_SEED_ADMIN_PASSWORD`
  起、不走认领链接）在 **7496** 起服务，Playwright（本机 chromium，1440×900，zh-CN）：
  - 全新数据根 = 全新安装，**开关默认关闭**：输入框的权限按钮菜单只有四档审批方式
    （总是询问 / 放行只读 / 全部放行 / 全部拒绝）与「更多…」，这正是「关闭时只列审批方式」那条；
  - 菜单里的「更多…」按设计打开设置对话框的**沙盒卡片**（`section="plugins"`、`pluginFocus="sandbox"`）：
    卡片只有标题、一条「没有可用后端」的提示与**启用**开关；点开关 → 弹出**安装后端**的对话框，
    里面点名的包是 `@lmliheng/penguin-plugin-sandbox-bwrap`（本地化这条在界面上可见）；
  - 选「暂不」后卡片展开出**预设表**（名称 / 文件 / 网络 / 询问模式 / 操作，首行「关闭（完全访问）」
    三个单元格标「已锁定」）与「添加预设」「高级选项」；
  - 点**保存**、刷新页面、重开权限菜单：菜单变成 **完全访问 / 每次询问 / 仅工作区可写 / 只读**，
    前两者可选、后两者标「未安装」并置灰（本机没有任何沙盒后端，这是设计的诚实标注），
    按钮自己换成默认预设「仅工作区可写」的图标；「更多…」仍在；
  - **console 0 error / 0 pageerror / 一条 4xx 都没有**（脚本从进测试页起记账，最后打印 `[]`）；
  - 截图 6 张（`01-draft` / `02-permission-menu` / `03-sandbox-card-off` / `04-sandbox-card-on` /
    `05-saved` / `06-menu-with-presets`）与脚本 `presets-smoke.cjs`、`smoke.log` 都在会话 scratchpad，
    未提交进仓库。服务用完已停（7496 已释放），数据根留着当现场。
- 本轮**没有碰 `packages/desktop` 与 electron**（依赖没装），所以桌面壳那一侧没有证据 ——
  它本来也不在这一条里。

### CI：两个 macOS 作业红在服务端的声明构建上（本轮已修）

推送后 CI run `37922789257`（`f2a9ea33`）**20 绿 2 红 + 汇总红**：红的是
`test-macos (server)` 与 `test-macos (rest)`，两处都**不是测试**，而是同一件事 ——
`packages/server build` 的 `DTS` 那一趟 `ERR_WORKER_OUT_OF_MEMORY`（日志里
`DTS Build start` 之后约 51s 终止，Node v24.20.0）。ubuntu 与 windows 的同名分片都绿。

- **不是抖动，是本轮这笔带来的**：`#975` 把服务端的类型面拉大（`api/types.ts` +196 行、
  `plugin/config.ts` 改 633 行、新 `config-page.ts`），tsup 的声明汇总（`rollup-plugin-dts`）峰值
  越过了 Node 的默认老生代上限。本机实测（本机默认上限 `2240MB`，与 macOS 跑机同一量级）：
  **默认堆失败 · 显式 2048 失败 · 显式 3072 通过 · 4096 通过** —— 也就是说这一轮之后
  **本机的 `pnpm build` 也会失败**，不只是 CI。`gen-ifaces` 那几条「deeper than 12 levels」的警告
  （`plugin/config.ts:817` 那组新的 `table` 列类型）正是这处类型面的样子。
- **上游同一处也是红的**：`GET /commits/9b170c61/check-runs` 里 `test-macos (server)` 就是 `failure`
  （汇总 `ci` 跟着红，其余 24 条绿）；上游此后**没有**改过 `packages/server/tsup.config.ts`
  （该文件的最近一次改动停在 2026-10-03），所以这不是「上游已有修法、我们没搬」。
- **修法（`a8347184`）**：按仓库既有的跨平台写法（`scripts/run-with-env.mjs` 正是为
  「package.json 里的环境前缀在 Windows 的 cmd 下不能用」而存在的，`packages/{cli,core,server}`
  的脚本都在用它）把服务端的 `build` 改成
  `pnpm gen:ifaces && node ../../scripts/run-with-env.mjs NODE_OPTIONS=--max-old-space-size=4096 -- tsup`。
  helper 的语义是**环境里有就以环境为准**，所以：不导出时拿到 4096MB（够用），
  需要更多堆的机器仍可自己 `export NODE_OPTIONS`。
- **验证（实测）**：改前 `pnpm --filter @lmliheng/penguin-server run build` 在默认堆下 `EXIT=1`
  且报 `ERR_WORKER_OUT_OF_MEMORY`；改后同一条命令 `EXIT=0` 并产出
  `dist/{index,api/types,plugin/index}.d.ts`；把 `NODE_OPTIONS=--max-old-space-size=1024` 留在环境里
  复跑，helper 打印「the environment overrides these defaults」并按 1024 跑（照旧 OOM）——
  证明那个值是**默认**而不是硬写。这一笔只动 `packages/server/package.json` 一行，
  `prettier --check` 过；测试与其余包不受影响（没重跑五包全套，CI 会重跑）。
- **CI 复跑（推送后 run `37924039202`，`6d8b3ce9`）：22 个作业全绿、`NOT SUCCESS: []`** ——
  红的两个 macOS 分片（`test-macos (server)` / `test-macos (rest)`）都转绿，其余照旧；
  也就是说这一轮的代码 + 构建修复一起在 CI 的 ubuntu / macOS / windows 三类跑机上都过了。
  （同一次推送还起过 `37924014933`（`a8347184`），被 `ci.yml` 的 `cancel-in-progress` 按同一
  concurrency 组取消 —— 认准的是 `6d8b3ce9` 那一跑。）

### 没做 / 还差什么

- **5.4 仍未勾掉**：这一轮收掉的是它最大的一块（#975）。剩下的是 `234183f5`（#978，Landlock 让
  默认 Ubuntu 可用）—— 它的前置现在**齐了**（要改的 `settings-status.ts` 已经在树里），但仍是
  「一组提交的顶端」（`pick()` 路由、`closed-temp` 维度、插件契约的 `mechanism` / `limits`、
  卡片改 `Enforced here: …`，约 1.5k 行、跨四包，第十九轮实测多处冲突），得单独一轮；
  `1ba104c9`（拆 npm 包）属 4.x。
- **2.2c / 3.5 / 3.6** 照旧停在原地，原因同前。
- **本轮有意**没有把上游 `.agents/skills/penguin-harness-frontend/SKILL.md` 的其余更新搬过来：
  那个文件本仓这一版整体落后于上游（上游后来加过 dock 面板、提示与按钮换行等整节），
  本轮只落下这一笔真正相关的那一行（`Select` 的 `info`）。整篇对齐属于 2.5 的口径，没动。
- **一条顺带记下来的**：上游 `main` 里我们还没落的自立提交仍有若干（`1bf9fccc` #798
  「热更新时把插件也传过去」、`3850dbed` #526「外部插件索引」、`d929abb33` #960 侧栏按最后活动分页、
  `d56d9ced` #979 内置前缀的原生依赖按锁文件固定版本并带许可证声明），它们不在本台账的待办里。
  本轮**踩到一次 #960 的边**：`session-service.ts` 里本仓与「补丁的父提交」之间的 81 行差异，
  正是 #960 的游标分页 —— 由于 `git apply -3` 以补丁的父提交为底做三路合并，那些差异没有污染本轮的结果
  （落定后的文件里没有 `SessionListPaging` / `compareActivityDesc`，只有本轮的沙盒改动），
  但下一轮动这个文件时要留意这条边。
- `refs/adelie-tmp/*` 七个本地临时引用仍在（第 23 轮拉的），没推、没改 remote 配置；本轮没有新增。
- 中间物：会话 scratchpad 里有 `presets-smoke.cjs`、6 张截图、`smoke.log`、几份 `tests-*.log`；
  `/root/adelie-fork-data/r28-presets` 是本轮的取证数据根（留着当现场）。

### 收尾：提交、推送与汇报

- **代码提交 `2e9d53b6`**（67 个文件 / +6107 −919，见「已完成的轮次」那一行）；台账这一笔另起一笔。

## 第二十九轮：Linux 沙盒在默认的 Ubuntu 上走 Landlock（2026-10-09，条目 5.4 的最后一块）

一次无人值守的自主推进。**没有切版本号、没发 npm、没发安装包、没发发布汇总**；`legacy/main`、
`/root/Adelie` 工作区、`/root/penguin-harness`、`/root/AgentCode`、3003 / 3004 / 4000 / 7364 / 7369
全程没碰；按本轮纪律**没有碰 `packages/desktop` 与 electron**。

### 为什么是这一条

开工自检：`git status --short` 干净、`main` = `origin/main` = `dae8936a`，
`git fetch origin && git merge --ff-only origin/main` 报 `Already up to date`。

表上最靠前的未勾选条目照旧是 **2.2c**，其「还差什么」四条仍全在纪律禁止或明说留到发布期的一侧
（写侧只剩 `packages/desktop`、既有部署单元 `adelie-app.service`、桌面壳自己的开关、画廊 mock 与
`packages/docs` 的环境表）；**3.5** 要用户拍板且本轮不许碰 desktop、**3.6** 要模型 key、**4.1–4.3**
明令不动。所以做 **5.4 剩下的那一块**：上游 `234183f5`（#978）—— 第二十六到二十八轮把 #977 / #961 /
#975 依次落下之后，它是这条链上唯一还剩的一块，也是「得单独一轮」的那一轮。

### 改了什么（65 个文件 / +1523 −258，含四份 changelog）

`git show 234183f5 | git apply -3 -`，**16 处冲突**逐条解掉：

| 冲突 | 两侧是什么 | 取哪一支 |
| --- | --- | --- |
| 四个插件 `package.json` | 本仓的 `@lmliheng/penguin-plugin-sandbox-*` + `private` ｜ 上游的 `@penguinharness/sandbox-*` 与 `version 0.2.3` | 名字与 `private` 取本仓，**版本取上游的 0.2.3** |
| `builtin-index.json`（4 处） | 同上（名字 / 版本 / description） | 同上：本仓的名字与 description + 上游的版本 |
| `settings-status.ts`（2 处） | 本仓的 scope ｜ 上游新增的 import 与 `DEFAULT_BACKEND` → `DEFAULT_BACKENDS` | 上游的新导入与新结构 + 本仓 scope 与本仓的包名 |
| `sandbox-dsh/src/index.ts` 的 import 区 | 本仓 scope ｜ 上游新增 `node:os` / `node:path` | **只取上游那一支**（上游的重写里已含 `Bind, Component` 那行） |
| 其余 8 处（四份文档、bwrap 的 README 与其源码注释、两个用例、`plugin-config-heading.tsx`） | 上游的重写 ｜ 本仓的 scope、`~/.adelie` 与旧名说明 | 上游的正文 + 本地化 |

**一条不在冲突区里的漏网**：`plugins/sandbox-bwrap/src/index.ts` 的拒绝文案整行由上游那一笔带来
（它落在 conflict 之外，`git apply -3` 直接写进文件），里面的包名还是 `@penguinharness/sandbox-dsh`
—— 逐行扫 diff 时抓出来改掉（`@lmliheng/penguin-plugin-sandbox-dsh`）。

**本地化**：`@penguinharness/sandbox-*` → `@lmliheng/penguin-plugin-sandbox-*`（**必须改**：本仓那四个
后端包就叫这个名字，照上游写卡片会去装一个不存在的包）、`@prismshadow/penguin-*` → `@lmliheng/penguin-*`、
`~/.penguin` → `~/.adelie`、`PENGUIN_HOME` → `ADELIE_HOME`（**并保留本仓「旧名仍读」的那句说明** ——
上游那一版没有它，是本仓 2.2a 的事实，改文档时不能丢）。`changelog/` 里那四份（上游的
`2026-10-03-sandbox-landlock-floor` 与 `2026-10-03-backward-compatibility-sandbox-recommended` 各中英一份）
按本仓惯例改名到本轮日期（`2026-10-09-sandbox-landlock-floor` / `2026-10-09-sandbox-recommended-backward-compatibility`）、
去掉上游 PR 行、正文写明「移植自上游 PenguinHarness（#978，提交 `234183f5`）」、互链跟着改。

### 验证（都不是推测）

- **静态**：六包 `typecheck` 全过（`gen:ifaces` 报 **187 接口 / 549 类型**）—— 注意**core 要先重建**，
  `packages/server` 是从 core 的 `dist` 读契约的，不重建会报 `SandboxLimit` 未导出、`closed-temp`
  不是 `SandboxDimension` 那一串；`pnpm lint` **0 警告 0 错误**（2108 文件）；`pnpm format:check` 干净。
- **测试**（逐包 `EXIT=0`，**0 失败**）：core **1368 通过 / 5 跳过**（65 文件，比上一轮 +9 —— 正是
  `runner-lines` 这笔）· ui **1008**（127）· cli **506**（34）· web **3032 / 2 跳过**（**248** 文件）
  · server **189 文件 / 2766 通过 / 4 跳过**；另跑 `@lmliheng/penguin-docs` **62** 与四个沙箱插件包
  （bwrap **29** · dsh **21 + 1 跳过** · seatbelt **17 + 5 跳过** · wsl **25**）全绿。
- **界面真跑了一遍**（这一条改的是界面）：按当前源码重建 `packages/{core,server,web}` 的 dist（server 的
  tsup 现在自带 4096MB 默认堆，第二十八轮那一笔），一次性数据根 `/root/adelie-fork-data/r29-landlock`
  （`ADELIE_SEED_ADMIN_PASSWORD` 起，不走认领链接）在 **7497** 起服务，Playwright（本机 chromium，
  1440×900，zh-CN）：
  - 权限菜单照旧四档审批方式 + 「更多…」，点「更多…」按设计打开设置对话框的沙盒卡片；
  - 全新数据根 = 全新安装，卡片只有标题、一条「没有可用后端」提示与**启用**开关；**点开关后弹出的安装
    提示点名两个包、顺序与列表一致** —— `@lmliheng/penguin-plugin-sandbox-bwrap` 与
    `@lmliheng/penguin-plugin-sandbox-dsh`，并按上游文案写明「两者都可用时，使用封禁范围更大的那个」
    （这正是 `recommended` 由字符串改成列表在界面上的样子，也是本轮唯一能在这台机器上看到的界面变化）；
  - 「暂不」后卡片展开预设表与「添加预设」「高级选项」，排版正常；
  - **console 0 error / 0 pageerror / 一条 4xx 都没有**（脚本从进测试页起记账，最后打印 `[]`）；
  - 截图 5 张（`01-draft` / `02-permission-menu` / `03-sandbox-card-off` / `04-sandbox-card-on`
    （安装提示开着）/ `05-card-after-prompt`）与脚本 `landlock-smoke.cjs`、`smoke.log` 都在会话 scratchpad，
    未提交进仓库。服务用完已停（7497 已释放），数据根留着当现场。
- **真跑一次 DSH 适配器的加载与约束**（这一条的核心主张，本机就能跑）：把 `plugins/sandbox-dsh` 构建出
  dist，用一段一次性脚本直接 `loadDshAdaptor()` ——
  本机（内核 6.1，Landlock ABI 2）**加载成功**，`mechanism` = **`Landlock (partial)`**，`limits` 三条
  与 `rungLimits` 一致（scratchpad 不可写 / 临时目录是宿主共享的 `/tmp` / 老 ABI 的 ioctl 与截断缺口）；
  受限命令**在工作区内写成功**（文件在）、**在工作区外（`$HOME`）被拒** —— 退出码 1、
  `/bin/sh: line 1: /root/r29-outside-*.txt: Permission denied`、文件确实不存在。
  也就是说「bubblewrap 拒绝时由 Landlock 只约束文件写入」这条在本机是**跑出来的**，不是推的。
  脚本与日志是 scratchpad 里的 `dsh-probe.mjs` / `dsh-probe.log`。
- **有意没验的**：Ubuntu 23.10+ 上「bubblewrap 被 userns 限制拒绝 → 适配器接手」那一整条要在那种主机上
  才成立（本机是 Debian，userns 不受限，bubblewrap 会赢）；服务端那一侧由本笔带来的
  `test/sandbox-floor.test.ts`（285 行：路由偏好与平局、bwrap 被拒时适配器服务文件而断网请求 fail-closed
  并带全量原因、卡片标题与 More info 与置灰选项、关临时目录的策略绝不到达适配器）与
  `session-sandbox-masks.test.ts` 钉住。
- 本轮**没有碰 `packages/desktop` 与 electron**（依赖没装）。

### 没做 / 还差什么

- **5.4 已勾掉**：代码面到此清零。只剩 `1ba104c9`（沙盒后端拆成 npm 包并发布），属 4.x 的发布链路。
- **2.2c / 3.5 / 3.6** 照旧停在原地，原因同前。
- **一件本笔自带、本机看不到的**：上游这一笔假定 DSH「自带依赖」（那撮提交在系列顶端，不在本树），
  本机的 dsh 包靠 workspace 的 `node_modules` 解析 `@deepseek-ai/*` —— 真到发布一份不带依赖的安装上，
  这条链还得按上游系列顶端那一撮收（不在本台账的待办里，记在这里备查）。
- `refs/adelie-tmp/*` 七个本地临时引用仍在（第 23 轮拉的），没推、没改 remote 配置；本轮没有新增。
- 中间物：会话 scratchpad 里有 `landlock-smoke.cjs` / 5 张截图 / `smoke.log` / `dsh-probe.{mjs,log}` /
  `PLAN.md`；`/root/adelie-fork-data/r29-landlock` 是本轮的取证数据根（留着当现场）。

### 收尾：提交、推送与汇报

- **代码提交 `ea92b3ec`**（66 个文件 / +1628 −263，含本台账的这一笔，见「已完成的轮次」那一行）；
  台账的收尾另起一笔。
- **CI**：推送后的 run `37950180937`（`7b5dbf28`）**22 个作业全绿、`NOT SUCCESS: []`** ——
  也就是说这一轮的代码在 ubuntu / macOS / windows 三类跑机上一起过了（第二十八轮给服务端 `tsup`
  的 4096MB 默认堆这一笔仍然够用，本轮没有再加）。
- **汇报邮件没发出去（第 22–28 轮同一处卡点，与凭据无关）**：本机到中南大学网段
  `202.197.0.0/16` 仍整片不通 —— `python3 scripts/mail.py check`（csu-mail 技能目录下）与裸
  `/dev/tcp/smtp.csu.edu.cn/465`、`/dev/tcp/imap.csu.edu.cn/993` 都超时，而同一时刻
  `github.com:443` 正常、环境里没有任何代理，所以既不是凭据也不是出口被整体掐断。本轮的正文写在
  会话 scratchpad 的 `r29/mail-body.txt`；把第 29 轮的正文路径与主题**加进**既有的周期重发任务
  `csu-mail-retry`（现覆盖第 22–29 共八封，每 6 小时一次、`end_at` 2026-10-12T12:00:00Z、
  先查「已发送」再补发、发完就删掉自己），没有另开新任务。
