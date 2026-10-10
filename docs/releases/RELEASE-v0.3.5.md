# Adelie v0.3.5 —— 权限菜单给出具名沙箱预设、Linux 沙箱在默认 Ubuntu 上开箱即用、停靠面可全屏，外加一批界面修补

这一版是定时轮按 `LOOP.md` 的口径自动发的：自 v0.3.4 起 `main` 上落了 **12 个功能性提交**
（阈值 10），四道门禁全绿。**没有破坏性改动**：数据根、配置格式、HTTP 接口都没动，已装好的机器
不需要改任何配置。

## 这一版改了什么

1. **权限菜单改成四个具名预设**。输入框上的权限按钮不再列三档设置，而是
   **完全访问 / 每次询问 / 工作区可写 / 只读**，管理员再多一个「更多…」。一个预设 = 文件模式 +
   网络档 + 审批模式，选一次就把三项一起定在这条会话上；悬停给出这个预设拦什么、放什么、
   这台机器能不能真的执行它。**更多…**打开设置里的沙箱卡片：顶部多了一张预设表（名字、三列取值、
   置顶 / 拖动排序 / 设为默认 / 删除），卡片顶部另有**开关**决定新会话是否受限于沙箱，
   临时目录与掩蔽路径收进「高级」折叠（上游 `#975` 移植）。
2. **Linux 沙箱在默认的 Ubuntu 上开箱即用**。默认的 Ubuntu 24.04 上
   `kernel.apparmor_restrict_unprivileged_userns=1`，bubblewrap 起不来；现在走的是一条不需要 root 的
   路（Landlock），文档把「要网络隔离与掩蔽路径时才需要的那一步 root 操作」写成 CLI 快速上手里的
   一节（上游 `#978` / `#977` 移植）。
3. **停靠面可以拉到最大**。带标签页的停靠面现在能长到它的最大尺寸 —— 表头那颗按钮，或把边缘
   拖过上限即可，进出都有主题的布局动效；面板背后的清单变成一张注册表定义，面板列表都从它读
   （这是插件提供面板的接缝，上游 `#961` 移植）。
4. **评估与优化的对话回到普通会话列表**。评估中心「使用」打开的那条对话是普通会话，
   按带它干活的智能体归类，不再进会话列表的「评估任务」折叠夹 —— 那个折叠夹只留智能体自己
   `penguin run --source benchmark` 起的被测会话（上游 `#969` 移植）。
5. **手机上能选中并复制终端里的文本**。触摸设备过去做不出选区（xterm 关着 `user-select`，
   长按又被浏览器抢走），现在键栏多了**选择**与**复制**两颗键：进入选择后点一下取一个词
   （点在空白处取整行）、拖动把选区扩到手指所在的单元格，再按复制写进剪贴板；
   复制只在真的写成功之后才清掉选区。
6. **侧栏会话列表的「搜索会话」旁多了批量处理**。进入后每行多一个勾选框、列表上方升起批量栏：
   批量归档 / 批量取消归档 / 批量删除（删除仍走二次确认），退出即取消选择。
7. **随包插件的依赖按锁定版本安装，许可证随包发布**。构建按 `pnpm-lock.yaml` 的解析结果安装
   插件的原生依赖（对传递依赖也钉住版本），并在插件前缀的根上写出 `THIRD-PARTY-NOTICES.md`，
   它跟着插件走到哪就在哪（上游 `#979` 移植）。
8. **跨机修复**：机器的服务端在自己的会话里跑，通往机器的那一跳先于浏览器作答；声明构建
   这一次给足堆内存（上游 `#975` 之后）。
9. **CI 与测试**：CI 真跑四个沙盒插件的测试（跑不起来就报错）；ACL runner 的用例用自己的 60s
   期限，不再被 vitest 的 5s 默认切掉。

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

安装包都在 GitHub Release 上：<https://github.com/lmliheng/Adelie/releases/tag/v0.3.5>；
同一份资产也在 OSS 镜像上（`.../releases/v0.3.5/` 与版本无关的 `.../latest/`）。
npm 上整条链同样是 **0.3.5**：`npm install -g @lmliheng/penguin-cli`。

## 质量门禁（本机跑过）

- `pnpm typecheck`（8 个工作区包）、`pnpm lint`（oxlint，0 警告 0 错误）、`pnpm format:check`
  （prettier）全过。
- 测试全绿：**9261 通过 / 17 跳过 / 0 失败**（docs 62 · ui 1008 · core 1368(+5 跳过) ·
  server 2775(+4 跳过) · cli 507 · web 3032(+2 跳过) · desktop 286 · ui-gallery 131 ·
  四个 sandbox 插件 92(+6 跳过)）。

## 已知待办

- **没有代码签名**：Windows 的 Authenticode 与 macOS 的 Developer ID 都没有；macOS 的 dmg 会被
  Gatekeeper 拦，所以仍不发 macOS。
- 命令名仍是 `penguin`、数据根 `~/.adelie`；安装脚本与打包脚本里的产物名仍是 `penguin-*`。
- `.github/workflows/release.yml` 仍是上游那条（只能手动 dispatch），Adelie 自己的发布流水线还没写；
  这一版的安装包是「本机脚本 + `desktop-build.yml` 手工 dispatch」打的。
