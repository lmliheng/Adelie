# 频道里往前翻一天失败时，原因留在那个按钮下面，不再只是一条六秒通知

- **Date:** 2026-11-21
- **Type:** fix
- **Scope:** `web`

[English](2026-11-21-channel-earlier-refusal.md)

频道里点「更早的记录」就是再读一天的消息。那一天没读回来时屏幕上什么都不会变：已经读到的日子都在、
按钮还在原处 —— 唯一的说明是一条盖在页面顶部的通知，六秒后自己走掉。六秒之后，流里只是少了一天，
再没有一个字说得出刚才那一次点击有没有发生（7.19 的规矩：句子留在尝试发生的地方，而按钮就是重试）。

现在原因画在按钮正下方（`role="alert"`、`data-testid="channel-earlier-refusal"`、危险色、两行、
整句挂悬停），留到**下一次**点击或者换频道为止 —— 不靠计时器消失。

## 细节

- `packages/web/src/features/company/channel-earlier-refusal.ts`（新）：`channelEarlierRefusalLine(err)`
  —— 引导句加原因，原因按 `refusalText` 的规则取（词典认得的码用词典的句子，不认得的保留服务端的原话；
  组织侧的读大多返回本 App 没有句子的码，所以兜底在这里是真的在用）。
- `packages/web/src/lib/strings.ts` / `strings-en.ts`：新增 `company.channels.earlierRefused`（中文
  「更早的记录没有取到：…」、英文 `Earlier days could not be loaded: …`），与相邻的 `sendRefused` 同一形状。
- `packages/web/src/features/company/channel-view.tsx`：`loadEarlier` 的 `catch` 不再弹通知，改成记一句话；
  每次点击先清掉上一句，换频道时随其它流状态一起清掉；按钮那一行从「居中一行」改成「居中一列」，
  句子画在按钮下面（内容在下面，句子就落在按钮与流之间），`toastError` 的 import 一并删掉。

## 测试

- `packages/web/test/channel-earlier-refusal.test.ts`（新，5 条）：词典认得的码用词典的句子；不认得的码
  保留服务端原话；浏览器侧自己抛出的句子照原样；什么都没有时落到通用句；换成英文时引导句跟着换。
- `packages/web/e2e/channel-earlier-refusal.spec.mjs`（新，2 条，真服务端 + 真浏览器）：
  ① 首屏读满 7 天、第 8 天留在按钮后面 → 点「更早的记录」，服务端答 500（码 `internal`）→
  按钮正下方一句「更早的记录没有取到：服务器内部错误，请稍后重试。」、`role=alert` 只一条、通知区没有它、
  按钮仍在且可点；**过了七秒那句话仍在**；去掉拦截再点一次 → 句子消失、那天的消息进流；
  ② 换到全员频道再回来，句子不跟着读者走。

## 兼容性

只动前端渲染：接口、线上格式与已存数据都没变，服务端一句没改；分页仍是一次点读一天。
