---
title: "desktop: 同一个数据根上可以同时跑起多个服务端 —— 没有锁，也不附着已有实例"
labels: [欠账, scope:desktop, P2]
issue: 10
---

## 现象

四种形态共用 `~/.adelie`（`ADELIE_DB_FILE` 可改）这一个数据根，但**没有任何互斥**：

- `adelie serve` 起一个服务端（默认 7370）；
- 桌面壳再起一个（本轮起是「先试上次那个端口」，端口不同，所以两个并存）；
- CLI 的会话模式也会按需起服务端。

它们各自是独立进程、各自的端口、各自的界面，却读写同一个 `~/.adelie/adelie.db`。
Penguin 的解法是写一个 `<dataRoot>/server.lock`（pid + port），启动时读它：pid 活着就
**附着**到那个 origin，不再起第二个。

## 复现

```bash
HOME=/tmp/h node packages/server/dist/main.js &        # 第一个：7370
HOME=/tmp/h XDG_CONFIG_HOME=/tmp/c xvfb-run -a ./node_modules/.bin/electron . --no-sandbox &
ps -eo pid,args | grep -c "[s]erver\.js"; ls /tmp/h/.adelie/
# → 两个 Adelie 服务端同时活着，共用一个 adelie.db
```

## 期望

一条锁 + 一次附着，规则写清楚：

- 服务端启动时往数据根写 `server.lock`（pid、port、启动时间），退出时删掉；
- 桌面壳启动时先读它：pid 活着（且 `/api/health` 答得上来）就直接把窗口指向那个 origin，
  **不再 fork**；锁是死的就清掉、按现在的流程起自己的；
- 附着模式下的身份问题一并定（见 `desktop-shell-loopback-identity.md` 的取舍：回环即主机
  管理员，所以附着时不需要别的凭证）。

## 影响

- 现在两个服务端并存时，用户会看到「我在这里改的设置，那边没变」；如果两个都往同一个
  SQLite 文件写，还有 `SQLITE_BUSY` 一类偶发错误 —— 而这类错误最难复现、最难归因。
- 资源上也不划算：每个服务端都是一整个 Node 运行时 + 一份内存里的会话状态。
- 绕过办法：只用一种形态（不要一边开着桌面端一边 `adelie serve`）。文档里没写这条，
  所以用户不知道要绕。

## 证据

- 没有锁：`grep -rn "server.lock\|already running" packages/server/src packages/cli/src` 无结果。
- 数据根是共用的：`packages/server/src/context.ts:67`（默认 `~/.adelie/adelie.db`）、
  `packages/server/src/settings.ts:57`（主机身份沿用 `<home>/.adelie/.env`）。
- 壳没有附着逻辑：`packages/desktop/src/main.ts` 的 `boot()` 无条件 `startServer`。
- 参考实现：`docs/research/penguin-desktop-features.md` §1「附着到已有实例」一行，
  及 §4 的最小版本（`<dataRoot>/server.lock` 写 pid + port）。
