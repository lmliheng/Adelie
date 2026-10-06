# Adelie v0.3.3 —— 界面与安装器的攒批：跨项目定时任务、插件市场条目、侧栏工作区、安装器配图

自 v0.3.2 起 `main` 上攒够了 10 个功能性提交（阈值见 `LOOP.md`），按巡台口径发一个 patch。这一版
**没有破坏性改动**：数据根、配置格式、HTTP 接口都没动，已装好的机器不需要改任何配置（详见下面
「默认端口」一条）。它同时把几条**已提交但一直没到用户手上**的界面改动带到线上。

## 这一版改了什么

1. **定时任务页可以跨项目看**。账号菜单里的定时任务页多了一个范围开关（本项目 / 全部项目）：
   「全部项目」是只读总览，每个 Project 一段，段头带项目名、任务数与「打开」按钮，点了就切过去。
   新建、编辑、删除仍在本项目范围里 —— 一个任务文件属于某个 Agent，而 Agent 属于某个 Project。
   服务端新增 `GET /api/schedules`：一次读完调用者能访问的每个 Project 的 schedules，所有行按同一
   时刻算状态。
2. **插件市场给每个自带插件包一条条目**。随构建自带的 18 个 `@lmliheng/*` 插件包此前在市场里没有
   条目、也就没有自己的插件页；现在索引 = 手写条目 + 每个自带包派生的一条，版本与分类取包自己的
   `plugin.json`（与插件卡片同一个版本），简介、许可证、关键词取 `package.json`，不手抄。
   可安装列表也只列服务端真会接受的条目。
3. **Windows 安装器换掉 NSIS 自己的品牌图**。欢迎/完成页的侧栏与内页页眉原先不是 Adelie 的
   （侧栏回落到 NSIS 自带位图、页眉空白）。现在两张图由 `render-installer-art.mjs` 按 NSIS 的硬
   尺寸（164×314 / 150×57，24 位 BMP）原生绘制并入库，测试钉住宽高、位深与配置里指向的仍是它们。
4. **侧栏的工作区分组人人可移除**。左侧工作区列表的分组不再只有创建者能摘；移除只影响列表
   （可恢复），不动任何数据。
5. **需求箱页头多了「最新版本」角标**（需求箱插件），读的是同源的 `/downloads/index.json`。
6. **默认端口换成 Adelie 自己的号**：服务端默认 `7364` → **`4000`**（旧 Adelie Web 一直在服务的
   地址，本机 ufw 与出口白名单里也这么写），dev CLI `7369` → `7370`（旧 Adelie CLI `serve` 的缺省）。
   上游 PenguinHarness 的服务端也占 7364，两个产品装在同一台机器上会抢同一个 socket。
   **已装机器不受影响**：部署单元显式配着 `PORT=7364`，`penguin update` 只换 `bin/lib/web/node`。
   受影响的是「全新安装、且没有显式配端口」的机器，与文档、帮助文案、Dockerfile、安装脚本的上手提示。
7. **工作区选择器随被浏览的机器适配**（移植上游 #962）。左栏由被浏览的那台机器按自己的规则回答：
   Windows 报盘符、macOS 读 `/Volumes`、Linux 读 `/proc/mounts` 与 XDG 用户目录；地址栏根部多了
   换位置的下拉，非 Mac 上 `Ctrl+L` / `Alt+D` / `F4` 编辑地址、`F5` 刷新。
8. **公司模式：工位忙时错过的 @ 不再丢**。待送达的提及进新表 `org_desk_mentions`（按
   员工/频道/消息去重，与频道扫描游标同一次对账落库），每次对账把待送达的 @ 合成一个工作轮送给
   空闲工位（每轮至多 20 条，发起成功才出队），重启或热更新不再静默清空；只有一条时正文与过去
   逐字相同。
9. **改名漏下的读写点**（容器 entrypoint 的数据根、需求箱安装脚本的优先级、截屏脚本）与两处
   边界面变量写侧的重构（`ADELIE_*` 与旧名并写，读侧两个都认）。

## 升级

桌面端（Windows / Linux 的 AppImage）在应用内更新：账号菜单的更新入口或应用菜单里的「检查更新」
会读到这一版，默认走 OSS 镜像，镜像不通自动回退 GitHub Releases。Windows 安装包仍未签名，
SmartScreen 会提示一次（「更多信息 → 仍要运行」）。

服务器 / CLI 装的（tar 包或 npm 全局）用同一条链路，数据根（`~/.adelie/data`）不动：

```bash
penguin update --check     # 看有没有新版
penguin update --yes       # 原地替换 bin/lib/web/node
```

| 产物 | 目标 |
| --- | --- |
| `adelie-desktop-win32-x64.exe` | Windows x64 桌面端（未签名，NSIS 安装器） |
| `adelie-desktop-linux-x86_64.AppImage` / `adelie-desktop-linux-amd64.deb` | Linux x64 桌面端 |
| `penguin-linux-x64.tar.gz` | Linux x64 命令行版（自带 Node 24.18.0） |
| `penguin-win32-x64.zip` | Windows x64 命令行版（自带 Node 与 MinGit） |
| `penguin-universal.tar.gz` | 任意平台（不带运行时，需要 Node ≥ 24） |
| `install.sh` / `install.ps1` | 在线安装脚本（`penguin update` 取的就是它） |
| `latest.yml` / `latest-linux.yml` | 桌面端自动更新读的元数据 |

安装包都在 GitHub Release 上：<https://github.com/lmliheng/Adelie/releases/tag/v0.3.3>；
同一份资产也在 OSS 镜像上（`.../releases/v0.3.3/` 与版本无关的 `.../latest/`）。
npm 上整条链同样是 **0.3.3**：`npm install -g @lmliheng/penguin-cli`。

## 质量门禁（本机跑过）

- `pnpm typecheck`（8 个工作区包）、`pnpm lint`（oxlint，0 警告 0 错误）、`pnpm format:check`
  （prettier）全过。
- 测试全绿：**8942 通过 / 16 跳过 / 0 失败**（docs 62 · ui 1003 · core 1359 · server 2625 ·
  cli 506 · web 2899 · desktop 286 · ui-gallery 131 · 四个 sandbox 插件 71）。

## 已知待办

- **没有代码签名**：Windows 的 Authenticode 与 macOS 的 Developer ID 都没有；macOS 的 dmg 会被
  Gatekeeper 拦，所以仍不发 macOS。
- 命令名仍是 `penguin`、数据根 `~/.adelie`；安装脚本与打包脚本里的产物名仍是 `penguin-*`。
- `.github/workflows/release.yml` 仍是上游那条（只能手动 dispatch），Adelie 自己的发布流水线还没写；
  这一版的安装包是「本机脚本 + `desktop-build.yml` 手工 dispatch」打的。
