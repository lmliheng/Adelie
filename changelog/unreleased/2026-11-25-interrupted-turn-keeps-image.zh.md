# 中断的那一轮重发时，图还在

- **Date:** 2026-11-25
- **Type:** fix
- **Scope:** `core`

[English](2026-11-25-interrupted-turn-keeps-image.md)

一轮在模型收尾之前就结束（读者按了停止、供应商回了一个致命错误、某次尝试被放弃）时，引擎会把那一轮
的输入连同下一条消息一起重发。文本会被转写成一段 `[turn_aborted]`，而附在输入里的图片则被直接丢掉：
下一次请求于是让模型回答一张已经不在请求里的图。现在图以自己的消息形式一起带上，排在那段块前面；
块的第一个行说明图就在上面。图片按地址或字节认出同一张，所以第二次中断重新折叠同一份 carry-over 时
它只留一份，而不是每中断一次多一份。

## 细节

- `packages/core/src/engine/context-engine.ts`：`flattenCarryOver` 与它一直保留的结构化
  `tool_call_output` 并列，保留输入里的图片消息（`image_url`，以及媒体类型是图片的 `inline_data`），
  并把它们放在 `[turn_aborted]` 文本之前；那段文本的第一行写着
  `(the input also carried 1 image, kept above this block as image message)`。已经折叠过的 carry-over
  再折叠时，这一行会被丢掉 —— 它数的是上一份的图，新的一行数的才是这次请求实际带的。
- `packages/core/test/engine.test.ts`：两条用例 —— 致命退出之后图（连同那行说明、以及它在块前面的位置）
  都还在；第二次中断不会把它变成两份。

## 兼容性

只改一次请求里带什么。Trace、存下来的对话与线上格式都没变；carry-over 本来就是仅内存的。供应商按请求
计的图片上限照旧生效（`fitReplayedImages`），输入里多出来的旧图会被换成说明。
