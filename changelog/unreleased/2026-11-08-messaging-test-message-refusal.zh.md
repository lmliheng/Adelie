# 远程控制卡片里发送测试消息被拒时，原因写在卡片里，不再只活六秒

- **日期:** 2026-11-08
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 无

[English](2026-11-08-messaging-test-message-refusal.md)

远程控制卡片的「发送测试消息」把一句固定的话投进连接已知的那个聊天，除此之外什么也不写：无论
成不成，卡片都与按下之前一模一样。于是一条没发出去的消息，唯一的解释在那条六秒后自己消失的通知
里，而读者真正要看的东西 —— 连接状态、机器人还在不在那个聊天里、平台的回复时限、上一次投递失败
的原因 —— 就在上面那几行。

那句话现在画在两个探测按钮下面那一行：`role="alert"`、危险色、限两行、整句挂悬停，并且一直留到
下一次按下或切换渠道为止 —— 按钮自己就是重试。它单占一个槽位、不与凭证探测共用：「凭证连不上」
和「聊天不收这条消息」是两件事，也是两个按钮各自答复的。

这一行还分得清它知道什么、不知道什么。服务端答复了的时候 —— 平台拒收、已经没有已知聊天、请求
本身被拒 —— 消息确实没发出去，其中「平台拒收」保留平台自己的原话（细节才是能动手的那一半，
错误码的句子只是把按钮又念了一遍）。请求根本没回来的时候，服务端很可能已经把消息投出去了，只是
回程丢了：这一种写「没能确认是否已送达」，因为硬说「没发出去」会让人再发一条，而那一条大概率是
重复的。

## 细节

- 新增 `packages/web/src/features/messaging/messaging-test-message-refusal.ts`：
  `messagingTestMessageRefusal(error)` —— `<channel>_send_failed` 保留平台细节，其余走
  `refusalText`（7.19 的规则：服务端答复的按错误码念界面自己的本地化句子、不念线上英文原文），
  而「请求根本没回来」那一种用 `S.messaging.testMessageUnconfirmed`，不是
  `S.messaging.testMessageRefused`。
- `packages/web/src/features/messaging/messaging-binding-editor.tsx`：hook 多一个
  `testMessageRefusal`（下一次按下开始时、切换渠道时、编辑器改指另一个会话时清掉；改字段不清，
  因为这条消息走的是已存下的绑定，不是草稿）；发送的失败分支不再走通知，而是写上它；
  `MessagingBindingBody` 把它画在探测那一行之后、同一个块里、按钮行下面。
- `packages/web/src/lib/strings{,-en}.ts`：两条新文案，`messaging.testMessageRefused(reason)` 与
  `messaging.testMessageUnconfirmed(reason)`。

## 测试

- 新增 `packages/web/test/messaging-test-message-refusal.test.ts`（7 条）：平台拒收时保留平台原话
  （不用错误码那句笼统的话顶替）；平台拒收但没带细节时落到错误码那句；`no_chat` 与被拒的请求都
  按错误码念界面自己的句子、不念线上英文原文；请求没回来时写「没能确认是否已送达」而不是「没发
  出去」；什么都没有时落到通用文案；中英两种界面语言。
- `packages/web/test/messaging-binding-editor.test.ts`（+1 条渲染断言）：句子画在按钮行下面、探测
  那一句之后、凭证字段之前，整句挂悬停 —— 没有任何拒绝时卡片上一条 alert 都没有。
- 新增 `packages/web/e2e/messaging-test-message-refusal.spec.mjs`（真服务端 + 真浏览器）：把发送
  路由桩掉（行对话框里那两个按钮要有「已连接且有已知聊天」才可按，所以 `GET …/messaging` 的读
  也一起供给；没有一个请求离开这台机器）。发送被拒时句子在卡片里、逐字、只有一条、念平台的原文，
  通知区里没有它，**七秒后**仍在、按钮仍可再按。第二条：等发送放行后重按同一个按钮，句子消失、
  弹出普通的「测试消息已发送」，两次请求都记下来了。第三条：请求一直不回答时念的是「没能确认」
  那一句，绝不声称消息没发出去。

## 兼容性

不改接口、不引入新依赖、不改 Project 配置。成功路径、凭证探测的拒绝、保存的拒绝、启用开关的拒绝
都没动。
