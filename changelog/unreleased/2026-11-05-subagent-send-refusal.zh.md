# 子智能体面板发不出去的消息，原因留在输入框上方，不再只活六秒

- **日期：** 2026-11-05
- **类型：** fix
- **范围：** `web`
- **破坏性：** 否

[English](2026-11-05-subagent-send-refusal.md)

智能体停靠栏有自己的输入框，因此子会话可以直接在面板里回话。那条消息没能送到子会话时 —— 子会话已经被
释放、恢复不了，服务端拒绝了，或者连接断了 —— 输入框是有意留着用户打的字的（`onSend` 返回 `false` 正是
为了这个），而原因只落进一条通知：六秒后它自己消失，屏上留下一个仍然装着那条消息的框、同一颗重试的按钮，
以及什么都没有发生的样子。

那句话现在贴在它所属的框上方（`role="alert"`、危险色、`NoticeStrip` 的危险色调），一直留到下一次尝试
把它清掉。子会话已被释放时仍念它自己的那句（「该子会话已不存在，无法恢复」）—— 那里缺的是子会话，不是
消息；其余失败一律先点名这件事，再接服务端原话，走全应用拒绝位的规则（请求没到服务端时念错误码自己的
本地化句子，而不是它的线上原文）。

## 明细

- `packages/web/src/features/chat/subagent-send-refusal.ts`（新）：`subagentSendRefused(err)` —— 纯判断，
  念哪句话只在这一处，不依赖面板就能测。
- `packages/web/src/features/chat/subagents-view.tsx`：面板的 `SubagentComposer` 多一个 `sendRefusal`
  状态 —— `sendFailure` 写上（原来走 `toastError`），发送与转向两条路在请求发出之前清掉；那条提示条画在
  `ChatInput` 上方、同一个阅读栏里。输入框按子会话设了 key，切换节点不会把上一次的话带过去。
- `packages/web/src/lib/strings{,-en}.ts`：一对新文案 `subagentPanel.sendRefused(reason)`。

## 测试

- `packages/web/test/subagent-send-refusal.test.ts`（新，5 条）：被释放的子会话念它自己那句；服务端的
  答复先点名这件事并带上原话；没到服务端的请求按 `refusalText` 读；无话可说时退回通用句；用的是当前语言。
- `packages/web/e2e/subagent-send-refusal.spec.mjs`（新，真服务端 + 真浏览器）：派生子会话，把子会话
  消息那一笔 `POST` 在 `page.route` 上桩成 500，在面板的输入框里按发送。那句话画在框上方、带服务端原话，
  通知区里没有它，草稿仍在框里；**7 秒后**（超过错误通知活着的 6 秒）它仍在；把这条路由放行之后再发一次，
  屏上什么都不留。

## 兼容性

不碰接口、不引入新依赖、不改 Project 配置。面板里另一处 `pinChildLevel` 失败（工具栏那次思考等级的下发）
仍走通知：那里要改的是选择器本身，不是输入框。
