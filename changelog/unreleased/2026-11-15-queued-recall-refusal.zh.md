# 撤回一条排队消息被拒时，原因留在按下去的那一行上

- **日期：** 2026-11-15
- **类型：** 修复
- **范围：** `web`

[English](2026-11-15-queued-recall-refusal.md)

本轮跑着的时候，消息可以排给它 —— 中途的一记插话，或者一条跟进消息 —— 每一条排队的记录都会画在
输入框上方、带着它的内容和一个小小的「撤回」箭头。按下箭头，服务端就把这条记录取走、内容回到输入
框里等着改。DELETE 被拒时屏幕上一点没变：那一行还写着这条消息，箭头还亮着，所以重试就是同一个箭头；
缺的只是原因，而它落在一条六秒后自己消失、还浮在页面顶部的通知里 —— 看起来就像那一下根本没按到。

现在拒绝留在按下去的那一行下面，按「哪条队列 + 哪一条记录」定位，所以同时排着几条消息时它只会出现
一次、就在问过的那一行底下。句子只说原因，不多说一句：这条路由真会给出的两种拒绝本来就说明了去向
（`not_pending` —— 插话已经随本轮送达模型；`follow_up_started` —— 跟进消息已经变成一个任务），而 5xx
意味着记录仍在队列里，所以句子上面那一行才是这条消息此刻的实情。每次尝试先清掉上一次那句，那条记录
一旦从队列里消失、句子也跟着自己的行一起走，箭头不再弹任何通知。

## 细节

- `packages/web/src/features/chat/queued-recall-refusal.ts`（新增）：`queuedRecallRefused(queue, id,
  error)`，`queue` 取 `steer` / `followUp`；原因走 `refusalText`，句子在词典里。
  `queuedRecallRefusalShown(refusal, queue, id)` 决定哪一行来画（没有 id 的老服务端记录本来就没有
  箭头，也就轮不到它），`queuedRecallRefusalHosted(refusal, steering, followUps)` 说出它描述的那条
  记录还在不在屏幕上。文件头写清为什么键里要有队列：两张列表挂在同一个输入框卡片里。
- `packages/web/src/features/chat/chat-input.tsx`：两个回调改成回 `RecallAnswer`（`recalled` 带内容 /
  `refused` 带错误），句子交给唯一知道「按的是哪一行」的地方 —— 也就是这个组件本身。新增
  `recallRefusal` 状态：每次尝试先清，记录离开队列后由 effect 清；`QueuedMessageLine` 多一个可选的
  `refusal`，画成那一行下面的另一块（`role="alert"`、危险色、限两行、整句停在悬停提示里）。
- `packages/web/src/features/chat/chat-page.tsx`：`onRecallSteering` / `onRecallFollowUp` 把拒绝原样
  带回去，不再自己弹通知。
- `packages/web/src/lib/strings.ts`、`strings-en.ts`：`chat.recallQueuedRefused(reason)` 中英各一句。

## 测试

- `packages/web/test/queued-recall-refusal.test.ts`：服务端那条拒绝读成词典里的中文而不是线上英文
  （两张队列的 409 各自分明）、队列与记录号原样带回、自己抬起来的失败保留原话、句子绝不声称「已撤回」、
  只有对上的那一行会画而另一队列里同 id 的记录不会、跟随当前词典。
- `packages/web/e2e/queued-recall-refusal.spec.mjs`：真服务端 + 真浏览器 + 真排队一条消息（mock 模型的
  慢工具让本轮一直忙着），三条。DELETE 由 `page.route` 拒掉，服务端手里的队列一个字节没动。409
  `not_pending`（句子在那一行下面、说的是词典里的中文而不是线上英文、内容与箭头都还在且仍可点、草稿没被
  碰、通知区没有按钮）；先 500 再 409（一次只有一句，而且是新按的那一下的）；两条消息排队、只按第二条的
  箭头（只有一句，且画在第二行下面而不是第一行下面）。

## 兼容性

没有接口变化、没有新依赖、没有配置变化。这些箭头的拒绝原先会弹的通知没有了，改成它自己那一行下面的
一行字。
