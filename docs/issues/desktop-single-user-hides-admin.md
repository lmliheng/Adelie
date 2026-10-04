---
title: "desktop: 单机桌面模式下要不要隐藏「用户管理」—— 要人拍板"
labels: [决策, scope:desktop, P2]
issue: 13
---

## 现象

P3 给 Adelie 加了「用户与两档角色」，界面上因此多了一个用户管理入口
（`packages/web/src/components/UsersDialog.tsx`）。但同一个界面现在有四种形态在跑：

| 形态 | 谁在用 | 他需要看到用户管理吗 |
| --- | --- | --- |
| 桌面壳 | 一台机器上的本人 | 大概率不需要 —— 他就是管理员，也没有第二个用户 |
| `adelie serve` + 局域网 | 一台机器上的一小组人 | 需要 |
| `adelie serve` + 公网（配 token） | 多人 | 需要 |
| 静态 Web / PWA | 连远程服务端 | 需要 |

Penguin 的桌面端是**明确的单用户形态**：桌面模式下「用户管理 / Project 成员」整块不出现
（`admin-users-page.tsx:43`、`app-layout.tsx:355`），服务端还用 403
`desktop_single_user` 兜底 —— 也就是说这不是前端藏一下，而是两层都认这个判据。

Adelie 现在没有这个判据：桌面壳和局域网部署看到的是同一个界面。

## 复现

```bash
# 桌面壳
HOME=/tmp/h XDG_CONFIG_HOME=/tmp/c xvfb-run -a ./node_modules/.bin/electron . --no-sandbox
# 界面里能看到用户管理入口 —— 而这条路只有本机一个人在用
```

## 期望

两条路都能走，**要人拍板**：

- **A. 照 Penguin**：服务端认出「这是桌面壳」就返回 `desktop` 形态，界面按它隐藏用户管理
  与「登出入口」，并在服务端路由上做同样的拒绝。判据要用一个**能验的东西**（Penguin 用
  `desktopMode && sessionVia === "desktop"`），不能靠 user agent 猜。
- **B. 不区分**：单机用户也能看到用户管理 —— 好处是他可以给自己建一个「第二个身份」
  （比如给自己开一个受限账号来试权限），坏处是单机用户会看到一个他永远用不上的页面。

倾向 A，但「怎么认出一个请求来自桌面壳」这件事要先定：本轮壳与内嵌服务端之间**没有任何
凭证**（见 issue #3），所以「来自桌面壳」目前不是服务端能验证的事实，只能靠约定
（比如壳 fork 时传的环境变量 + 服务端记在会话上）。

## 影响

- 现在不致命：多一个能点的入口而己。但如果用户管理里能改别人的口令/角色，单机用户
  误操作（比如把自己降级）会把自己锁在外面 —— 那就不只是「多一个入口」了。
- 这条不定，后面的桌面专属界面（托盘开关、更新行）也没有统一的判据可用，
  每个功能都要各自猜一遍。

## 证据

- `packages/web/src/components/UsersDialog.tsx`、`packages/web/src/components/LoginScreen.tsx`
  （P3 产物，现在对所有形态可见）。
- `docs/issues/desktop-shell-loopback-identity.md`（issue #3）：壳零凭证那条取舍的记录。
- 参考实现：`docs/research/penguin-desktop-features.md` §2「没有用户管理 / Project 成员」
  「没有『修改密码』/『登出入口』」两行。
