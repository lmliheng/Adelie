---
title: "desktop: 装了 0.1.0 之后没有任何更新路径，而打包配置已经声明了 GitHub 发布源"
labels: [欠账, scope:desktop, P2]
issue: 11
---

## 现象

`electron-builder.yml` 里已经声明了发布目标（`publish: provider: github / owner: lmliheng /
repo: Adelie`），打包时会生成 `latest.yml` 这类更新元数据，但**没有任何代码去消费它**：

- `packages/desktop/package.json` 里没有 `electron-updater`（`grep -n electron-updater` 无结果）；
- 壳没有「检查更新」入口，也没有任何调度；
- 于是用户装了 `Adelie-Setup-0.1.0.exe` 之后，唯一拿到新版的办法是回 GitHub Releases
  手动下载重装。而 release 产物是自动构建的 —— 发布了也没人知道。

## 复现

```bash
cd packages/desktop
grep -n electron-updater package.json        # 无输出
grep -n "updater\|autoUpdater" -r src/       # 无输出
grep -n "publish:" -A3 electron-builder.yml  # 声明了 github 源
```

## 期望

按 Penguin 的做法分三步落地（都不需要新的外部服务，只有签名那条要证书）：

1. **接入**：`electron-updater`，`autoDownload = false`，`setFeedURL({provider:"github", …})`；
   一次检查只落到「有新版」，下载与 `quitAndInstall()` 由用户动作触发。
2. **判定**：dev 运行 / 非安装版不冒充可更新（`!app.isPackaged` → unsupported）。
3. **入口与调度**：菜单「检查更新」+ 首查 20s 后、此后每 6 小时一次（`setInterval(…).unref()`）；
   状态（可更新 / 下载中 n% / 待重启）要能被界面读到。

签名（Windows Authenticode）是**另一条**前置：没有证书时更新校验形同虚设，
`electron-builder.yml` 里的 `publisherName` 一旦被删就完全跳过校验，所以它是阻塞项而不是优化项。

## 影响

- 已经发出去的 `0.1.0`（npm CLI、Windows 安装包、Web zip、Pages PWA 四件产物）不会收到
  任何后续修复 —— P1/P2/P3 的重构至今只在 `main` 上，用户侧一个字节都没变。
- 每次想让用户拿到新版，都得在文档/邮件里让人手动下载重装，这不可持续。
- 没有绕过办法：这条功能本身就是「不打扰用户的更新通路」。

## 证据

- `packages/desktop/electron-builder.yml:14-16`（`publish` 已声明，无消费者）。
- `packages/desktop/package.json` 的 devDependencies 里没有 `electron-updater`。
- 参考实现与分档：`docs/research/penguin-desktop-features.md` §3.4「更新怎么做（谁签名、从哪拉）」
  与 §1 里「自动更新 / 更新源测速与切换 / 更新状态快照 / 更新签名校验 / 更新调度」五行。
- 相关：本仓库把四件产物与版本号的关系记在 `CHANGELOG.md`，P1–P3 未发版也记在那里。
