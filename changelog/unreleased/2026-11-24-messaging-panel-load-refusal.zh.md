# 对话的「远程控制」面板读不到设置时，原因留在面板里，下面就是重试

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

对话右侧停靠栏里的「远程控制」面板要先读一次这个对话的绑定设置。那次读取被拒绝时（会话没了、没有
访问权限、服务端 500、机器连不上），过去只有一条六秒就走的通知，而面板一直画着两块骨架屏 —— 看上去
是「还在读」，其实请求早就回来了，只是被拒。现在句子画在表单本该出现的位置，下面的「重试」就是那次
读取本身：按下去会重新读一遍，读到了表单就替换掉这句。

## 细节

- `packages/web/src/features/messaging/messaging-load-refusal.ts`（新）：`messagingLoadRefusal()` 返回
  `{ text, toast }` —— `text` 是界面自己的话（`S.messaging.loadRefused(...)` 包住 `refusalText`，
  服务端的英文原文不上屏），`toast` 由宿主声明要不要：没声明的宿主仍弹那一条（会话行打开的弹窗会在
  读取失败时关掉自己，它只剩通知可说）。
- `packages/web/src/features/messaging/messaging-binding-editor.tsx`：hook 多一个 `loadRefusal` 与一个
  `reload()`；初始读失败时记下句子（并把 `saysLoadRefusal` 交给纯函数决定要不要 `toastError`），
  读到之后清掉；`reload()` 忘掉「这个会话已经读过」的标记并重跑初始读 —— 失败的那次本来会把这个会话
  标记成读过，免得轮询对着一个一直说不的服务端空转。
- `packages/web/src/features/messaging/messaging-panel.tsx`：表单没到时，有句子就画 `NoticeStrip`
  （`role="alert"`、危险色调）并在下面给一个「重试」按钮，没有句子才是骨架屏；传
  `saysLoadRefusal: true`，所以这一句不再同时以通知的形式重复一遍。
- 两本词典各加一条 `messaging.loadRefused`。
- `packages/web/test/messaging-load-refusal.test.ts`（新，5 条）覆盖：错误码走本地化句子、不改服务端的
  英文原文、默认仍给通知、宿主自己画时不给通知、空错误有兜底句、两种语言。
- `packages/web/e2e/messaging-panel-load-refusal.spec.mjs`（新，2 条，真服务端 + 真浏览器）：只拦
  `GET …/messaging` 按 500 交回 → 面板里恰好一条句子、骨架屏 0 块、表单字段不在、通知区没有它、七秒后
  还在、重试按钮在；解除拦截点重试 → 表单出现（App ID 就是库里存的那一个）、句子与重试按钮一起消失、
  读取确实又去了一趟服务端。

## 兼容性

只改读取失败时画在哪里，以及多了一个按钮。接口、数据根与成功路径都没变；会话行打开的弹窗行为不变。
