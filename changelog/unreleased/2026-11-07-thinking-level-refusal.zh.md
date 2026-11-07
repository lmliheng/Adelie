# 思考等级没切过去时，原因留在输入卡上方，不再只活六秒

- **日期：** 2026-11-07
- **类型：** fix
- **范围：** `web`
- **破坏性：** 否

[English](2026-11-07-thinking-level-refusal.md)

思考等级有两个选择器：新对话页的那个写进 Agent 设置（它同时成为这个 Agent 的新默认档，也是第一条消息
建出来的会话所用的档），会话里那个钉在这一场会话上（从下一次 LLM 请求起生效）。两个都是选中即写，而且
显示的是**写完之后读回来的那一档**，不是点下去的那一档 —— 所以一次被拒的写入在屏幕上什么也没变：选择器
还读着原来的档，按钮本身就是重试。原因却只落进一条通知，六秒后自己消失，此后屏幕读起来与按下之前一模
一样，像是那一下没被接住。

那句话现在画在输入卡上方（与麦克风的提示同一处、同一个理由：它解释的是卡里的一个控件），`role="alert"`、
危险色、限两行、整句挂悬停 —— 这一句比别的拒绝长，切换失败时还要点明是哪一档没改动，限两行之后只剩开头，
所以整句必须能悬停读到。它一直留到下一次尝试开始。

## 两个选择器说的是两件事

新对话页的那个写穿到 Agent 设置，被拒时 Agent 的默认档也没改 —— 而在此之前，那次点击看上去只是「这一
份草稿的档位」。所以草稿页的句子把这件事说出来（「同时是 Agent 的默认档，没有改动」），会话里的那个只钉
这一场会话，句子就不提 Agent。两句共用一条文案，多一个 `forAgent` 参数区分。

窗口归属也按各自的对象记：草稿页按 Agent（换了 Agent 就不再画那一句），会话页按 Session（切走再切回来
时不会把一个不相干的会话的失败挂在当前这一场上）。

## 明细

- `packages/web/src/features/chat/thinking-level-refusal.ts`（新）：`thinkingLevelRefused(error,
  forAgent)` —— 原因走 `refusalText`（7.19 的规则：服务端答复的按它错误码自己的本地化句子念，本仓自己
  抛的值按原样念），整句由 `S.chat.thinkingLevelRefused(reason, forAgent)` 补成。
- `packages/web/src/features/chat/chat-input.tsx`：新增 `thinkingRefusal` 属性，句子画在麦克风提示所在
  的那一段（输入卡上方）。
- `packages/web/src/features/chat/draft-view.tsx`：`onChangeThinkingLevel` 的失败分支不再走通知，写到
  `thinkingRefusal`（Agent id + 句子），开始下一次尝试时清掉；乐观写入与回滚不变。
- `packages/web/src/features/chat/chat-page.tsx`：`applyTurnThinkingLevel` 的失败分支同样收进
  `thinkingRefusal`（Session id + 句子），传给输入卡时只给当前那一场。
- `packages/web/src/lib/strings{,-en}.ts`：一条新文案 `chat.thinkingLevelRefused(reason, forAgent)`。

## 测试

- `packages/web/test/thinking-level-refusal.test.ts`（新，5 条）：服务端答复按错误码自己的句子念、不念
  线上英文原文；请求根本没到路由时保留它知道的那句；什么都没答时回落到通用文案；草稿页那句点明 Agent、
  会话那句不提；跟随当前语言。
- `packages/web/e2e/thinking-level-refusal.spec.mjs`（新，真服务端 + 真浏览器，2 条）：两处写入各自桩成
  500（一个界面自己有文案的错误码 + 一句英文原文）—— 草稿页被拒时句子出现在输入卡上方、逐字带「同时是
  Agent 的默认档，没有改动」、念的是界面自己的话、通知区里没有它、选择器仍读着原来的档、Agent 配置也仍
  是原档，**七秒后**（超过错误通知活着的 6 秒）仍在；放行后重选一次，句子消失、选择器读到新档、配置真的
  变了。第二条：会话页被拒时同一句话（不提 Agent），七秒后仍在，选择器回落到原档；重试成功后句子消失、
  会话读回那个钉住的档。

## 兼容性

不碰接口、不引入新依赖、不改 Project 配置。成功路径、会话中途的「切换会丢缓存」确认框（#310）与两处
乐观写入的回滚都没动。
