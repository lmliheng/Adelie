# 会话里的图太多时不再整条报错，只带最新的四张

- **Date:** 2026-10-23
- **Type:** fix
- **Scope:** `core`, `docs`
- **Breaking:** no

[English](2026-10-23-image-budget.md)

Abliteration 一次请求最多收四张图，超过就把整条请求拒掉（`400 … media_count_exceeded`）。而对话里的图会被之后
的每一次请求重新带上：一个会话只要读过五张图，从此每说一句话都失败，界面上一直挂着同一个错误，换个问法也没用。

现在每个请求都按模型自己的上限裁剪：**最旧的图先被换掉**，换成一行 `[image omitted: …]` 文字占位，最新的四张留
下来（新发出的图先占名额）。那条卡住的会话因此可以继续用，对话本身与 Trace 里的东西一张不少。

## 细节

- **上限记在目录里。** `ModelCatalogEntry` 新增 `maxImages`，Abliteration 的四条预置都写 4，`catalogImageLimit()`
  按 `(provider, model_id)` 读它。没有这个字段的模型——目录里除这四条以外全部——行为完全不变。
- **请求前裁剪**（`core/src/llm/generative-model.ts`）：`streamGenerate` 在打开上游流之前调用
  `fitReplayedImages`：先把本次新输入的图算进预算，剩下的额度从最新往前给历史；放不下时用 `capHistoryImages`
  重建一份历史交给 AgentHub 的 `setHistory`（`getHistory` 交出来的对象不原地改动）。工具结果里的图按它自己的
  `images` 数组裁，占位那行追加到同一段文字后面。新输入自己就占满额度时，历史里的图全部换成占位。
- **会话模型带上它**（`core/src/agent.ts`）：`buildLLM` 从目录查出上限，作为 `GenerativeModelConfig.maxImages`
  传下去；压缩后重建、或切换模型后的新上下文都走同一个构造点。
- 测试：`core/test/image-budget.test.ts`（计数、按消息裁剪、工具结果裁剪、不改原对象、零预算、没有上限时原样
  送出，以及把新输入的图算进预算的接线）与 `core/test/model-catalog.test.ts`（四条条目带 4，其余模型与目录外
  的 id 都没有）。
- 文档：`models.zh.md` / `models.en.md` 的 Abliteration 一节写清这条上限与裁剪行为。

## 兼容性

- 没有新配置项，也不重写已存的数据：上限从内置目录读，老会话在下一次请求时自动绕开。
- 没有上限的模型一条请求都不变；带上限的只有目录里写明的那四条。
