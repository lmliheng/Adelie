# 热推的平台又能在旧运行时上启动了

- **Date:** 2026-10-28
- **Type:** fix
- **Scope:** `server`
- **Breaking:** 否

[English](2026-10-28-platform-config-candidates.md)

移植自 PenguinHarness `64aebf0f`（`#1058`）。

热推换的是平台，从来不是运行时。`penguinGoOrigin` 此前被列进平台声明的配置成员里，于是每一个
比这个成员更早装上的运行时（Go provider 之前的所有安装）都拒绝握手 —— 本来兼容的平台推不过去，
而每一次被拒的推送仍可能把服务端重启一遍。同一条规则现在也管住 `modelscopeBridgeUrl`：握手从来不
要求它，但它的消费者没有兜底，在这样的运行时上会读到 `undefined`。

运行时发货之后才加的配置成员，不再进入声明列表：它在 `ServerConfig` 上是可选的，消费者在没有值时
补上生产默认值 —— 与 `cliEntry` 一直是同一个形状。

## 细节

- `packages/server/src/hmr/capabilities.ts`：`penguinGoOrigin` 移出 `HMR_INTERFACES.config`，规则
  写在列表上方，点名 `cliEntry` / `penguinGoOrigin` / `modelscopeBridgeUrl` 这三个必须留在外面的成员。
- `packages/server/src/config.ts`：两个成员在 `ServerConfig` 上改为可选，并写明缘由。
- `packages/server/src/services/{platform,modelscope}-auth-service.ts`：两个 provider 在没有值时回落到
  `normalizePenguinGoOrigin(undefined)` / `normalizeModelScopeBridgeUrl(undefined)` —— 也就是生产用的
  源站与桥 —— 而不是把 `undefined` 传下去。
- `packages/server/test/hmr-resources.test.ts`：一条回归用例 —— 「运行时之后才加的成员一个都没被点名」，
  且一个「今天的列表减去它们」的旧运行时仍然握手成功。

## 兼容性

- 接口、线上格式与已存数据都没变：当前运行时拿到的还是同样的值，旧运行时拿到的是握手而不是拒绝。
