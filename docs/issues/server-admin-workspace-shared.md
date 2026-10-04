---
title: "server: 非管理员的会话是自己的，但工作区还是管理员的那一个"
labels: [决策, scope:server, P1]
---

## 现象

P3 把会话按人分了区，但没有把**工作区**按人分。alice 登录后：

- 顶栏与侧栏显示的工作区是管理员设的那个（真机验收里是 `/root/Adelie`）；
- 她发一条「把 README 里的错别字改掉」，Agent 就在那个目录里读写、执行命令。

字段本身是置灰的（`workspace` 是管理员专用，改它得 403），但**用的**是管理员的值。

## 复现

```bash
HOME=/tmp/x PORT=3033 ADELIE_TOKEN=t node packages/server/dist/main.js &
curl -s -H 'authorization: Bearer t' -X PATCH localhost:3033/api/config \
  -H 'content-type: application/json' -d '{"workspace":"/tmp/shared"}'
# 建号后以 alice 登录（Cookie 或 /api/auth/login 的令牌）
curl -s -b "adelie_session=…" localhost:3033/api/config | grep workspace
# → "/tmp/shared"，与管理员那份一致
```

## 期望

两条路都能走通，代价不同，**要人拍板**：

- **A. 非管理员有自己的默认工作区**（例如 `~/.adelie/workspaces/<用户 id>/`，首次登录时建），
  管理员可以额外授权若干共享目录。好处是「分开」这条承诺是真的；代价是多一层目录概念，
  而且要处理「共享目录里两个 Agent 同时写」。
- **B. 明确承认工作区是这台机器的共享目录**，把它写进 docs 与界面文案，不谈隔离。
  好处是零新增概念；代价是「建一个号」等于「把工作区交给对方」。

## 影响

现在这条路等于：**任何被建号的用户都能让 Agent 在管理员的工作区里写文件、跑命令**。
P3 的卖点之一是「每个人的会话与密钥是分开的」，工作区这一格没做到，用户会以为做到了。
绕过办法：只给信任的人建号（也就是让产品替用户打这个补丁）。

## 证据

- `packages/server/src/routes/config.ts:78`：`workspace` 只对管理员放行，但读的是共享的那份配置
- `packages/server/src/context.ts` 的 `configView`：`workspace` 来自 `settingsFor(identity)`，
  而主机与内置 admin 共用同一份
- 真机验收截图（2026-10-04，alice 的设置弹窗）：工作区显示 `/root/Adelie`，置灰 + 提示
  「当前身份是 alice，工作区由管理员设定」
- `docs/redesign.md` §2 角色表里这一格写的是「⚠️ 仅自己名下的分区」—— 只做了一半
