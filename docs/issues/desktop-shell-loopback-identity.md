---
title: "desktop: 桌面壳走回环主机身份而不是换 Cookie —— 要不要改由人拍板"
labels: [决策, scope:desktop, P2]
---

## 现象

`docs/redesign.md` §2 原本写的方案是：回环不再无条件放行，桌面壳启动时拿一次性 token
换一个 Cookie，用户依然无感。P3 落地时改成了**桌面壳一行都不改**：

- 壳绑 `127.0.0.1`，用 Electron 的 `utilityProcess.fork` 拉起内置服务端；
- 窗口打开 `http://127.0.0.1:<port>/`，不带任何凭证；
- 服务端按「回环且没显式配 token ⇒ 主机管理员」这条公理把他认成管理员。

于是单机用户永远看不到登录页，壳也不必持有、存储、轮换任何凭证。

## 复现

```bash
HOME=/tmp/x PORT=3031 ADELIE_WEB_DIST=packages/web/dist node packages/server/dist/main.js &
# 不带任何凭证打开
curl -s localhost:3031/api/auth/me
# {"authenticated":true,"user":{"kind":"host","name":"host","isAdmin":true,"id":null,…}}
```

桌面壳做的就是这件事；真机验收（docs/redesign.md §12 最后一行）里浏览器走同一条路
得到的结果一致。

## 期望

两条路都能走，**要人拍板**（P3 选了 B）：

- **A. 按原设计**：壳启动时换一次性 Cookie，回环不再无条件放行。好处是「能读数据根
  = 管理员」不再是唯一入口，多用户机器上别人的浏览器也不再是管理员；代价是壳要管一份
  凭证（存哪、怎么轮换、Cookie 过期了怎么办），而它本来就是个尽量薄的壳。
- **B. 保持现状**（当前实现）：壳零凭证。代价是「同一台机器上、没有显式配 token 时，
  任何能访问这个回环端口的浏览器都是管理员」—— 要关掉这条路，用户在壳外设
  `ADELIE_TOKEN`，但那时壳自己也要带上凭证（现在没带，会被 401 挡在登录页）。

## 影响

- 单机用户：无感，没差别。
- 共享一台机器（多操作系统用户）的机器：B 之下别人的浏览器也是管理员。文档里已写明，
  但桌面壳那条路没有一个「只让我一个人用」的开关 —— 见上面的「期望 A」。
- 换成 A 会牵动桌面壳的启动流程与单实例逻辑，所以不适合顺手改。

## 证据

- `packages/desktop/src/main.ts` / `server-process.ts`：`utilityProcess.fork` + 绑回环，
  没有任何凭证交换
- `packages/server/src/identity.ts` 顶部注释第 3 条（公理）与 `resolveIdentity` 的回落分支
- `docs/redesign.md` §12「一处有意偏离 §2」一节（记录了这次取舍与理由）
- `docs/api.md` §0（已经按现状写成三个进门方式）
