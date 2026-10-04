---
title: "desktop: 壳没有崩溃自愈 —— 服务端退出后界面就停在那儿，页面崩了也不会重载"
labels: [欠账, scope:desktop, P2]
issue: 12
---

## 现象

桌面壳把「崩溃」当成了要记录的事件，没当成要恢复的事件：

- 内置服务端异常退出时，`server-process.ts` 只做了 `logStream.end()`；窗口继续指向一个
  已经没人监听的端口，用户刷新之后看到 `ERR_CONNECTION_REFUSED`，不会自愈。
- 渲染进程崩溃时，`main.ts` 只写一行日志（`界面进程退出：…`），窗口停在空白或崩溃页上。
- 两种情况下壳自己都不知道该做什么 —— 用户看到的是「界面卡住了」，而日志里其实记着原因。

## 复现

```bash
# 1) 服务端崩溃：应用起来之后杀掉内置服务端
pkill -f "adelie-server\|packages/desktop/dist/server.js"
# 窗口里点任意操作 → 请求失败；按 F5 / 菜单「重新加载界面」→ ERR_CONNECTION_REFUSED
# 2) 渲染进程崩溃：主进程里调 webContents.forcefullyCrashRenderer()（或窗口里点崩溃）
```

日志（`<userData>/logs/desktop.log`）会留下 `界面进程退出：crashed（exitCode …）`，
然后就没有然后了。

## 期望

两条独立的自愈路径，都要带退避（**不能**退化成无限重载循环）：

- **界面**：`render-process-gone` → `webContents.reload()`；连续失败时把等待翻倍
  （0/1/2/4…≤30s），页面健康存活一段时间就清零计数。
- **服务端**：`child.on("exit")` 且不是退出中 → 按同样的退避重启（上限 3 次），
  重启成功就把窗口重新指向新 origin；到上限弹一次错误框（带上日志路径）再退出。

## 影响

- 用桌面端跑长任务的人受影响最大：Agent 干活跑了几十分钟，一次崩溃全部停下，而界面
  看起来只是不动了，用户会等，不会想到去看日志。
- 现在没有绕过办法，只能手动重启应用；重启之后端口记忆会救回界面状态（本轮已做），
  但那次任务的会话事件是否完整要另说（服务端是追加写的，硬崩会截断最后一行）。
- 预期收益明确：这是 Penguin 桌面端里两条独立功能的合并，实现都不依赖原生模块。

## 证据

- `packages/desktop/src/main.ts:181`（`render-process-gone` 只 `log.error`）、
  `:184`（`unresponsive` 只记一行）。
- `packages/desktop/src/server-process.ts:81`（`child.on("exit")` 里只有 `logStream.end()`）。
- 参考实现与退避算法：`docs/research/penguin-desktop-features.md` §1「服务端崩溃自愈」
  「界面崩溃自愈」两行，以及 §4 对应的「最小可移植版本」两条。
