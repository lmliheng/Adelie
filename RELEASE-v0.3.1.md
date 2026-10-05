# Adelie v0.3.1 —— 默认中文与人民币、快捷指令可折叠、模型库去掉连接横幅、插件导入规则另起 dialog

v0.3.0 之后的四条界面调整，都来自使用后的具体反馈；另外并入一条部署变量的兼容改动。桌面端、
命令行与服务端的升级路径都没变 —— 已装好的机器不需要改任何配置。

## 这一版改了什么

1. **默认中文 + 默认人民币**。没有在这台浏览器上存过偏好时，界面语言取**中文**、价格按**人民币**
   显示，不再跟随设备语言与美元。理由是这份产品先给中文读者用：设备是英文并不等于它的使用者要
   英文词典。「跟随系统」与「美元」仍是设置里的选项，存过偏好的照旧照办。价格的存储与换算一点
   没动（仍是 USD/million tokens，`USD_TO_CNY = 7`），变的只是默认的显示口径 —— **不需要重新
   配置任何模型价格**。
2. **「我的快捷指令」文件夹能合上了**。新建会话页输入框下那一行原本是个「页签」：点开就开着，
   再点无效，而它自己的折叠箭头一直在承诺一个并不存在的动作。现在点一下开、再点一下关。
3. **模型库不再自动铺一块 TokenDance 连接横幅**。那块「连接 TokenDance 钱包，无需手动配置模型
   密钥」在没有配置 key 时会出现在分组列表上方，每次进页面都把它往下推一次。TokenDance 分组自己
   的「连接」入口（带连接状态点）本来就在，横幅不是唯一的去处，因此整块去掉；只被它使用的动画、
   样式与一条浏览器存储登记一并清掉。
4. **插件导入的规则收进独立的对话框**。上传与下载两个对话框底部原来各铺着两段编号列表（导入规则
   ＋ 编写规则），字多到把字段和确认按钮挤下去。现在底部只留一个「导入与编写规则」的文字入口，
   点开是一个标题为「插件导入与编写规则」的对话框，内容一字未改；Escape 只关规则那一层，下面的
   导入对话框还开着。
5. **部署变量新旧名字都认**。数据根那批变量上一版改名成了 `ADELIE_*`；还有一批名字的**值是由本
   仓库之外的程序写进去的**（桌面壳的启动环境、既有部署的 systemd 单元、旧安装器的启动脚本），
   它们没法跟改名同步。这一版起**读侧同时认两个拼写**：`ADELIE_*` 优先，旧的 `PENGUIN_*` 仍然
   读得到（`WEB_DIST` / `WEB_DB` / `PORT_FILE` / `DESKTOP_TOKEN` / `CLI_ENTRY` / `PROFILE` /
   `BUNDLED_SHELL`）。换句话说：**已经在跑、配置文件里还写着旧名的部署，照旧能起来**。

## 升级

桌面端（Windows / Linux 的 AppImage）在应用内更新：账号菜单的更新入口或应用菜单里的「检查更新」
会读到这一版。Windows 安装包仍未签名，SmartScreen 会提示一次（「更多信息 → 仍要运行」）。

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

安装包都在 GitHub Release 上：<https://github.com/lmliheng/Adelie/releases/tag/v0.3.1>。
npm 上整条链（3 个宿主包 + 16 个插件包）同样是 **0.3.1**：`npm install -g @lmliheng/penguin-cli`。

## 质量门禁（本机跑过）

- `pnpm typecheck`（8 个工作区包）、`pnpm lint`（oxlint，0 警告 0 错误）、`pnpm format:check`
  （prettier）全过。
- 测试全绿：**8878 通过 / 14 跳过 / 0 失败**（docs 62 · ui 1000 · core 1359 · sandbox-bwrap 24 ·
  dsh 5 · seatbelt 17 · wsl 25 · server 2594 · cli 505 · web 2877 · desktop 279 · ui-gallery 131）。
- 四条改动在真页面上逐条核过：默认语言、¥ 计价、横幅消失而分组连接入口仍在、文件夹开合、
  两个导入对话框的规则入口与 Escape 层级。

## 已知待办

- **没有代码签名**：Windows 的 Authenticode 与 macOS 的 Developer ID 都没有；macOS 的 dmg 会被
  Gatekeeper 拦，所以这一版仍不发 macOS。
- 命令名仍是 `penguin`、数据根 `~/.adelie`；安装脚本与打包脚本里的产物名仍是 `penguin-*`
  （流水线重写时与安装脚本一起改）。
- `.github/workflows/release.yml` 仍是上游那条（只能手动 dispatch），Adelie 自己的发布流水线还
  没写；这一版的安装包是「本机脚本 + `desktop-build.yml` 手工 dispatch」打的。
