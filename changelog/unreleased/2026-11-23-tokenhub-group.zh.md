# 模型库多了一个腾讯 TokenHub 分组

- **Date:** 2026-11-23
- **Type:** feat
- **Scope:** `core`, `web`, `docs`

[English](2026-11-23-tokenhub-group.md)

模型库里多了一个 **Tencent TokenHub** 分组。把 TokenHub 控制台上的一把 key 填进这个分组，里面的
Hy 预置模型就能在会话里直接选了。

它自成一个分组，而不是挂在既有的腾讯混元（Hunyuan）条目下面再加几行，因为那是**另一个服务**：
TokenHub（腾讯云大模型服务平台）是腾讯云的模型网关，有自己的控制台、自己的 key —— 混元直连端点会
拿 `invalid_api_key` 拒掉一把 TokenHub 的 key（2026-11-23 实测）。这个网关除了腾讯自家的 Hy 模型，
还转卖 Kimi、GLM、DeepSeek、MiniMax；这里只收录它第一方的 Hy 对话模型，转卖的模型在别处已经有一个
「卖家即分组」的归属。

## 细节

- `packages/core/src/state/model-catalog.ts`：`MODEL_PROVIDERS` 新增 `tokenhub` 一条（label
  "Tencent TokenHub"、OpenAI 兼容的 `gatewayBaseUrl`、厂商的取 key 页与模型列表页 —— 控制台的取 key
  页在登录后面，从这里读不到），放在 `tencent` 之后；新增 `TOKENHUB_BASE_URL =
  "https://tokenhub.tencentmaas.com/v1"`；`MODEL_CATALOG` 新增三条预置，每个都是
  `clientType: "openai-chat"` 且内联端点。窗口取模型列表文档里的「最大输入」（本模型库只有一档窗口，
  装不下它另外单列的最大输出），视觉标志按每条自己的能力说明：Hy4 那一对读图，Hy3 不读。
- 价格：只有 `hy4` 读得到 —— models.dev 生成的 Tencent TokenHub 条目，它的美元数就是腾讯那份取整的
  人民币价，按本模型库存的 7:1 口径换算（缓存命中 0.29 / 输入 5.84 / 输出 17.5 元每百万）。`hy4-flash`
  与 `hy3` **故意不写价**，不去隔壁模型借一个：厂商自己的价格页是前端渲染的、那份价格 PDF 也没了，
  这里没人读到过。
- `packages/web/test/model-grouping.test.ts`：默认分组顺序的期望里，`tokenhub` 排在 `tencent` 之后。
- `packages/core/test/model-catalog.test.ts`：断言提供方条目、分组的 base URL，以及三条预置各自的
  id、窗口、视觉、协议与内联端点。
- `packages/docs/content/models.{zh,en}.md`：提供方表格与预置清单各加一行，并新增「腾讯 TokenHub」
  一节，说明这个分组以及价格取自哪里。

## 兼容性

只是目录里多了一个分组与三条预置；数据根、Trace 格式与接口形状都没变。没填 key 之前，不会有任何请求
发往 TokenHub。
