# 审批决定被拒时，原因留在仍在发问的那个块里

- **Date:** 2026-11-16
- **Type:** fix
- **Scope:** `ui`, `web`, `docs`

[English](2026-11-16-approval-answer-refusal.md)

工具调用等着你回答时，对话里会出现审批块和**允许** / **拒绝** 两颗按钮。按下任一颗就是一个 POST，而它背后
那句 `catch` 只认 404（调用已经不在等了），**其余全被丢在地上**：服务器出错或连接断开时，审批块与按之前
一模一样，屏幕上没有一个字，还是那两颗按钮在问。这一按根本没有生效，却没有任何东西说出来 —— 连一条通知
都没有。

现在被拒的决定把原因写在审批块里、两颗按钮正上方：哪一次决定没送到（两颗按钮挨着摆，读者回到屏幕前未必
知道刚才按的是哪一颗），以及为什么。两颗按钮都留着 —— 什么都没写进去，所以再点一次就是重试。404 仍然
什么也不说：调用已经结束，块会在同一个应答上消失，那时再说一句只会比它解释的事活得更久。子 Agent 的审批
卡片同一条规则，各自带着自己那句。

## 细节

- `packages/ui/src/components/chat/approval-block/approval-block.tsx`：`ApprovalRequest` 多一个可选的
  `refusal`，画在参数块与按钮之间（`role="alert"`、`data-testid="approval-refusal"`、危险色、最多两行、
  整句在悬停里）。
- `packages/web/src/features/chat/approval-refusal.ts`（新）：`approvalAnswerRefused(decision, err)` 用
  `refusalText`（每个拒绝槽共用的那条规则，7.19）造句子，并按界面自己的说法点名这次决定；`ApprovalAnswer`
  就是这句或 `null`。
- `chat-page.tsx` 的 `onApprove` 改为返回 `Promise<ApprovalAnswer>`：决定落地 → `null`；404 → 把待审批
  条目摘掉并 `null`；其余 → 返回句子，待审批条目原样留着。
- `tool-call-card.tsx` 按卡片自己存这份答案并交给审批块，只在块还留在屏幕上时才画（每次尝试先清上一句）；
  `message-stream.tsx` 的渲染上下文跟上新的返回类型。
- 文案 `chat.approvalAnswerRefused(decision, reason)` 中英各一条。
- 文档：`chat.zh.md` / `chat.en.md` 的「审批工具调用」一节说明决定没能交出去时是什么样子。

## 测试

- `packages/web/test/approval-refusal.test.ts`（新，5 条）：服务端的回答按它错误码自己的句子读（从不吐
  线上英文）、允许与拒绝读起来不同、请求没到路由时保留原话、没话可说的值退到通用文案、句子在两种词典里
  都说出「仍在等你回答」。
- `packages/ui/test/tool-call-card.test.ts` 加 1 条：拒绝句画在块内、按钮上方，两颗按钮都还在。
- `packages/web/e2e/approval-answer-refusal.spec.mjs`（新，2 条，真服务端 + 仓库自带 mock 模型）：把决定
  拒成 500 `internal` → 审批块仍在发问、句子在按钮上方且从不含线上英文、没有通知、七秒后仍在，随后同一颗
  按钮把决定交上去、这一轮继续跑；以及 404 时块安静地收起（调用本来就已经结束）。

## 兼容性

只动前端状态、文案与文档，接口、线上格式与已存数据都没变。
