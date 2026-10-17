# 浏览器 e2e 的 `llm-errors` 三条用例回到今天的语义

- **Date:** 2026-10-18
- **Type:** test
- **Scope:** `web`, `core`
- **Breaking:** no

[English](2026-10-18-llm-errors-four-stop-reasons.md)

三条用例的前提停在 2026-08-25 之前：`llm-errors.spec.mjs` 仍按「403 配额错误走重连阶梯」「401 之后会话死掉、由模型页 CTA 解锁」来断言，而这两种行为都在上游 #458（`573259f0`，四级停止原因收敛为 `completed` / `aborted` / `retryable` / `fatal`）以及它撤掉的认证失效提示里不存在了。本仓的核心用例本来就钉着今天的口径（`isFatalProviderRejection`：除 408 / 429 外的 4xx 都是致命），所以这次只改夹具与用例，**不改任何产品行为**。

- **重连阶梯**：第一条改用「截断的流」（一次 SSE 流少了 `message_delta` / `message_stop`），它被归为 `malformed`、仍然可重试，于是倒计时、立即重试、重试后成功这条链照旧被真浏览器覆盖。用 HTTP 5xx 不行：协议 SDK 自己会内部重试 5xx（实测约 0.4 秒），引擎与 Trace 都看不到这次失败。
- **放弃**：第二条同样改用持续可重试的失败，放弃后断言中止事件带 `backoff_interrupted`。
- **配额 403**：新增一条用例钉住今天的口径 —— 第一次尝试就结束（`fatal` / `rejected`），页面上是提供方自己的错误文本，没有重连行，输入框可用。
- **认证 401**：第四条重写为今天的行为 —— `fatal` / `auth`、错误横幅带提供方的 `invalid_api_key` 原文、不重试；改掉模型 key 之后**同一个会话**继续对话。旧用例断言的「模型 API 认证失败」提示与「打开模型配置」按钮在本树与上游都不存在（#458 已撤掉），因此不再断言。
- `mock-llm.mjs` 的三个配额分支改为两条可重试失败分支 + 一条配额致命分支；`generative-model.ts` 里 `isAuthenticationError()` 那段与 `isFatalProviderRejection()` 互相矛盾的注释（「裸 403 走重连阶梯」）改成今天的口径。

## 兼容性

无：只有测试夹具、用例与注释，接口与线上格式不变。
