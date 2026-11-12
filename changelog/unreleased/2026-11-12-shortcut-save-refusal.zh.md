# 快捷键没能保存到账号时，原因留在设置页上，不再只活六秒

- **日期:** 2026-11-12
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 否

[English](2026-11-12-shortcut-save-refusal.md)

改一条快捷键是**立刻生效**的：浏览器镜像先写，所以请求还没发出去，输入区与各处提示里的组合就已经跟着变了。
账号上那一份是第二个写；此前它被拒时，原因只在一条六秒后自己消失的通知里 —— 而那一行照样显示账号从没收到过的
组合，下一次加载又把账号的那份盖回镜像，看起来就是这次改动悄悄没了、也没留下一句解释。

现在那句话画在**快捷键页的顶部**：`快捷键没能保存到账号；这一改动只在这个浏览器里生效，重新加载后会退回账号上
原来的快捷键：<原因>`。它留到下一次改动为止 —— 任何一次改动都是重试，因为一次 PUT 带的是整份文档；这件事不再
另弹通知。

## 细节

- `packages/web/src/lib/shortcuts/store.ts`：开始看写入方的回答 —— 抛出的、或被拒的 Promise 都记下来
  （`shortcutSaveFailure()`），由下一次尝试、一次 hydrate（屏幕又是账号那一份）与账号边界清掉；记的是原始值，
  切换语言会重新造句。
- `packages/web/src/lib/shortcuts/use-keymap.ts`：`useShortcutSaveFailure()` —— 由持有这些改动的那一页来读。
- `packages/web/src/features/settings/shortcut-runtime.tsx`：自己装 `PUT /api/me/prefs`，不再把拒绝弹成通知。
- `packages/web/src/features/settings/shortcuts-section.tsx`：画在列表**上方**（`role="alert"`、
  `data-testid="shortcut-save-refusal"`、危险色、限两行、整句挂悬停）。不放在某一行：那一行说不出来 —— 它
  本来就显示新的组合 —— 而且这次写的是整份文档，「全部恢复默认」也走同一条。
- `packages/web/src/lib/strings{,-en}.ts`：`saveFailed`（通知那一句，现已无人使用）换成 `saveRefused(reason)`；
  原因收在句子末尾，与全应用一致。

## 测试

- `packages/web/test/shortcut-save-failure.test.ts`：被拒的写与直接抛出的写都记下来、订阅者只被通知一次、落下
  的一次写入 / 一次 hydrate / 全部恢复默认 / 换一个账号都会清掉、只带回执不给值的写入不会凭空造出失败，以及
  两份词典都带上原因与「重新加载会退回」这个承诺。
- `packages/web/e2e/shortcut-save-refusal.spec.mjs`：真服务端 + 真浏览器 —— 被拒的改键把句子留在列表上方、
  用的是界面自己的那句（绝不是线上英文原文）、通知区没有东西、七秒后仍在、那一行仍显示新组合、账号那份原样未动；
  紧接着的一次改动落定，句子归零、账号跟上。

## 兼容性

线上接口没变、没有新依赖、Project 配置没变。成功的写入、其余通知与行上的提示都一字未改。
