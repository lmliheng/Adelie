---
title: "web: PWA 跨源登录（GitHub Pages → 局域网服务端）没有真机验过"
labels: [未验证, scope:web, P2]
issue: 9
---

## 结论是什么

P3 的登录态是 HttpOnly Cookie（`adelie_session`，SameSite=Lax）。它是为**同源**
部署设计的：服务端托管前端，浏览器自动带上 Cookie，用户什么都不用配。

另一条路是跨源：前端在 https://lmliheng.github.io/Adelie/（PWA），服务端在局域网
`http://192.168.x.x:7370`。这条路上：

- Cookie 是服务端的、`SameSite=Lax`、`secure=false` —— **跨站请求不会带上它**；
- 于是登录只能靠 `Authorization: Bearer`，也就是把 `/api/auth/login` 拿到的令牌
  由脚本存起来自己带上（`lib/credentials.ts` 的 token 字段）。
- 服务端**没有**给这条场景写过 `Access-Control-Allow-*` 的验证：跨源 fetch 能不能
  过、预检会不会被拒，都没真跑过。

## 为什么没验证

没有第二台机器 / 手机，也没法替用户在手机上操作。真机验收（2026-10-04）走的是同源
那条路：服务端自己托管前端，`credentials: 'include'` 一切正常。

## 怎么才能验证

1. 在一台机器上用 `ADELIE_HOST=0.0.0.0 ADELIE_TOKEN=…` 起服务端，记下局域网地址；
2. 在另一台机器（或手机）上打开 GitHub Pages 的 PWA，连接设置里填那个地址 + token；
3. 看三件事：fetch 是否被 CORS 拦（console 里会有明确的 CORS 报错）、
   登录后刷新页面是否仍然是登录态、`EventSource`（SSE 走 `?token=`）是否正常。

## 在此之前的影响

发布说明与界面上「手机连局域网里的服务端」这句话，目前只有同源那一半被验证过。
另外 `parseConnectionInput`（把带 token 的整条 URL 拆开）已经有单测，但它后面
那一整条跨源链路没有。

## 证据

- `packages/server/src/identity.ts` 的 `setSessionCookie`：`sameSite: 'Lax'`、
  注释里写着「`secure` 只能是 false：手机 PWA 连的是局域网 http」
- `packages/web/src/lib/credentials.ts` 顶部注释：跨源时 Cookie 不生效，用 Bearer 兜底
- `packages/web/src/api/client.ts` 的 `request()`：`credentials: 'include'`
- P3 真机验收（docs/redesign.md §12）只覆盖同源
