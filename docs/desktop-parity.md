# 桌面端对齐（Penguin → Adelie）

> **第一版：** 2026-10-04（对应 `main` 上「桌面壳对齐」那一批，见 `CHANGELOG.md` 未发布节）
> **对照依据：** `docs/research/penguin-desktop-features.md` —— 对 `penguin-harness` 0.2.13
> 桌面端的只读研究，71 条功能（壳 55 + 界面 16）+ 6 段机制说明 + 每条功能的「最小可移植版本」。
>
> 这份文档记的是**对照结果**，不是研究：每一条 Penguin 有的能力，Adelie 现在是哪一种状态、
> 为什么、下一步谁来做。四类：
>
> | 记法 | 意思 |
> | --- | --- |
> | **已具备** | Adelie 现在就有（标注是本轮补的还是原来就有） |
> | **不适用** | Adelie 的形态让这条没有意义（写明为什么） |
> | **不做** | 有意识放弃（写明理由，别当成欠账） |
> | **待办** | 该做没做，重的都开了草稿 |

## 0. 两条形态差异（后面很多「不适用」都由它俩推出来）

1. **Adelie 的桌面端只有一个人用，且壳与内嵌服务端之间没有凭证。** 服务端绑 `127.0.0.1`，
   把「能读到 `~/.adelie` 的人」认成主机管理员（`packages/server/src/identity.ts`）。
   于是 Penguin 那一整套「壳怎么把登录态交给界面」在 Adelie 下没有对应物 ——
   这不是省略，是 `docs/issues/desktop-shell-loopback-identity.md`（#3）里那条取舍的结果。
2. **Adelie 的界面目前只有「会话 + 时间线 + 设置」这一片**（`packages/web/src/components/`）。
   终端面板、文件浏览器、内置浏览器都不存在，所以 Penguin 那些「挂在面板上的桌面能力」
   在 Adelie 下缺的不只是桌面那一半，而是整个功能面。

## 1. 本轮补齐的（12 条，都有真机冒烟）

| Penguin 的能力 | Adelie 现在是什么 | 落在哪 |
| --- | --- | --- |
| 端口记忆 | 先试上次的端口，绑不上才让内核分配；端口写进 `<userData>/port.json`。**界面状态是按 origin 存的**，这条是「设过的还在」的前提 | `packages/desktop/src/port-memory.ts` |
| 主窗口形态 / 窗口状态 | 尺寸与位置落盘、读回来先夹进屏幕 `workArea`、最大化状态记住 | `window-state.ts`、`storage-paths.ts` |
| 系统托盘图标 | 图标按平台尺寸渲染；建不起来只记日志（`new Tray` 在没托盘服务的环境里会抛） | `tray.ts` |
| 托盘菜单 | 打开 / 在浏览器里打开 / 关窗留守（勾选）/ 打开数据目录 / 查看日志 / 退出；**每次弹出前重建** | `tray-menu.ts`、`tray.ts` |
| 托盘平台差异 | Linux 挂常驻菜单；Windows/macOS 左键唤起、右键弹菜单 | `tray-menu.ts` `trayPlatformStyle` |
| 关闭到托盘 | 关窗只是 `hide()`，三个条件同时成立才留守 | `tray-prefs.ts` `hidesOnClose` |
| 托盘偏好持久化 | `<userData>/tray.json`，写临时文件再 rename，读坏了当默认值 | `tray-prefs.ts` |
| 应用菜单 | 文件（数据目录 / 日志 / 退出）、编辑与视图（复用 `role`）、帮助（关于，带版本与日志路径） | `app-menu.ts` |
| 日志文件 | 每行 ISO 时间戳、5 MB 轮换成 `.1`、**写失败即静默关掉**；内置服务端的 stdout/stderr 接进同一个文件 | `desktop-log.ts` |
| 进程死亡记录 | 渲染进程崩溃 / 无响应 / 恢复 / 加载失败各记一行 | `main.ts` |
| 外链交给系统 | `setWindowOpenHandler` + `will-navigate` 双守卫；只放行 `http`/`https`/`mailto` | `links.ts`、`main.ts` |
| 安装 CLI（POSIX）+ 克制规则 + 每次启动自修复 | `~/.local/bin/adelie`，内容是 `ELECTRON_RUN_AS_NODE=1 exec <exe> <cli.js> "$@"`；不覆盖别人的、不从 AppTranslocation 装 | `cli-link.ts`、`cli-install.ts` |

另外把一个**此前静默失效**的地方修了：开发态取窗口图标时找的是 `brand/icons/icon.png`，
而仓库里只有 `128x128/256x256/512x512.png` —— 图标一直是空的，新加的托盘也会因此不显示。
现在按「存在的文件」取（`main.ts` `iconFile()`）。

**真机验证**（Linux + `xvfb-run`，无人值守）：启动 → 端口沿用（第二次的日志是
`端口 36931（沿用上次）`）→ 内置服务端就绪、页面加载无失败 → 托盘图标建起来 →
CLI 装好并能跑出 `adelie 0.1.0` → `SIGTERM` 后走正常退出序列（`before-quit` 收尾、
`window.json` 落盘、无残留进程）。顺带实测：**Electron 自己**接住 SIGINT/SIGTERM 并走正常
退出序列，主进程里 `process.on("SIGTERM")` 不会被调用。

## 2. 不适用（Adelie 的形态决定的）

| Penguin 的能力 | 为什么在 Adelie 下没有意义 |
| --- | --- |
| 启动即登录（一次性令牌） | 回环 + 主机管理员：界面本来就不需要登录。要不要改成凭证见 issue #3 |
| 附着模式的自我登录 / 登录页兜底救援 / 尊重退出登录 | 同上 —— 没有登录态可交接 |
| 子窗口加固 / 子窗口在登录页即关闭 | Adelie 的壳不开子窗口（`setWindowOpenHandler` 一律拒绝，外链交给系统） |
| 没有「修改密码」/「登出入口」 | Adelie 的主机身份没有密码；P3 加的用户口令只对「登录进来的用户」有意义 |
| Penguin Go 授权在桌面直接打开 | Adelie 没有第三方 OAuth 授权流 |
| 托盘「最近会话」/任务指示 | 两边都刻意不做（Penguin 的 changelog 记为不做，理由是壳不向服务端查询状态） |

## 3. 不做（有意识放弃，不是欠账）

| Penguin 的能力 | 为什么不跟 |
| --- | --- |
| 安装 CLI（macOS，`osascript` 提权）/（AppImage 包装脚本） | Adelie 桌面端目前**只做 Windows**（`packages/desktop/README.md`）；POSIX 那条已经在 Linux 上跑通，等真要发 Linux 包时再说 |
| macOS 文件夹授权（TCC）+ Workspace 选择器「允许访问」 | macOS 专属，且需要界面里有 Workspace 选择器（现在没有） |
| 打包三平台（dmg / AppImage / deb） | 同上；Windows 的 NSIS + portable 已经配好 |
| 内置浏览器：面板 / 导入系统浏览器登录态 / 清数据 / 负载警告（壳侧 2 条 + 界面 4 条） | 这是**一整个产品特性**，不是桌面壳的能力。Adelie 的定位是「会话 + 工具时间线」，加内置浏览器等于换产品 |
| 拆出终端窗口 / Workspace HTML 预览新窗口 /「在文件夹中显示」 | 缺前置：Adelie 的界面里没有终端面板、没有预览、没有文件浏览器。等那些界面做出来，这里的三条才有对象 |
| 登录 shell 环境导入 | 主要解 macOS 从 Dock 启动拿不到 `.zshrc` 的问题；Windows 上更相关的是 MinGit（见待办）。真要做时它的价值在于「让 Agent 看到用户的 API key」——那是另一条需求 |

## 4. 待办（重的都开了草稿）

### 已开草稿

| 待办 | 草稿 | 档 |
| --- | --- | --- |
| 崩溃自愈（服务端重启 + 界面重载，都要退避） | `docs/issues/desktop-no-crash-recovery.md`（#12） | P2，无新依赖 |
| 自动更新（接入 / 判定 / 调度 / 状态 / 签名，Penguin 的 5 条合成一条） | `docs/issues/desktop-no-auto-update.md`（#11） | P2；**签名是阻塞项** |
| 托盘开关与语言由界面控制（新增 `/api/desktop/tray`） | `docs/issues/desktop-tray-web-control.md`（#15） | P3，要改契约 |
| 无人值守冒烟钩子（`ADELIE_DESKTOP_SMOKE`） | `docs/issues/desktop-smoke-hook.md`（#14） | P2，是下面那条的前提 |
| 同一个数据根上起多个服务端（写 `server.lock` + 附着已有实例） | `docs/issues/desktop-attach-running-server.md`（#10） | P2 |
| Windows 打包形态下的 CLI 安装与 Path 写入未验证 | `docs/issues/desktop-windows-cli-unverified.md`（#16） | P2，未验证 |
| 单机桌面模式要不要隐藏用户管理 | `docs/issues/desktop-single-user-hides-admin.md`（#13） | P2，**要人拍板** |

### 还没开草稿的小项（先记在这里，别让它只活在聊天记录里）

| 待办 | 代价 | 备注 |
| --- | --- | --- |
| 数据根优先级（`ADELIE_HOME`） | 低 | Penguin 是 `PENGUIN_HOME > release 根 > dev 根`；Adelie 现在只有「打包/源码」两态 |
| `--dev` 第二实例（独立数据根 + 独立单实例锁） | 中 | 源码运行的 `Adelie (dev)` 目录本轮已经钉住，缺的是「安装版也能再开一个隔离实例」 |
| 把内置 CLI 的入口交给会话（`ADELIE_CLI_ENTRY`） | 低 | 让 Agent 用应用自带的那份 `adelie`，而不是去找 PATH 里的 |
| 任务完成系统通知（窗口失焦时） | 中 | 需要 web 侧一条 `Notification`；Windows toast 依赖 `setAppUserModelId`（已有） |
| 系统代理注入（跟随系统代理） | 中 | 用 `session.resolveProxy` 解析后注入子进程 env |
| MinGit 随包（Windows） | 中 | 让 Agent 的 shell 行为与 npm 安装一致；要额外带一份二进制 |
| 对话里链接的应用内右键菜单 | 中 | 依赖 web 侧识别 `Electron/`；现在外链已经在系统浏览器打开，属于打磨 |
| 更细的新窗口分类策略 | 高 | 等有了预览/终端拆出窗口再做，现在「一律拒绝 + 交系统浏览器」是对的 |

## 5. 建议的顺序

1. **冒烟钩子**（`desktop-smoke-hook`）—— 它是另外两条的前提：桌面壳的接线目前只能靠
   人肉拼命令验证，而本轮的改动全在那一层。
2. **崩溃自愈**（`desktop-no-crash-recovery`）—— 无新依赖、收益直接（长任务不再因为一次
   崩溃全停），有了冒烟钩子就能自动回归。
3. **Windows 验证 + 数据根锁**（`desktop-windows-cli-unverified`、
   `desktop-attach-running-server`）—— 前者是「已经写好的东西到底对不对」，后者是
   「两个服务端抢一个 SQLite」这类最难归因的问题。
4. **单用户的形态判据**（`desktop-single-user-hides-admin`）—— 拍板之后，托盘开关、更新行
   这些「桌面专属界面」才有统一的判据可用，否则每个功能都要各自猜一遍。
5. 最后才是自动更新：它需要签名证书（外部条件），而在拿到证书之前，
   `0.1.0` 的用户本来也只能手动重装。
