# 压缩阈值没有改成时，原因留在发问的那张卡片里

- **日期:** 2026-11-08
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 无

[English](2026-11-08-context-threshold-refusal.md)

上下文面板上那条虚线裁剪器从不直接写：松手（或在它上面按回车）会打开一个确认框，念出是哪个 Agent、要把阈值
从多少改掉，卡片里的「保存」才去写。服务端拒了这次写之后，卡片带着改过的数字原样留着 —— 保存就是重试 ——
但唯一解释原因的那句话在它上面的一条通知里，六秒后自己消失。留下的那张卡片看起来像个没人回答的问题。

这正是 7.19 禁止的形状，而在这张卡片上代价更大：字段里还留着那个人要的数字，屏幕上却没有一个字说它生效了
没有。它没有 —— Agent 手里仍是原来的阈值。

原因现在画在同一张卡片里，在它那句话下面、按钮上面（`role="alert"`、危险色、整句换行），留到下一次尝试或
卡片被关掉为止。句子念出被要求的那个阈值（对话一关，那个数字就没有别的落点），并明说 Agent 上仍然是原来的值。

## 细节

- 新增 `packages/web/src/features/chat/context-threshold-refusal.ts`：`contextThresholdRefused(tokens, error)`。
  原因走 `refusalText`（7.19 的规则：服务端答复的按错误码念界面自己的本地化句子，不念线上英文原文）；数字走
  `humanizeTokens`，所以这句话读起来与字段、与它上面的环一致。
- `packages/web/src/features/chat/context-gauge.tsx`：`confirmThreshold` 把拒绝留在 `thresholdRefusal` 里，
  不再交给调用方；`ThresholdDialog` 把它交给共享的 `ConfirmModal` 的 `refusal` 槽。新提案与被关掉的卡片都会
  清掉它。`onChangeCompactionLimit` 的契约改为「拒绝由这里画出来」。
- `packages/web/src/features/chat/chat-page.tsx`：`onChangeCompactionLimit` 不再在 reject 之前弹一条通知 ——
  说原因的是发问的那张卡片，而通知会浮在读者正看着的对话框上面。
- `packages/web/src/lib/strings{,-en}.ts`：新增一句 `chat.contextThresholdRefused(n, reason)`。

## 测试

- `packages/web/test/context-threshold-refusal.test.ts`（新增，6 条）：服务端的原因按错误码念（绝不念线上
  原文）、界面自己抛出的句子原样保留、什么都没说时落到通用文案、念出被要求的阈值且用的是 `humanizeTokens`
  的写法、点明 Agent 上仍是原来的值、以及英文那一句。
- `packages/web/e2e/context-threshold-refusal.spec.mjs`（新增，真服务端 + 真浏览器）：先通过 mock 模型走一轮，
  让面板有一次测得的上下文；再把裁剪器向左移两步并松手；保存由 `page.route` 拒掉，并从 API 读回服务端状态。
  句子出现一次、在卡片里、念的是界面的话；通知区为空；卡片留着改过的数字；Agent 仍是原来的阈值 —— 而且
  **七秒之后**那句话还在。放行后同一颗保存清掉它、关掉卡片、写下阈值，裁剪器也停到新值上。

## 兼容性

不改接口、不引入新依赖、不改 Project 配置。这张卡片的其它行为 —— 字段自己的校验、超出模型窗口的提示、
成功时的通知 —— 原样不变。
