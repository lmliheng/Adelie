# 通过局域网地址打开 Web App 时，密钥授权改为粘贴授权码

- **Date:** 2026-10-26
- **Type:** fix
- **Scope:** `server`, `web`
- **Breaking:** no

[English](2026-10-26-oauth-callback-origin.md)

以非回环地址的明文 HTTP 打开 Web App（局域网地址如 `http://192.168.1.10:4000`、主机名或
`0.0.0.0`）时，在模型页连接 TokenDance 会被带到一个授权页，页面直接报「授权请求无效」：那个页面只
接受跳回 HTTPS 地址，或 `localhost`、`[::1]`、`127.x.x.x` 上的明文 HTTP 地址，而服务端交给它的
正是浏览器访问时用的地址。

现在只有在该地址能接收跳转时，服务端才请求跳转回来；否则直接以手动模式打开授权流程：不带回调地址，
S256 PKCE 照旧。发起接口的返回新增 `mode` 字段，说明流程实际以哪种模式打开，弹窗随之直接进入填写
一次性授权码这一步；这次打开期间不再提供「改回自动跳转」，因为授权页会照样拒绝。回环地址与 HTTPS
地址上仍默认自动跳转，两种方式之间照常可以切换。

## 细节

- `packages/server/src/services/model-oauth-service.ts`：新增导出 `openedMode(asked,
  callbackOrigin)` —— 手动模式永远不会被升级；`callback` 请求只在 `https:` 或 `http:` 且主机是
  `localhost` / `[::1]` / `127.x.x.x`（授权页自己的 `callback_url` 判据，照它前端包里那段读出来）时
  保留跳转。解析不出来的地址没有可跳之处，也一并降级。`start` 用它同时决定回调地址**和**流程记录的
  模式，所以被降级的流程拒绝投递授权码的行为与手动流程完全一致；`start` 另外返回 `mode`。
- `packages/server/src/api/types.ts`：`ModelOAuthStartResponse.mode`（必填 —— 服务端总会给出）与
  `ModelOAuthMode` 的注释补上「为什么 `callback` 请求可能以 `manual` 打开」。
- `packages/web/src/features/models/models-page.tsx`（`ModelOAuthDialog`）：新增 `redirectRefused`，
  在「请求了跳转、服务端却按手动打开」时置位，并与原来的 `manual` 合成一个 `byHand` 取代各处对
  `manual` 的判断（走授权码那一步、不轮询、不给跳转开关），重试也保持这样。弹窗只看
  `res.mode === "manual"`，所以对没有这个字段的旧服务端行为照旧。没有新增文案：授权码那一步原有的提示
  已经说清了怎么做。
- `packages/server/test/model-oauth.test.ts`：打开模式的取值表（回环与 HTTPS 保留跳转；局域网地址、
  主机名、`0.0.0.0`、`*.localhost` 与不可解析的地址都按手动打开；手动模式不会被升级），另加一条路由
  用例：以 `http://192.168.1.10:7364` 发起，回 `mode: "manual"`、不带 `callback_url`、仍钉 S256，
  随后能兑换粘贴进来的授权码。
- 移植自上游 `12a58d4f`（#1328），照改动落、不是合分支。服务端用例的文件头注释按本树现状手写合并
  （上游那份还描述了一条本树没有的 disconnect 路径）；上游的前端用例没有取 —— 它要 jsdom，而
  `packages/web` 不装这个依赖，那半边改用真浏览器验证，见台账那一轮。

## 兼容性

- 不改依赖、不改已存数据、不改包名与配置格式。`POST /api/projects/:p/model-oauth/start` 的响应多一个
  字段（`mode`），没有删改；旧的 Web App 会忽略它。
