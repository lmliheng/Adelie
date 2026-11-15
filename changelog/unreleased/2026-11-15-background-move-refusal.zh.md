# 「转入后台执行」被拒时，原因留在发出这个动作的那一行下面

- **日期：** 2026-11-15
- **类型：** 修复
- **范围：** `web`、`ui`

[English](2026-11-15-background-move-refusal.md)

`exec_command` 或 `run_subagent` 调用执行满 10 秒后，它那一行会出现**转入后台执行**：调用把活儿交回
后台、本轮继续往下走。路由在「调用正好在这一下之前结束了」时答 404，在「这个工具没有后台形态」时答
409，这两种情况下卡片自己会落定，不必多说什么。其余的回答都是真的失败，而原因原先落在一条六秒后自己
消失的通知里 —— 那一行与按之前一模一样，动作还在、还亮着，却没有任何东西说明这一下为什么没生效。

现在这条拒绝留在那一行下面，就在动作同一侧的位置上：按过的那颗按钮就在句子上面一行，所以再按一次就是
重试，而只要还能重试，原因就一直在。句子只说原因，不多说一句 —— 除上面那两种回答之外，路由并不报告这次
调用的状态，5xx 就是这一端读不进去的失败。每次尝试先清掉上一次那句；调用落定、动作消失时，句子跟着一起走。

## 细节

- `packages/web/src/features/chat/background-move.ts`（新增）：`BackgroundMoveAnswer`（`moved` /
  沉默的两种回答 `settled` / `refused` 带原始错误）、`backgroundMoveAnswer(error)` 决定一次失败属于
  哪一种、`backgroundMoveRefused(answer)` 经 `refusalText` 组句 —— 全应用拒绝槽位的统一口径（7.19）。
- `packages/web/src/features/chat/chat-page.tsx`：`onSendToBackground` 改成回 `BackgroundMoveAnswer`，
  不再自己弹通知；404 / 409 两种形状照旧不出声。
- `packages/web/src/features/chat/tool-call-card.tsx`：动作是否可用的判断只算一次（`backgroundAction`），
  于是「要不要给动作」与「要不要画句子」用同一道门；句子归这张卡片自己（`backgroundRefusal`，每次尝试
  先清），以 `refusal` 属性交给共享卡片。
- `packages/ui/src/components/chat/tool-call-card/tool-call-card.tsx`：新增可选的 `refusal`，画成那一行
  下面的单独一行（`role="alert"`、危险色、限两行、整句停在悬停提示里）。它落在行下面而不是动作旁边：
  这一行在任何断点都是一行高，把句子挤到右端会把行里原本的字挤走。
- `packages/web/src/lib/strings.ts`、`strings-en.ts`：`chat.backgroundMoveRefused(reason)` 中英各一句。

## 测试

- `packages/web/test/background-move.test.ts`：404 与 409 读成 `settled`、不出句子；其余失败（含根本没
  到路由的请求）回 `refused`；句子用词典里的说法而不是线上英文、本地抬起来的错误保留原话、什么都没说时
  落到通用文案、调用成功转移时不出声，并跟随当前词典。
- `packages/ui/test/tool-call-card.test.ts`：被拒的动作把句子画在自己那一行上、带 `role="alert"`，动作
  仍在句子上面；没有拒绝时这个槽位不画。

## 兼容性

没有接口变化、没有新依赖、没有配置变化。这个动作原先会弹的通知没有了，改成它自己那一行下面的一行字。
