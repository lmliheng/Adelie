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
- [ ] 2.2 **数据根**：`~/.penguin` → `~/.adelie`；`PENGUIN_HOME` 等环境变量名是否跟着改，先定口径
      （建议：变量名改成 `ADELIE_*`，并在 `resolveRoot()` 里兼容读一次旧名，方便旧数据迁过来）。
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
      会把镜像推到 Docker Hub `hiyouga/penguinharness`（默认分支已切到 `fork/penguin-base`，
      `main` 不再有人推，所以不会触发；真要动 `main` 之前先处理它）；`desktop-build.yml` 的
      `push: release/**`；Pages 那条已随 `landing` 删掉。
      **另外**：`ci.yml`（11 个 job）的触发面仍只写 `main`，新主线跑不到它 —— 要么把它接到
      `fork/penguin-base` 并让它真跑绿，要么按 Adelie 自己的仓库结构重写；在那之前 GitHub 上
      没有 CI 信号（README 里那条 CI 徽章已经撤掉，不留假象）。
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
（源码版），所以安装包是**在本机按上游 `release.yml` 的步骤现打**的，落在 3003 那台静态站上：

| 产物 | 目标 | 说明 |
| --- | --- | --- |
| `adelie-linux-x64.tar.gz`（107 MiB） | Linux x64 | 自带 Node 24.18.0；解开 → `./install.sh` |
| `adelie-win32-x64.zip`（142 MiB） | Windows x64 | 自带 Node + MinGit；解开 → `install.cmd` |
| `adelie-universal.tar.gz`（53 MiB） | 任意平台 | 不带运行时，目标机器要有 Node ≥ 24 |

下载地址：<http://64.83.2.109:3003/downloads/v0.2.0/>（页面「下载」一节从
`/downloads/index.json` 渲染，v0.1.0 旧 Adelie 那三件原样保留）。**装完的命令与数据根仍是
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

## 主线切到 main 之后：CI / Docker 的真实现状（2026-10-05）

把新基座并进 `main` 之后，`ci.yml`（11 个 job）与 `docker.yml` 的 `push: main` 第一次真的跑起来了。
结果与处置：

| 结果 | job | 原因 | 处置 |
| --- | --- | --- | --- |
| ❌ → ✅ | `test (core)` / `test-macos (core)` / `test-windows (core)` | `core/test/plugins.test.ts`：**README 里找不到插件分类表**（用户当天把 README 正文删到只剩头部） | **已修**（用户选 b）：给 `README_TABLES` 加 `optional`，根 README 没表就跳过，`plugins/README.md` 与 `README.zh.md` 仍必查；CI `37261735096` 三条**实测转绿**（提交 `7cf248d4`） |
| ❌ | `test (rest)` / `test-windows (rest)` / `test-macos (rest)` | `packages/desktop/test/launcher.test.ts` 的夹具还写着 `penguinharness`，而代码算出来的目录名已是 `Adelie` —— 2.1c 改名漏了这个夹具 | **已修**（夹具改成 `Adelie`，本地 `vitest run --root packages/desktop` 308 全绿；改前该文件确有一条红） |
| ❌ | `test-macos (server)` | `test/workflows.test.ts`「notices an Agent's FIRST workflow」在 macOS 上返回 `{}` —— **同一个测试在 Linux 与 Windows 上都是绿的**，看着像 macOS 跑机的抖动 | 记录，暂不动 |
| ❌ | `installer-windows` | `scripts/test-installer.ps1`：`forwarder-oss returned an unexpected result`（在线下载源选择那条用例） | 记录。**不是改名引起的**：2.1c 对 `install.ps1/.sh/.cmd` 只改了提示语字符串，没碰 `test-installer.ps1`，也没碰两边共用的常量；要查得有一台 Windows/pwsh |
| ❌ | `Docker` | `push: main` 会把镜像**以 `hiyouga/penguinharness` 的名义推到 Docker Hub**（上游的镜像名与账号），而本仓没有 Docker Hub 凭据，只能失败 | **已处置**：删掉 `push: branches: [main]` 这条触发（带注释说明），保留 PR 的构建冒烟与手动 dispatch |

**2026-10-05 复核（CI `37261735096`，支线 `main` @ `7cf248d4`）**：22 个 job 里 20 个绿，
README 插件表那三条已闭，macOS 那条重跑即绿（确系跑机抖动）—— **只剩 `installer-windows` 一条红**
（以及汇总 job `ci` 随之红）。这正是台账 4.2 里「把 ci.yml 接到新主线并让它真跑绿」那一条要收的尾，
现在它只剩一个具体目标了。

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

**要问用户的一句**：第 2 层要不要更自动（应用升级后自动重装 Agent 上的插件副本）？代价是会覆盖
Agent 上对插件内容的本地改动 —— 现在的产品行为是「提示 + 一键批量更新」，先不动。

## 本机部署（2026-10-05）

| | |
| --- | --- |
| 单元 | `adelie-app.service`（`/etc/systemd/system/`）—— 新基座的 Web 服务端 |
| 端口 | **3004**（`HOST=0.0.0.0`，ufw 与 `/root/egress-whitelist/config.json` 都已登记） |
| 数据根 | `/root/adelie-data`（工作区 `/root/adelie-data/workspace`） |
| 代码 | `/root/adelie-fork` 的 `packages/server/dist/index.js` + `packages/web/dist` |
| 首次登录 | 2026-10-05 用户自己设了管理员密码（值不进仓库），首次登录链接**已作废**；现在用 用户名 `admin` + 那个密码登录。忘了密码：停服务后 `penguin server reset-admin-password`，再启动会打印新的认领链接（步骤见 `/root/adelie-data/首次登录链接.txt`，0600） |
| 旧地址 | 上游设计规格页已从 3004 让到 **3003**（`adelie-design.service`，同步改了单元与端口表）；旧 Adelie Web 仍在 4000（`adelie-web.service`） |

> **2026-10-05（用户要求）**：`adelie-app.service`（3004）已 `systemctl stop`，端口已释放；
> 单元仍 `enabled`，**重启机器会自己回来**，要不要 `disable` 等用户发话。3003 / 4000 未动。

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
