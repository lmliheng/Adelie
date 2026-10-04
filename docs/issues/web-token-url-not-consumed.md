---
title: "web: 服务端打印的带 token 的地址在浏览器里用不了（前端不读 ?token=）"
labels: [bug, scope:web, P2]
---

## 现象

服务端启动时会打印一条可直接用的地址，带 token：

```
地址   http://0.0.0.0:4000/?token=<token>
认证   请求需带 Authorization: Bearer <token> 或 ?token=<token>
        （token 已包含在上面的地址里，手机 / PWA 直接用那个 URL）
```

但把这条地址**原样**贴进浏览器，看到的是登录页而不是主界面：web 端从来不读地址里的
`?token=`（只有「连接设置」里**粘贴**这条地址时才由 `parseConnectionInput` 把它拆出来）。
于是「直接用那个 URL」这句话在浏览器里不成立 —— 用户必须先想办法把 token 复制出来，
再粘进登录页的 token 框。手机上正是这句话要服务的那一群人。

## 复现

```bash
# 到 4000 端口那台（见 adelie-web.service）
TOK=$(. /etc/adelie/web.env; printf '%s' "$ADELIE_TOKEN")
curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:4000/api/auth/me?token=$TOK"   # 200：服务端认
# 但浏览器打开 http://127.0.0.1:4000/?token=$TOK 会停在登录页 —— 前端没把查询串里的 token 收下
```

判据：web 端读 `location.search` 只有一处，是 `packages/web/src/lib/credentials.ts:130`
里给「粘贴的地址」用的；`main.tsx` / `App.tsx` 都没有在启动时收下 `?token=`。

## 期望

启动时收下一次：`?token=` 存在且与已存凭据不同时，写进凭据（并可以考虑把查询串从地址栏
抹掉，免得 token 留在历史记录里），然后照常探活。要小心两件事：

1. **只在没存过凭据或值不同的时候写**，否则用户手动改了 token 之后会被地址栏里的旧值
   反复改回去；
2. 抹掉查询串要用 `history.replaceState`，别让 token 留在浏览器历史里。

## 影响

- 轻：手动粘一次也能用（本轮部署就是这么验的）。但对「手机扫一下就能用」这件事是直接的
  阻塞 —— 而那条路正是 token 存在的理由。
- 与 `docs/api.md` §0 的「地址里带 token」这句话不一致：契约说能用，实现里只有一半能用。

## 证据

- `packages/server/src/main.ts`（打印带 token 的地址）、`packages/server/src/index.ts`
  的 `serverUrl()`。
- `packages/web/src/lib/credentials.ts:120-131`（只在解析粘贴输入时认 token）。
- 2026-10-04 部署 4000 时用 Playwright 实测：`http://127.0.0.1:4000/?token=…` 停在登录页，
  在「连接设置」里填 token 后才进主界面。
