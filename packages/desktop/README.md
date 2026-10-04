# adelie-desktop

Adelie 的桌面端（Windows 先行）。壳很薄：起一个内置服务端，开一个窗口指向它。

```
打包后                                源码运行
resources/app/                        packages/desktop/
  dist/main.js      ← 壳              dist/main.js     ← tsup
  dist/server.js    ← 内联服务端      （服务端从 ../server/dist/main.js 读）
  web-dist/         ← Web 构建产物    （Web 从 ../web/dist 读）
  cli-dist/         ← 自带 CLI        （CLI 从 ../cli/dist 读）
```

## 开发

```bash
pnpm --filter adelie-server build   # 壳 fork 的是服务端的构建产物
pnpm --filter adelie-web build      # 窗口要加载的页面
pnpm --filter @lmliheng/adelie build  # 自带 CLI（`adelie` 命令）
pnpm desktop                        # = electron packages/desktop
```

窗口里就是 `http://127.0.0.1:<端口>`。壳只绑回环 —— 桌面应用的接口不该出现在局域网上；
要让手机连，用 `adelie serve --host 0.0.0.0`（那条路带 token）。

无图形界面的机器上也能跑起来（冒烟用）：

```bash
HOME=<临时目录> XDG_CONFIG_HOME=<临时目录>/config \
  xvfb-run -a ./node_modules/.bin/electron . --no-sandbox --disable-gpu
# 落盘产物全在 <临时>/config/Adelie (dev)/ 与 <临时>/home/.local/bin/adelie
```

## 打包（Windows）

```bash
pnpm --filter adelie-desktop pack:win
# 产物：packages/desktop/out/Adelie-Setup-<version>-x64.exe（NSIS 安装包）
#       packages/desktop/out/Adelie-Portable-<version>-x64.exe（免安装）
```

Linux/macOS 上能打出 Windows 包（要 wine），但真正的发布走 `.github/workflows/release.yml`
（`windows-latest` 上打包，产物直接挂到 GitHub Release）。签名不在这个版本里。

## 壳做什么

| 能力 | 行为 |
| --- | --- |
| 端口记忆 | 先试上次那个端口，绑不上才让内核分配；写进 `<userData>/port.json`。**界面状态是按 origin 存的**，换端口 = 用户以为「我设过的全没了」 |
| 窗口状态 | 尺寸与位置落盘（`window.json`），读回来先夹进当前屏幕的可用区（拔掉外接屏后不会开在屏幕外） |
| 托盘 | 打开 / 在浏览器里打开 / 关窗留守（勾选）/ 打开数据目录 / 查看日志 / 退出。关窗留守要三个条件同时成立，否则会造出「没窗口也没图标、进程还在跑」的死角 |
| 日志 | `<userData>/logs/desktop.log`，每行一条 ISO 时间戳、5 MB 轮换成 `.1`；崩溃、无响应、加载失败都记 |
| 自带 CLI | 装上就把 `adelie` 挂到 PATH（启动脚本用 `ELECTRON_RUN_AS_NODE=1` 跑应用自带的运行时，**用户不需要装 Node**）；不覆盖不是我们写的 `adelie` |
| 外链 | 站内跳转原样放行；其余只把 `http`/`https`/`mailto` 交给系统浏览器（`file:`、自定义协议一律拒） |

逐条与 penguin 桌面端的对照、以及还没做的（崩溃自愈、自动更新、托盘开关的界面入口…）
见 **[`docs/desktop-parity.md`](../../docs/desktop-parity.md)**。

## 职责边界

| 做 | 不做 |
| --- | --- |
| 挑空闲端口、拉起服务端、等 `/api/health`、退出时先 `POST /api/shutdown` 再兜底杀 | 任何业务逻辑 —— 对话、审批、工具时间线都在 Web 里 |
| 单实例（第二次启动抬窗口）、托盘与菜单、日志、外链交给系统 | 自定义协议、私有 IPC（壳与页面之间只有 HTTP/SSE） |

## 已知边界

- **崩了不自愈**：内置服务端退出后窗口会停在「连不上」；渲染进程崩了页面也不重载。
  现在只留日志，要重启应用（见 issue #12）。
- **同一个数据根上可以跑起多个服务端**：桌面端与 `adelie serve` 各起一个，互不知道
  （见 issue #10）。
- **Windows 形态没有验证过**：`cli-dist` 的实际布局、写用户 Path 那条路都只在 Linux 上
  验过纯逻辑（见 issue #16）。仓库现有的安装包还是 v0.1.0 的，不含这一批。
- 签名不在这个版本里：更新校验、SmartScreen 警告都还没有对策（见 issue #11）。
