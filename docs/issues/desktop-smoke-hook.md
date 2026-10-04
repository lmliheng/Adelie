---
title: "desktop: 仓库里没有可复用的无人值守冒烟钩子，这次的验证是一次性外部脚本"
labels: [欠账, scope:desktop, P2]
---

## 现象

本轮给桌面壳加的那批功能（端口记忆、窗口状态、托盘、日志、自带 CLI）在 Linux 上**真跑过**，
但那套验证是临时拼的：一条 `xvfb-run -a ./node_modules/.bin/electron . --no-sandbox`，
加 `sleep` 之后按 pid 发 `SIGTERM`，再看落盘的文件。它不在仓库里，下一次（换台机器、
换个人、或者在 CI 里）要重新拼一遍 —— 而且拼出来的东西不会有人维护。

结果就是：桌面壳的改动实际上**只有单测这一层**是可持续验证的，集成层全靠人记得怎么拼。

## 复现

```bash
# 现在唯一的办法：自己拼
cd packages/desktop
HOME=/tmp/h XDG_CONFIG_HOME=/tmp/c xvfb-run -a ./node_modules/.bin/electron . --no-sandbox &
sleep 16; kill -TERM "$(pgrep -f 'electron/dist/electron' | head -1)"
# 断言只能靠人肉看日志与落盘文件
```

## 期望

一个环境变量开关的钩子，把「跑一次应用」变成一条命令：

1. `ADELIE_DESKTOP_SMOKE=1` 启动 → 等首屏 `did-finish-load` 后再等 2–3 秒；
2. `capturePage()` 存一张 PNG（`ADELIE_DESKTOP_SMOKE_SHOT=<path>`）；
3. 往 stdout 打**一行 JSON**（端口、是否沿用、窗口尺寸、托盘是否有图标、CLI 装到哪）；
4. 走正常退出路径 `app.quit()`，退出码按断言结果给。

有了它，`scripts/audit.mjs` 的 `--with-e2e` 可以再长出一条腿（现在只覆盖 Web 那一侧），
Windows 打包也能在 CI 里被真正跑一次 —— 那正是 `desktop-windows-cli-unverified` 缺的东西。

## 影响

- 桌面壳的回归完全靠人：单测覆盖不到 Electron 的接线（`Tray` 建不建得起来、窗口状态是否
  真落盘、CLI 是否真能跑），而这一层恰恰是本轮改动最多的地方。
- 每次改动都要手工拼一次命令，成本高到「下次可能就不跑了」—— 那等于没有验证。
- 无头环境需要虚拟显示（本机有 `xvfb-run`；CI 里 Ubuntu runner 上需要 `xvfb`）。

## 证据

- 本轮实际用过的脚本与产物（不在仓库里）：
  `…/scratchpad/<session>/desktop-smoke/`（`stdout*.log` + `<userData>/logs/desktop.log`）。
- 参考实现：`docs/research/penguin-desktop-features.md` §1「冒烟钩子」一行
  （`PENGUIN_DESKTOP_SMOKE` / `PENGUIN_DESKTOP_SMOKE_SHOT` / `armSmokeProbe`）与 §4 对应条目。
- 现有可挂的入口：`scripts/audit.mjs` 的 `e2e` 检查项（`--with-e2e`）。
