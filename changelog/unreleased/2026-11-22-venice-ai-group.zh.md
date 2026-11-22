# 模型库多了一个 Venice AI 分组

- **Date:** 2026-11-22
- **Type:** feat
- **Scope:** `core`, `web`, `docs`

[English](2026-11-22-venice-ai-group.md)

模型库里多了一个 **Venice AI** 分组。把 <https://venice.ai/settings/api> 上的一把 key 填进这个
分组，里面的预置模型就能在会话里直接选了。

收录它是冲着它的**无审查**那条产品线去的，所以这九个预置是那一条线，而不是它整份列表里的一百
多条：它自家的 `venice-uncensored-*`，加上它转卖的别人家模型的 abliterated /「uncensored」微调
（DeepSeek V4.1 Flash Uncensored、GLM 5.3 Flash Uncensored、Qwen 3.6 Plus Uncensored 这些）。

每个预置都走通用的 Chat Completions 客户端，并把 `https://api.venice.ai/api/v1` 内联在条目上。
Venice 的 id 是卖家自己的拼法；那些恰好带厂商子串的（`deepseek-v4…`、`glm-5…`）不内联的话会被
路由到那家厂商的专用客户端，而那个客户端按厂商自家服务假设请求形状。

## 细节

- `packages/core/src/state/model-catalog.ts`：`MODEL_PROVIDERS` 新增 `venice` 一条（label
  "Venice AI"、OpenAI 兼容的 `gatewayBaseUrl`、取 key 页与模型列表页），放在 abliteration 分组
  之后；新增 `VENICE_BASE_URL`；`MODEL_CATALOG` 新增九个预置的 cluster，每个都是
  `clientType: "openai-chat"` 且内联 `baseUrl`。窗口、视觉/视频标志与每百万 Token 的三档美元价
  来自厂商自己的列表端点（`https://api.venice.ai/api/v1/models?type=text`，2026-11-22 经 models.dev
  那套由该端点生成的提供方数据读取）。`cache_write` 除 `qwen-3-6-plus` 外一律等于输入价——那一条
  厂商列表确实公布了写入溢价，规则与其它网关 cluster 一致。
- `packages/web/test/model-grouping.test.ts`：默认分组顺序的期望里，`venice` 排在 `abliteration`
  之后。
- `packages/core/test/model-catalog.test.ts`：断言提供方条目、分组的 base URL，以及九个预置各自
  的 id、窗口、视觉、三档价格、钉住的协议与内联端点、视频标志。
- `packages/docs/content/models.{zh,en}.md`：提供方表格与预置清单各加一行；新增「Venice AI」小节，
  说明这个分组、为什么必须钉协议、价格取自哪里。

## 两处只记基础档的说明

- `gemma-4-uncensored` 没收：厂商自己的列表里还有它，但标了 **deprecated**，与其预置了以后再清理，
  不如不预置。
- `qwen-3-6-plus` 在 256K 以上提示时另外计价（输入 2.5 / 输出 7.5 每百万）。本模型库表达不了分档
  价格，所以这一条记的是基础档。

## 兼容性

只是目录里多了一个分组与九个预置；数据根、Trace 格式与接口形状都没变。没填 key 之前，不会有任何
请求发往 Venice。
