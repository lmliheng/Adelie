# 内置模型库加上 Google Gemini 4 的四条，模型弹窗把内置模型的接入地址显示出来

- **Date:** 2026-11-26
- **Type:** feat
- **Scope:** `core`, `web`, `docs`

[English](2026-11-26-gemini-4-models.md)

内置模型库里的 Google Gemini 分组补上 **Gemini 4** 的四条：`gemini-4-carbon`、`gemini-4-argon`、
`gemini-4-neon` 与 `gemini-4-hydrogen`（上下文窗口都是 1,048,576 Token，都读图）。四条都固定了
同一个 Gemini 客户端（`client_type = "gemini-3.8"`）：AgentHub 按 id 里的 `gemini-3` 子串派发
Gemini 客户端，而这四个 id 不带这个子串，不固定就会在运行时直接报「is not supported」。Neon 与
Hydrogen 只有一个公布费率；Carbon 与 Argon 是旗舰推理档，Google 在 2026-11-30 之前按半价收，
12-01 起回到牌价，因此这两条存的是牌价并声明五折。

顺带修一处一直对不上的地方：内置（目录里的）模型打开**模型配置**时，自定义 base URL 输入框是锁住的，
旁边写着「接入地址与三档价格由内置目录固定」，但框里是空的 —— 直连厂商的条目本来就不写 base URL
（地址由客户端自己带），于是弹窗声明了一个它从不显示的地址。现在这个锁住的框会把内置的接入地址作为
占位显示出来，例如 Google 分组的 `https://generativelanguage.googleapis.com`、OpenAI 的
`https://api.openai.com/v1`；网关分组显示它预置的端点。vLLM 与 Custom 分组不显示：那里的地址是你自己的。

## 细节

- `packages/core/src/state/model-catalog.ts`：`google` 分组新增四条 `gemini-4-*`，各带
  `clientType: "gemini-3.8"`。窗口、模态与费率取自 Google 自己的模型页与定价页，并与 models.dev
  的 `google` 供应商对过（2026-11-26）。文件头的「数据核对日期」补上这一条。
- `packages/core/test/model-catalog.test.ts`：`google` 分组的 id 顺序钉子加上这四条；
  「直连分组不写 client_type / base_url」那条把这四条列入例外（连同 `glm-4.7-flash`）并逐条断言
  它们的 pin；价格断言覆盖 Carbon / Argon 的牌价与五折、Neon / Hydrogen 的单档价。
- `packages/web/src/features/models/official-endpoint.ts`（新）：`officialEndpoint(info)` —— 网关取
  `gatewayBaseUrl`，直连厂商取 `VENDOR_ENDPOINTS` 的第一个主机（和凭据回退读的是同一张表）；
  `custom` 与 vLLM（`addable` 的两个分组）返回 `undefined`。单测四条在
  `packages/web/test/official-endpoint.test.ts`。
- `packages/web/src/features/models/models-page.tsx`：锁住的 base URL 输入框在条目自带地址为空时，
  用上面那个地址作占位，而不是那句「留空使用厂商默认地址」。
- `packages/docs/content/models.{zh,en}.md`：预置模型清单加上四条，补一节说明（为什么要 pin、
  端点为什么不写在条目上、Carbon / Argon 的促销到什么时候），价格与促销一节跟上。

## 兼容性

只多了预设条目与一处只读提示；接口、数据根、协议与既有分组的条目都没动。已在用的 Project 靠
**同步预置**拿到这四条，新的 Project 建好即有。Carbon 与 Argon 的促销存在服务端数据库里，和别的
Gemini 促销同一套机制。
