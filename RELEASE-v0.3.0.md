# Adelie v0.3.0 —— 定时任务总表、插件市场一键安装、npm 包导入

这一版是 v0.2.3 之后的第一版功能合集：Web 端多了一张**定时任务总表**（从账号菜单进），插件市场
的卡片能直接看到每个 Agent 的安装状态并一键装上，插件导入支持 npm 包，`@lmliheng/*` 整条链换了
scope 并首次发上 npm，桌面端的图标换成了 Adelie 自己的标志。

## 关于版本号

Adelie 的 tag 一直走在自己的线上（v0.2.0 → v0.2.3），而 npm 上的 `@lmliheng/*` 继承的是上游的
开发版本号 —— 首次发布时就落在 **0.2.13**。所以这一版取 **0.3.0** 而不是 0.2.4：0.2.4 在 npm 上是
**降级**（`npm install @lmliheng/penguin-cli` 会拿到 0.2.13），而 0.3.0 在 tag 线、npm 线、桌面端
更新线三处都是前进。从源码跑的开发版（0.2.13）与已装的桌面端（0.2.3）都会看到这一版。

## 这一版改了什么（相对 v0.2.3）

1. **桌面端图标换成 Adelie 自己的标志**（`1db6dd80`）。`build/` 下的九张母版（`icon.png`、
   `icon-mac.png`、`icons/*`、`tray/*`）自 fork 前就没再生成过，安装包、任务栏、窗口左上角与托盘
   显示的一直是上游那只俯冲企鹅；这一版起是 Adelie 标志（蓝环里的阿德利企鹅）。**装过旧版的机器
   更新后即生效。**
2. **定时任务统一管理页**（`58b0b5c8`）。新增 `/schedules`，入口在左下角头像的账号菜单里：本项目
   所有 Agent 的定时任务在一页里按 Agent 分组，可统一启停、编辑与删除；页尾列出服务器跳过的
   解析失败文件（除这一页外，任何界面都看不见它们）。筛选与搜索只收窄组内的行。
3. **插件市场的一键安装与更新**（`fcc78f93`）。每张插件卡片标出当前 Agent 的安装状态
   （未安装 / 已安装 / 可更新），动作行首位是「安装到 <Agent>」或一次确认的更新。
4. **插件导入支持 npm 包**（`7302ff5e`）。给一个 `.tgz` 或 npm 包名即可导入：tgz 解码、registry
   解析、校验和一条链。
5. **`@lmliheng/*` 整条链**（`72e69bb3`、`5cf857f6`、`0003f63b`、`b0e37aad`）：宿主包（core /
   server / cli）与 14 个插件包的 scope 从 `@prismshadow/*` 换成 `@lmliheng/*` 并首次发布到 npm；
   你自己那两个插件（csu-mail、wechat-miniprogram）从 GitHub 仓库搬进本仓库、一起入库发布；
   csu-mail 现在两套密钥库键名都认。
6. **工作区选择器可以删掉空目录**（`e4cd22a8`）。
7. **新建对话页不再有底部那一排示例任务**（`53f63077`）；下拉面板的入场动效改成「慢-快-慢」
   （`8e6568e2`）。

## 升级

桌面端（Windows / Linux 的 AppImage）**可以在应用内更新**：账号菜单的更新入口或应用菜单里的
「检查更新」会读到这一版，下载与重启由你点。Windows 的安装包仍未签名，SmartScreen 会提示一次
（「更多信息 → 仍要运行」）；上一版已装的机器选「更新」即可，不必重装。

服务器/CLI 装的（tar 包或 npm 全局）用同一条链路：

```bash
penguin update --check     # 看有没有新版
penguin update --yes       # 原地替换 bin/lib/web/node，数据根（~/.adelie/data）不动
```

**这一版修了两处让「原地更新」落空的地方**（v0.2.3 的实际状态）：

- v0.2.3 的 Release **没有附 `install.sh` / `install.ps1`**，而 `penguin update` 第一步就是取它；
- Release 上的 CLI 包名是 `adelie-<target>.tar.gz`，而安装脚本按 `penguin-<target>.tar.gz` 取
  （实测前者 200、后者 404）。

这一版把两个安装脚本作为资产附上，CLI 包按安装脚本期望的名字发布，`penguin update` 因此能用。
（把包名统一成 `adelie-*` 归发布流水线重写的 4.2，届时安装脚本与打包脚本一起改。）

| 产物 | 目标 |
| --- | --- |
| `adelie-desktop-win32-x64.exe` | Windows x64 桌面端（未签名，NSIS 安装器） |
| `adelie-desktop-linux-x86_64.AppImage` / `adelie-desktop-linux-amd64.deb` | Linux x64 桌面端 |
| `penguin-linux-x64.tar.gz` | Linux x64 命令行版（自带 Node 24.18.0） |
| `penguin-win32-x64.zip` | Windows x64 命令行版（自带 Node 与 MinGit） |
| `penguin-universal.tar.gz` | 任意平台（不带运行时，需要 Node ≥ 24） |
| `install.sh` / `install.ps1` | 在线安装脚本（`penguin update` 取的就是它） |
| `latest.yml` / `latest-linux.yml` | 桌面端自动更新读的元数据 |

安装包都在 GitHub Release 上：<https://github.com/lmliheng/Adelie/releases/tag/v0.3.0>。

## 质量门禁（本机跑过）

- `pnpm typecheck`（8 个工作区包）、`pnpm lint`（oxlint，0 警告 0 错误）、`pnpm format:check`
  （prettier）全过。
- `pnpm -r test` 全绿：**8871 通过 / 9 跳过 / 0 失败**（docs 62 · ui 1000 · core 1350 ·
  sandbox-bwrap 24 · sandbox-dsh 5 · sandbox-seatbelt 17 · sandbox-wsl 25 · server 2592 · cli 505 ·
  web 2881 · desktop 279 · ui-gallery 131）。
- 桌面端 Linux 产物起过一次真进程、CLI 的 linux 包在隔离 HOME 里真装过（见发布时的核验记录）。

## 已知待办

- **没有代码签名**：Windows 的 Authenticode 与 macOS 的 Developer ID 都没有；macOS 的 dmg 会被
  Gatekeeper 拦，所以这一版仍不发 macOS。
- 命令名仍是 `penguin`、数据根 `~/.adelie`；安装脚本与打包脚本里的产物名仍是 `penguin-*`
  （4.2 的流水线重写一起改）。
- `.github/workflows/release.yml` 仍是上游那条（只能手动 dispatch、按上游名字出包），Adelie 自己的
  发布流水线还没写（`FORK-PROGRESS.md` 4.2）；这一版的安装包是「本机脚本 + `desktop-build.yml`
  手工 dispatch」打的。
