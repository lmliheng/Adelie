# Adelie v0.3.2 —— 用户级全局密钥、默认 Adelie 图标头像、桌面端默认走 OSS 镜像

这一版是需求箱巡台里三条 `high` 需求的产物，另外把一条已提交未发版的界面改动一起带出来。桌面端、
命令行与服务端的升级路径都没变 —— 已装好的机器不需要改任何配置。

## 这一版改了什么

1. **用户级的「全局密钥」**。账号菜单（左下角那个上拉框）多了一行「用户密钥」：可以一条条加键值对，
   也可以把整段 JSON 贴进去一次导入；值在界面上永远只显示掩码，明文不出服务端。存储是
   `<数据根>/users/<用户 id>/.vault.toml`（0600），与 Agent 级密钥同一套键名规则和环境变量注入口径。
   在「智能体设置 → 密钥」里多了「从用户密钥分配」：勾几条，一次拷进该 Agent 的密钥库（同名的覆盖，
   该 Agent 其他的条目原样保留）。**这是一次性拷贝，不是引用** —— 全局值之后改了，Agent 不会自动
   跟着变，重新分配一次即可；这句话也写在界面上。
2. **默认头像改成 Adelie 图标**。没有设过头像的账号，以及全部智能体，画的都不再是字母盘 / 按 id
   哈希着色的字母块，而是 Adelie 自己的品牌标记（与 app 图标同一份画，内联在 UI 包里，Web 包的
   静态资源不参与）。已设头像的账号照旧显示自己的图。
3. **桌面端默认从 OSS 镜像检查更新**。默认 feed 从 GitHub Releases 改成阿里云 OSS 镜像的 generic
   feed（`https://adelie-releases.oss-cn-hangzhou.aliyuncs.com/latest`），镜像不通时自动回退到
   GitHub Releases —— 回退只发生在镜像上；`PENGUIN_UPDATE_FEED_URL` 仍然最高优先，且它指名的 feed
   不会被回退改写（端到端更新测试用的就是它）。国内点「检查更新」不必再等 github.com。
4. **侧栏页签折叠条改小**（提交 `9d781b53`，此前已提交但没有发版）：满宽 272px 的灰条换成居中
   64×20 的小 pill，提示沿用原来的文案。用户可见的改动攒着不发等于没做，所以这一版把它一起带出来。

## 升级

桌面端（Windows / Linux 的 AppImage）在应用内更新：账号菜单的更新入口或应用菜单里的「检查更新」
会读到这一版 —— 从这一版起默认走 OSS 镜像，国内会明显快一些，镜像不可用时自动回到 GitHub Releases。
Windows 安装包仍未签名，SmartScreen 会提示一次（「更多信息 → 仍要运行」）。

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

安装包都在 GitHub Release 上：<https://github.com/lmliheng/Adelie/releases/tag/v0.3.2>；
同一份资产也在 OSS 镜像上（`.../releases/v0.3.2/` 与版本无关的 `.../latest/`）。
npm 上整条链同样是 **0.3.2**：`npm install -g @lmliheng/penguin-cli`。这一版里还并入了两个新插件
（`requirements-box`、`lesson-video`），也从这一版开始可装。

## 质量门禁（本机跑过）

- `pnpm typecheck`（8 个工作区包）、`pnpm lint`（oxlint，0 警告 0 错误）、`pnpm format:check`
  （prettier）全过。
- 测试全绿：****8891 通过 / 14 跳过 / 0 失败**（docs 62 · ui 1003 · core 1359 · server 2600 · cli 505 · web 2877 · desktop 283 · ui-gallery 131 · 四个 sandbox 插件 71）**。
- 三条需求各自在真环境里核过：用户级密钥走了真 HTTP（掩码、非法键名 400、导入、分配）与真浏览器
  （导入 → 分配 → Agent 密钥表）；头像在 ui-gallery 的头像板与真页面（智能体列表）上看过浅色与
  深色；桌面端在打完的 AppImage 里读日志确认 feed 指向镜像、镜像应答、没有触发回退。

## 已知待办

- **没有代码签名**：Windows 的 Authenticode 与 macOS 的 Developer ID 都没有；macOS 的 dmg 会被
  Gatekeeper 拦，所以这一版仍不发 macOS。
- 命令名仍是 `penguin`、数据根 `~/.adelie`；安装脚本与打包脚本里的产物名仍是 `penguin-*`。
- `.github/workflows/release.yml` 仍是上游那条（只能手动 dispatch），Adelie 自己的发布流水线还没
  写；这一版的安装包是「本机脚本 + `desktop-build.yml` 手工 dispatch」打的。
- 「分配」是一次性拷贝（上面第 1 条）：如果希望全局密钥改一次就自动传给所有已分配的 Agent，那是
  另一条改动（要动 core 的运行时注入路径），留在需求箱里再说。
