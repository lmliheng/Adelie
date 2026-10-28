# 「检查更新」重新去查源，不再把上次的结果当成最新的

- **Date:** 2026-10-28
- **Type:** fix
- **Scope:** `desktop`
- **Breaking:** no

[English](2026-10-28-check-updates-reads-feed.md)

桌面端点「检查更新」，有时候会告诉你一个已经过时的版本。原因是：只要查到过一个新版本，壳子就把这条
可更新提示当成了定局 —— 再点一次检查（菜单里的、更新弹窗里的）只是把同一个版本重新显示一遍，根本没去
问源；每六小时一次的自动检查也因为同一个理由跳过。这中间云端又发了新版本，于是整段会话里显示的始终是
上一次查到的那个。

现在只要检查还能跑，就去读源：菜单项、弹窗里的检查、定时检查都一样。查到更新的版本就换掉手上这条
提示（什么都不会下载，它只是一句「有这一版」）；查到已是最新就把提示撤掉。唯一还
不去查源的情况是：正在下载、已经有安装包在等重启、或者另一个检查已经在路上 —— 这时候行里直接拿到当前
状态，菜单项则会弹出一个说明。

## 细节

- `packages/desktop/src/updater.ts`：`check()` 不再因为状态是 `available` 就提前返回，只挡「下载中」
  与「已下载待安装」（这两处重新查会把安装按钮指向的包作废）。`handleUpdaterCommand("check")` 与
  `checkForUpdatesManually()` 都改成用 `manualCheckAsksFeed(status)` 判断能不能查，能查就跑同一个
  `check()` —— 站着的提示会被重新读一次，而不是原样重放。
- `packages/desktop/src/updater-status.ts`：新增 `manualCheckAsksFeed` —— 判断「用户点的这次检查能不能
  真的跑」的唯一一处（`downloading` / `downloaded` / `checking` 之外都能）。状态折叠规则没动：提示
  还在时，检查期间的 `checking` 帧和同版本的重播都不会替换它，所以刷新过程中那句话不会闪掉。
- `packages/desktop/test/updater-status.test.ts`：把 `manualCheckAsksFeed` 在各个状态下都钉住了 ——
  包括 `available`，正是这次要修的那一格。

## 兼容

- 协议与存储都没变：`DesktopUpdateStatus` 和各条更新命令帧的形状不变。
- 定时检查现在会在提示还在时也去问一次源，所以长时间开着的桌面端能收到提示出现之后才发布的版本。
