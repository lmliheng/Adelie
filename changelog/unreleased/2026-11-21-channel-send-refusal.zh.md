# 频道里一条没发出去的消息，原因留在输入框上方，不再是一条会走的通知

- **Date:** 2026-11-21
- **Type:** fix
- **Scope:** `web`

[English](2026-11-21-channel-send-refusal.md)

在组织频道里点「发送」是这块输入框唯一的写。失败时那句话落进一条盖在消息流上的通知，六秒后自己走掉 ——
而输入框里的字（连同 @ 提及）一个字没少、发送按钮还在原处，屏幕上再没有一个字说得出这次为什么没发出去
（7.19 的规矩：句子留在尝试发生的地方）。

现在原因画在输入框上方、发送按钮的正上方，留到下一次按下为止；试一次新的就先清掉上一句。两句里哪句仍是一个
有测试的纯函数：界面自己的那句引导句 + 服务端的原因，词典里有这个词就用词典的（如 `internal`），没有就照抄
服务端（频道写入常见的 `channel_archived` / `not_a_member` 正属于后者）。

## 细节

- `packages/web/src/features/company/channel-send-refusal.ts`（新）：`channelSendRefusalLine(err)` ——
  引导句是 `S.company.channels.sendRefused`，原因走共用的 `refusalText`（与消息卡、子会话输入框同一个口径）。
- `packages/web/src/features/company/channel-composer.tsx`：多一个 `sendRefusal` 槽位，画在输入行上方
  （`role="alert"`、`data-testid="channel-send-refusal"`、危险色、两行、整句挂悬停）。它画在框**外面**
  —— 框下面仍然什么都不画（那是「提示」的位置，读一次就占了消息流的一行；这是对一次按下的回答）。
- `packages/web/src/features/company/channel-view.tsx`：`send` 不再弹通知，改成记下「哪句话 + 哪个频道」，
  每次按下先清空；换频道时与其它流状态一起清掉，所以一句话不会跟着人跑去别的频道（迟到的失败也一样）。
- 两本词典各加一条 `company.channels.sendRefused`。

## 测试

- `packages/web/test/channel-send-refusal.test.ts`（新，5 条）：词典不认识的码照抄服务端（`channel_archived`）、
  认识的码用词典（`internal`）、自己抛的句子原样保留、什么都没说时落到通用那句、引导句跟着界面语言。
- `packages/web/e2e/channel-send-refusal.spec.mjs`（新，3 条，真服务端 + 真浏览器）：① 存储回 500 → 输入框上方
  一句、只一句、通知区没有它、框里还留着那句话、按钮仍可按、七秒后仍在，重试即上屏；② 读着的时候频道被别人
  归档（真 409 `channel_archived`）→ 服务端那句话在输入框上方，框里留着字；③ 换到另一个频道再回来，一句话
  都不跟过去。
- **反证**：同一份 spec 挂改前产物 → 3 条全红（没有那个槽位）；两态探针（同一脚本两条腿）改前是通知区 1 条、
  八秒后 0 条、输入框上方 0 条，改后是输入框上方 1 条、八秒后仍在。

## 兼容性

只动前端渲染：接口、线上格式与已存数据都没变，服务端一句没改。归档 / 非成员这两条拒绝的语义与状态码不变。
