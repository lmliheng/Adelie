# 模型库里多了 Abliteration，那批去审查的模型可以直接选

- **Date:** 2026-10-23
- **Type:** feat
- **Scope:** `core`, `docs`
- **Breaking:** no

[English](2026-10-23-abliteration.md)

**模型库**页面多了一个 Abliteration 分组，排在 vLLM 前面。它收录的四个模型就是这家服务卖的「abliterated」
——在开源权重上去掉拒答倾向的微调版本。已有的项目点一次**同步预置**就有，新建的项目直接带着。

整个分组只有一个 OpenAI 兼容端点 `https://api.abliteration.ai/v1`，所以把一把 `ak_…` 的 key 填进分组标题栏
就完事：不用挑协议，也不用填端点。和别的网关一样，这个分组是封闭的——模型跟着目录来，不能手工往里加。

## 细节

- **四个条目**（`core/src/state/model-catalog.ts`）：`abliterated-model-large-v2`（服务推荐的默认款）与
  `abliterated-model-large`，上下文 1,000,000 Token、只收文本；`abliterated-model-large-flash`，1,048,576、
  接受图像；`abliterated-model`，262,144、接受图像。数据是 2026-10-23 从服务自己的 `GET /v1/models` 读的，
  上下文窗口、输入模态和每 Token 费率都出自那里。
- **协议**：这几个 id 没有一条能被 AgentHub 按名字认出来，所以每个条目都固定 `openai-chat` 并把端点写在条目上；
  前端的添加、检测等对话框也因此按同一套协议给这个分组兜底。同一端点也提供 `/responses`，需要时可以在条目上改。
- **价格**是它公布的每 Token 费率折算成目录里每百万 Token 的三项：输入 1 或 3，输出 2/3/5，缓存命中 0.1 或
  0.3。服务不额外收缓存写入费，所以 `cache_write` 记的就是输入价。目前没有促销，项目里存的就是牌价。
- **凭据规则**没变，而且这里刻意不帮你省事：这个分组里没有 key 的条目会被拒绝，而不是把通用客户端会去读的
  `OPENAI_API_KEY` 发给它——那端点不是 OpenAI 的。key 要设在分组上或条目上。
- 文档：`packages/docs/content/models.zh.md` 与 `models.en.md` 的分组表各加一行，另加一节说明。
- 测试：`core/test/model-catalog.test.ts`（四个条目的窗口、视觉、三项价格、协议与端点，以及分组顺序与网关集合），
  前端分组顺序在 `web/test/model-grouping.test.ts`。

## 兼容性

- 没有依赖变化，也没重写已存的数据：老项目自己的条目原样保留，点一次**同步预置**才会把这四条补进来。
- 这个分组在界面上显示成字母牌，和所有在 UI 包里还没有品牌标的其它分组一样。
