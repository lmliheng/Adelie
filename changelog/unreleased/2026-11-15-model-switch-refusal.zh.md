# `/model` 换模型没能开出新对话时，原因留在输入卡上方

- **Date:** 2026-11-15
- **Type:** fix
- **Scope:** `web`

[English](2026-11-15-model-switch-refusal.md)

暂存一个 `/model` 目标之后，发送按钮做的是「用这个模型新开一个对话，把这条消息投过去」。被拒时（新对话
建不起来、第一条消息发不出去、模型的 key 不可用）草稿与小卡片都还在那张卡上，刚才按的那颗按钮**就是**
重试，而原因原本只活在一条**六秒后自己消失**的提醒里。现在它写在**输入卡上方**那一行 —— 与普通发送、
与 `/agent` 交接同一个位置 —— 并一直留到下一次尝试。

工位对话（公司模式里员工的常设会话）要另说一句：那里 `/model` 不是分叉，它**先把新模型写进员工条目、
再把工位换到它上面**，最后才投那条消息，所以被拒可能落在写之后。因此两句分开：普通对话说「没能用 X 开
一个新对话，本会话保持不变」，工位只说真成立的两件事 —— 这条消息没有发出、桌子现在用哪个模型以组织图
为准（页面在画这句话的同时重新拉一次组织图）。

## 细节

- `packages/web/src/features/chat/message-send-refusal.ts` 新增 `modelSwitchRefusalLine(sessionId, err,
  model)` 与 `deskModelRefusalLine(sessionId, err, model)`，`PickedModel` 带小卡片的显示名与上游 id：
  原因仍走普通发送那一对 `sendRefusalReason`，`model_credential_missing` 用 id 点名模型（它的正文不带
  模型名），句子里的模型名用小卡片上的显示名。
- `chat-page.tsx` 的 `onSwitchModel`：每次尝试先清掉上一句；分叉那一支的 `catch` 写 `modelSwitchRefusalLine`，
  工位那一支写 `deskModelRefusalLine`（组织图与组织会话照旧在 `catch` 里重拉），两处都不再弹通知。
  原先定义在文件下半段的 `modelDisplay` 挪到 `onSwitchModel` 之前，供它取显示名。
- 文案 `chat.modelSwitchRefused(model, reason)` / `chat.deskModelRefused(model, reason)` 中英各一对。
- 文档：`chat.zh.md` / `chat.en.md` 的「开新会话」一节各加一段；`company-mode.zh.md` / `.en.md` 讲员工模型的
  那一段补上工位这一支被拒时停在哪、以什么为准。
- 有意没动的：`askWithPicture`（回复图片上的动作，宿主是那张图片自己的动作栏，要往 `packages/ui` 的回复
  图片里加一个槽）与 `runCompaction`（`/compact` 与思考等级对话框的「压缩后再切」共用一条路，宿主得先定）。

## 测试

- `packages/web/test/message-send-refusal.test.ts` 加 8 条：分叉那句点名小卡片上的模型名并说本会话没变、
  缺 key 时点名模型、请求没到路由时保留原话、跟随当前语言、按暂存的那条会话归属；工位那句**不**声称
  组织图没被改动（不含「本会话保持不变」，含「这条消息没有发出」与「组织图」）、缺 key 时点名模型、
  英文版不出现 unchanged。
- `packages/web/e2e/model-switch-refusal.spec.mjs`（新，3 条，真服务端 + 仓库自带 mock 模型）：分叉被拒 →
  句子在卡片上方、不是通知、七秒后仍在、草稿与小卡片都在、没有留下空对话，放行后同一颗按钮落进新对话；
  `model_credential_missing` → 句子点名被选的模型；工位对话（真组织 + 真工位会话，PATCH 员工条目被拒）→
  句子说这条消息没有发出、以组织图为准，且**不说**本会话保持不变。

## 兼容性

只动前端的状态、文案与显示，接口、线上格式与已存数据都没变。
