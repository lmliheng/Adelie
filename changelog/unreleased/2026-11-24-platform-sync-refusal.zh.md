# 平台同步被拒时，原因留在那个分组的表头下面

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

[English](2026-11-24-platform-sync-refusal.md)

模型库里 Penguin Go 分组表头上的「同步」按下去之后，如果这次同步被服务端拒绝，过去只有一条六秒就走的
通知：表头、模型卡、默认与视觉模型指针都跟按之前一模一样，通知消失后屏幕上什么都没有了，读者无从知道
刚才那一下到底有没有生效。现在原因留在那个分组自己的表头下面 —— 拒绝时什么都没写，而表头上的「同步」
按钮就是重试。

## 细节

- `packages/web/src/features/models/platform-sync-refusal.ts`（新）：`platformSyncFailure(error)` 交回
  `{ kind: "authorize" }` 或 `{ kind: "refused", text }`。前者是 `platform_reauthorization_required`
  —— 存下的 key 被撤销了，页面照旧打开授权流程，那才是修复动作，所以不留句子；其余一切按 7.19 的规矩
  走 `refusalText`，句子留在按下去的地方。
- `packages/web/src/features/models/models-page.tsx`：`syncPlatformModels` 收下按下按钮的那个分组 id，
  每次尝试先清掉上一次的句子，被拒时记下 `{ providerId, text }`；句子用库里的 `NoticeStrip`
  （`role="alert"`、危险色调、`S.common.refused(...)` 引导句）画在该分组表头与模型卡之间，折叠与否都
  看得见（动作在表头上）。分组被搜索过滤掉时句子随之清掉 —— 它的宿主面与重试按钮都不在屏幕上了。
- 新 e2e `packages/web/e2e/models-platform-sync-refusal.spec.mjs`（2 条）：被拒时句子在表头下、通知区
  0 条、七秒后仍在、按钮仍可再按；解除拦截后再按一次，句子消失并报「预置模型已是最新」。

## 兼容性

只改了失败时画在哪里。接口、数据根、模型目录与成功路径的提示都没变。
