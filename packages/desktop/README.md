# adelie-desktop

Adelie 的桌面端（Windows 先行）。壳很薄：起一个内置服务端，开一个窗口指向它。

```
打包后                                源码运行
resources/app/                        packages/desktop/
  dist/main.js      ← 壳              dist/main.js     ← tsup
  dist/server.js    ← 内联服务端      （服务端从 ../server/dist/main.js 读）
  web-dist/         ← Web 构建产物    （Web 从 ../web/dist 读）
```

## 开发

```bash
pnpm --filter adelie-server build   # 壳 fork 的是服务端的构建产物
pnpm --filter adelie-web build      # 窗口要加载的页面
pnpm desktop                        # = electron packages/desktop
```

窗口里就是 `http://127.0.0.1:<随机端口>`。壳只绑回环 —— 桌面应用的接口不该出现在局域网上；
要让手机连，用 `adelie serve --host 0.0.0.0`（那条路带 token）。

## 打包（Windows）

```bash
pnpm --filter adelie-desktop pack:win
# 产物：packages/desktop/out/Adelie-Setup-<version>-x64.exe（NSIS 安装包）
#       packages/desktop/out/Adelie-Portable-<version>-x64.exe（免安装）
```

Linux/macOS 上能打出 Windows 包，但真正的发布走 `.github/workflows/release.yml`
（`windows-latest` 上打包，产物直接挂到 GitHub Release）。签名不在这个版本里。

## 职责边界

| 做 | 不做 |
| --- | --- |
| 挑空闲端口、拉起服务端、等 `/api/health`、退出时先 `POST /api/shutdown` 再兜底杀 | 任何业务逻辑 —— 对话、审批、工具时间线都在 Web 里 |
| 单实例（第二次启动抬窗口）、外链走系统浏览器 | 自定义协议、私有 IPC（壳与页面之间只有 HTTP/SSE） |

## 已知边界

- 服务端是**子进程**：它崩了窗口会停在「连不上」，需要重启应用（v0.1 不做自动重启）。
- 端口每次启动重新分配（`findFreePort`），所以书签式的 `http://127.0.0.1:7370` 只对
  `adelie serve` 成立，对桌面端不成立。
