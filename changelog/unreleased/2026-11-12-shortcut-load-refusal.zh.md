# 快捷键没能从账号读取时，原因留在设置页上

- **日期:** 2026-11-12
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 否

[English](2026-11-12-shortcut-load-refusal.md)

快捷键的分发器在模块求值时就装上了 —— 任何请求回答之前就得有一份键位表 —— 所以在 `GET /api/me/prefs`
回来之前，各行读的是浏览器镜像，回来之后才换成账号上的那一份。此前这次读被拒时，镜像就那么留着、页面上一个字都不说：
那些行可能是上一个账号留下的文档，也可能只是默认值，看上去却与账号上的快捷键一模一样。更糟的是，一次改动就是一次
整份文档的 PUT（服务端对 `keybindings` 是整份替换、不是合并），所以读失败时改一条，可能把账号上还留着的那些覆盖
一起抹掉。

现在快捷键页的顶部会说明这件事，画在它所解释的那些行之上：`没能从账号读取快捷键；下面这一份来自这个浏览器（可能
属于上一个账号，也可能只是默认值），改动会整份写回账号、盖掉账号上原来的按键。重新加载这一页会再读一次：<原因>`。
问题一旦落定它就消失 —— 一次 hydrate（账号那份读到了），或一次真正落地的写入（账号此后就持有屏幕上的这一份）；
它从不另弹通知。

## 细节

- `packages/web/src/lib/shortcuts/store.ts`：`noteHydrateFailure(error)` 记下原始值（句子在渲染时造，切换语言
  会重新措辞），`shortcutLoadFailure()` / `subscribeShortcutLoadFailure()` /
  `shortcutLoadFailureVersion()` 供页面读。清掉它的是 `hydrateFromServer`（账号答了，哪怕是「什么都没存」）、
  一次落地的写入、账号边界，以及测试用的重置。
- `packages/web/src/lib/shortcuts/use-keymap.ts`：`useShortcutLoadFailure()`。
- `packages/web/src/features/settings/shortcut-runtime.tsx`：读 prefs 的拒绝交给 store，不再被一个空的 `catch`
  吞掉。
- `packages/web/src/features/settings/shortcuts-section.tsx`：画在最前，在被拒的写入那一句之上（`role="alert"`、
  `data-testid="shortcut-load-failure"`、attention 色 —— 没有东西坏掉，只是这一页没法为它显示的内容作保）、
  限两行、整句挂悬停。
- `packages/web/src/lib/strings{,-en}.ts`：`loadRefused(reason)`，原因收在句末，与全应用一致。

## 测试

- `packages/web/test/shortcut-load-failure.test.ts`：被拒的读只记一次原始值、镜像让键盘照常工作、不会与被拒的
  写入混淆（并且能挺过一次被拒的写入）、有或没有已存副本的 hydrate 都会清掉它、落地的写入会清掉它、被拒或仍在飞
  的写入不会、换一个账号不会继承它，两份词典都带上「这些行从哪来」「改动会对账号做什么」「重新加载」与原因。
- `packages/web/e2e/shortcut-load-refusal.spec.mjs`：真服务端 + 真浏览器 —— 读被桩成 500 时页面显示那句话、用
  的是界面自己的译文（绝不是线上英文原文）、有一行读的是镜像里的「未设置」、通知区没有东西、账号那份原样未动、
  七秒后仍在；读恢复后重新加载，句子与镜像那一行都不见了。

## 兼容性

线上接口没变、没有新依赖、Project 配置没变。成功的读取与其余读 prefs 的地方行为照旧。
