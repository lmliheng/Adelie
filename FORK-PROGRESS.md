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
| ❌ | `test (core)` / `test-macos (core)` / `test-windows (core)` | `core/test/plugins.test.ts`：**README 里找不到插件分类表**（用户当天把 README 正文删到只剩头部） | **等用户拍板**：补回那两张表，或把这条断言改成「README 没写插件就不检查」 |
| ❌ | `test (rest)` / `test-windows (rest)` / `test-macos (rest)` | `packages/desktop/test/launcher.test.ts` 的夹具还写着 `penguinharness`，而代码算出来的目录名已是 `Adelie` —— 2.1c 改名漏了这个夹具 | **已修**（夹具改成 `Adelie`，本地 `vitest run --root packages/desktop` 308 全绿；改前该文件确有一条红） |
| ❌ | `test-macos (server)` | `test/workflows.test.ts`「notices an Agent's FIRST workflow」在 macOS 上返回 `{}` —— **同一个测试在 Linux 与 Windows 上都是绿的**，看着像 macOS 跑机的抖动 | 记录，暂不动 |
| ❌ | `installer-windows` | `scripts/test-installer.ps1`：`forwarder-oss returned an unexpected result`（在线下载源选择那条用例） | 记录。**不是改名引起的**：2.1c 对 `install.ps1/.sh/.cmd` 只改了提示语字符串，没碰 `test-installer.ps1`，也没碰两边共用的常量；要查得有一台 Windows/pwsh |
| ❌ | `Docker` | `push: main` 会把镜像**以 `hiyouga/penguinharness` 的名义推到 Docker Hub**（上游的镜像名与账号），而本仓没有 Docker Hub 凭据，只能失败 | **已处置**：删掉 `push: branches: [main]` 这条触发（带注释说明），保留 PR 的构建冒烟与手动 dispatch |

也就是说：**CI 目前不是全绿**，上面三条（README 插件表、macOS server 抖动、Windows 安装脚本用例）
都还没闭。这正是台账 4.2 里「把 ci.yml 接到新主线并让它真跑绿」那一条要收的尾 —— 现在它有了具体的
清单，不再是一句话。

## 本机部署（2026-10-05）

| | |
| --- | --- |
| 单元 | `adelie-app.service`（`/etc/systemd/system/`）—— 新基座的 Web 服务端 |
| 端口 | **3004**（`HOST=0.0.0.0`，ufw 与 `/root/egress-whitelist/config.json` 都已登记） |
| 数据根 | `/root/adelie-data`（工作区 `/root/adelie-data/workspace`） |
| 代码 | `/root/adelie-fork` 的 `packages/server/dist/index.js` + `packages/web/dist` |
| 首次登录 | 2026-10-05 用户自己设了管理员密码（值不进仓库），首次登录链接**已作废**；现在用 用户名 `admin` + 那个密码登录。忘了密码：停服务后 `penguin server reset-admin-password`，再启动会打印新的认领链接（步骤见 `/root/adelie-data/首次登录链接.txt`，0600） |
| 旧地址 | 上游设计规格页已从 3004 让到 **3003**（`adelie-design.service`，同步改了单元与端口表）；旧 Adelie Web 仍在 4000（`adelie-web.service`） |

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
