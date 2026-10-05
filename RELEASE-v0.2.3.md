# Adelie v0.2.3 —— 桌面端第一次发布：自己的安装包、自己的更新链路

这一版把桌面端做完并首次发布：Windows 安装器、Linux 的 AppImage 与 deb。桌面壳的标识、打包
坐标与更新源从上游那套换成 Adelie 自己的，装出来的程序会自己去 `lmliheng/Adelie` 的 Releases
找新版本 —— 这是第一次真正能「装一个、以后在应用里更新」的版本。

同时并进 fork 以来最底层的两件事：本机数据根与安装目录改成 `~/.adelie`，控制面环境变量改成
`ADELIE_*`。

## 这一版改了什么（相对 v0.2.2）

1. **桌面壳第一次发布安装包**
   - Windows x64：`adelie-desktop-win32-x64.exe`（NSIS 安装器，可选安装目录）。
   - Linux x64：`adelie-desktop-linux-x86_64.AppImage`（`chmod +x` 后直接运行）与
     `adelie-desktop-linux-amd64.deb`（`sudo dpkg -i`，会顺带把 `penguin` 命令放到 PATH）。
   - **没有代码签名证书**，所以 Windows 上首次运行会有 SmartScreen 提示（「更多信息 → 仍要
     运行」）；Linux 的 AppImage 需要先 `chmod +x`。macOS 的流水线也能出 dmg/zip，但没有
     Developer ID 与公证，装了会被 Gatekeeper 拦住，所以这一版不发。
2. **桌面壳的身份与打包坐标换成 Adelie 自己的**
   - bundle id / AppUserModelID 用 `com.lmliheng.adelie` —— 与旧 Adelie 桌面壳同一个，所以
     装过旧版的机器是被升级，不会并排出现两个 Adelie；dev 实例是 `com.lmliheng.adelie.dev`。
   - 产物名 `adelie-desktop-*`；Linux 可执行名 `adelie`（deb 装到 `/opt/Adelie`）；打包的发布
     坐标指向 `lmliheng/Adelie`。
3. **桌面端的自动更新第一次真的能用**
   - 安装包旁带 `latest.yml` / `latest-linux.yml`，随 Release 一起发布；桌面壳的更新源
     （`packages/desktop/src/updater.ts`）与 CLI 的 `penguin update` 读的是同一个 Releases。
   - 检查更新只看，不会自己下载；下载与重启都由你点。自动检查启动 20 秒后一次、之后每 6 小时
     一次，静默进行（只在界面出个角标）；手动检查每种结局都有反馈。
   - Windows 目前**不校验更新包签名**：Adelie 还没有证书，而一旦配上 `publisherName`，
     electron-updater 会把自家未签名的安装包判成「不是期望的发布者」而拒绝安装。第一份签名版
     发布时会把校验与名单一起加回来（`electron-builder.yml` 里写清了条件）。
4. **数据根与安装目录归 Adelie**：`~/.adelie/data`、`ADELIE_HOME`（旧的 `PENGUIN_HOME` 仍然
   认，旧装的数据不会丢）；安装器默认装到 `~/.adelie`；已经装在 `~/.penguin` 的会被原地升级。
   桌面壳的 dev 根仍是 `~/.penguin/dev-data`，与其它 dev 入口共用，改名归 2.2c。
5. **控制面环境变量 25 个改名**（`PENGUIN_*` → `ADELIE_*`）：会话与 API、语言与终端、运行时
   开关、凭据与测试脚手架。**如果你自己的脚本或 CI 传这些变量，要跟着改**；数据根那两个名字
   （`ADELIE_HOME` / `PENGUIN_HOME`）保持兼容。桌面壳与启动器的那批变量
   （`PENGUIN_PROFILE`、`PENGUIN_WEB_DIST`……）这一版没动。

## 安装

| 产物 | 目标 | 说明 |
| --- | --- | --- |
| `adelie-desktop-win32-x64.exe` | Windows x64 | 桌面应用（Electron）。双击安装；未签名，首次运行有 SmartScreen 提示 |
| `adelie-desktop-linux-x86_64.AppImage` | Linux x64 | 桌面应用。`chmod +x` 后直接运行；应用内可自动更新 |
| `adelie-desktop-linux-amd64.deb` | Debian / Ubuntu | 桌面应用。`sudo dpkg -i`；更新走系统包管理器 |
| `adelie-linux-x64.tar.gz` | Linux x64 | 命令行版，自带 Node 运行时；解压 → `./install.sh` |
| `adelie-win32-x64.zip` | Windows x64 | 命令行版，自带 Node 与 MinGit；解压 → `install.cmd` |
| `adelie-universal.tar.gz` | 任意平台 | 命令行版，不带运行时，目标机器要有 Node ≥ 24 |

安装包都在 GitHub Release 上：<https://github.com/lmliheng/Adelie/releases/tag/v0.2.3> —— 桌面端的
自动更新读的也是这里。

命令名仍是 `penguin`（npm scope 与命令名改名归 4.1/4.2）。从源码运行、首次登录认领、在应用内
配置模型，见 [README](README.md)。

## 质量门禁（本机跑过）

- `pnpm typecheck`（八包）、`pnpm lint`（oxlint）、`pnpm format:check`（prettier）全过。
- `pnpm -r test` 全绿（数与 v0.2.2 同量级：desktop 279、ui-gallery 131，其余各包见下）。
- 桌面端真跑过（不是只看构建成功）：把打出来的 AppImage 在无图形界面的机器上用 xvfb 起了一次，
  窗口与内嵌服务端都起来（日志 `Adelie 0.2.3 starting`、`penguin-server started`、
  `Desktop mode: enabled`、`GET /api/me 200`），数据根是 `~/.adelie/data`，`penguin` 装进
  `~/.local/bin`。
- **更新链路端到端验过**：让这个构建去读一个本地 feed（`PENGUIN_UPDATE_FEED_URL` 起一个静态
  HTTP 服务，`latest-linux.yml` 的版本抬到 0.2.4），应用日志里确实报出
  `update available: 0.2.4 (offered)` —— 检查、比较版本、把新版呈现给用户这条链路是通的。
- Windows 安装器由仓库自己的 `desktop-build.yml` 在 GitHub 的 windows-latest 跑机上打出
  （Actions run 37303505078，三个平台全绿），产物是 NSIS 自解压安装器、`latest.yml` 报
  `version: 0.2.3`。**没有在真 Windows 机器上跑过**（这句是事实，不是谦虚）。

## 已知待办

- **代码签名**：Windows 的 Authenticode 与 macOS 的 Developer ID 都没有，所以现在是未签名分发；
  有证书之后要把 `electron-builder.yml` 的 `verifyUpdateCodeSignature` 与 `publisherName`
  一起打开。
- **macOS 安装包**：流水线能出（未签名 dmg/zip），但会被 Gatekeeper 拦，所以不发。
- 桌面壳与启动器的 `PENGUIN_*` 变量名、桌面 dev 数据根（2.2c）；命令名 `penguin` 与 npm
  scope `@prismshadow/*`（4.1）；发布流水线还没写成 Adelie 自己的（4.2）—— 这一版的安装包是
  本机脚本 + Actions 手工 dispatch 打的，清单在 [`FORK-PROGRESS.md`](FORK-PROGRESS.md)。
