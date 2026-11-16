# 会话里的停止没送到服务器时，原因留在输入卡上方

- **Date:** 2026-11-17
- **Type:** fix
- **Scope:** `web`, `docs`

[English](2026-11-17-chat-stop-refusal.md)

输入卡上的**停止**是一次会话中止请求，而它背后那句 `catch(() => undefined)` 把失败整个吞掉了：服务器出错时
输入卡与按之前一模一样 —— 同一颗**停止**按钮，运行照旧在写 —— 屏幕上没有一个字说这一按没有送到。这里连一条
会自己消失的通知都没有，读起来就像按下的那颗按钮什么都没做，而且读者没有办法分辨是点击丢了，还是这次运行
收不下来。

现在没被服务器接下的停止，把原因写在输入卡上方那一条已经被拒绝的发送占用的位置上：按的是什么（停下这次
运行）、它没有生效（运行仍在继续），以及为什么 —— 用界面自己的说法，从不吐线上英文。什么都没停下，所以
同一颗**停止**按钮留着，再按一次就是重试。这句话跟这次运行同生共死：这个 Session 一回到空闲就收走，而不是
等某个计时器。404 什么也不说：会话本身已经不在了，那句话说的那次运行也随之结束，再说一句只会比它解释的事
活得更久。（路由的 204 不是拒绝：它说已经没有可中止的运行，正是这一按想要的结局。）

## 细节

- `packages/web/src/features/chat/message-send-refusal.ts`：新增 `stopRefusalLine(sessionId, err)`，返回与
  拒绝的发送同一个 `SendRefusal` 形状 —— 404 返回 `null` —— 与 API 标签页「试一试」里的 `stopFailed` 同一
  条规则。
- `packages/web/src/features/chat/chat-page.tsx`：`stopRefusal` 单独一格（不塞进 `sendRefusal`，因为它是唯一
  一个自己就会失效的拒绝），`stream.taskState` 回到 `idle` 时清掉；`onStop` 不再吞掉失败，而是把原因落进
  这一格；渲染时按 Session 归属传给输入卡。
- `packages/web/src/features/chat/chat-input.tsx`：新增 `stopRefusal` 属性，句子画在输入卡上方、其余拒绝
  旁边（`role="alert"`、`data-testid="stop-refusal"`、危险色、最多两行、整句在悬停里）。
- 文案 `chat.stopRefused(reason)` 中英各一条。
- 文档：`chat.zh.md` / `chat.en.md` 的「Task 运行期间」一节补一句（停止没送到服务器时是什么样子）。

## 测试

- `packages/web/test/message-send-refusal.test.ts` 加 6 条：句子说运行仍在继续、用界面自己的说法（不含线上
  英文）、404 什么都不产生、请求没送到时保留错误自己的话、不点任何模型的名字、只说当前那个 Session。
- `packages/web/e2e/chat-stop-refusal.spec.mjs`（新，2 条，真服务端 + 仓库自带 mock 模型，用 mock 的
  `background move test`（前台 `sleep 45`）让运行一直跑着）：把中止 POST 拒成 500 `internal` → 句子在输入卡
  上方、说运行仍在继续、从不含线上英文、没有通知、四秒后仍在，随后同一颗按钮把中止交上去，句子随 Session
  回到空闲一起收走；以及 404 时一个字都不说，而**停止**仍在原处。

## 兼容性

只动前端状态、文案与文档，接口、线上格式与已存数据都没变。
