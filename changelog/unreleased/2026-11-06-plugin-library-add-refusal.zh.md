# 插件库没收下的那个上架插件，原因留在它自己那一行里，不再只活六秒

- **日期：** 2026-11-06
- **类型：** fix
- **范围：** `web`
- **破坏性：** 否

[English](2026-11-06-plugin-library-add-refusal.md)

插件市场上架包里那唯一一个动作 —— 「装入插件库」—— 就是标题行那个对话框做的 npm 导入，只是
不必自己敲地址。那次取包没落地时（registry 不答复、包下不下来、请求根本没到）什么都没变：插件
仍然哪里都不在，同一行仍在架上、同一个按钮仍在原地，而原因只落进一条通知，六秒后自己消失。此后
那一行读起来与按下之前一模一样，没说为什么。

那句话现在画在它所属的那一行下面（`role="alert"`、危险色、限两行、整句挂悬停），并且落在这一行
的链接之外，点它不会被带到别处；一直留到下次在架上再试或离开这一页。行与它那个按钮就是重试的
地方，所以原因必须活过这一次按下 —— 这正是它与通知的区别。名字已被占用不算拒绝，仍归它自己
那个位置：覆盖确认框，由这一行弹出并带着插件名。

## 明细

- `packages/web/src/features/plugins/library-add-refusal.ts`（新）：`libraryAddRefused(error)` ——
  纯判断，念哪句话只在这一处，不依赖页面就能测。插件自己的错误码走 `pluginImportErrorText`
  （它们自己的文案，绝不念线上英文原文），本仓自己抛的值走 `refusalText`（7.19 的规则）。
- `packages/web/src/features/plugins/plugins-page.tsx`：页面多一个 `libraryRefusal`（specifier +
  句子）。`addPublishedToLibrary()` 不再把失败交给通知：开始一次尝试时清掉句子，失败时写上；上架
  行经 `ModuleRow` 新增的 `refusal` 槽读到它。那一行从单行 flex 改成列 —— 原有的那一行加下面的
  句子 —— 于是原因在卡片里，而不是在链接里。
- `packages/web/src/lib/strings{,-en}.ts`：一条新文案 `plugins.libraryAddRefused(reason)`。

## 测试

- `packages/web/test/library-add-refusal.test.ts`（新，5 条）：插件自己的错误码念它自己的本地化
  句子、不带线上英文原文；插件路由不拥有的码退回共享的表；本仓自己抛的值按原话念；无话可说时
  退回通用句；用的是当前语言。
- `packages/web/e2e/plugin-library-add-refusal.spec.mjs`（新，真服务端 + 真浏览器，2 条）：把取包
  桩成 502，按架上自己的那个按钮 —— 句子出现在那一行里、通知区里没有它、行与可用的重试按钮都还
  在、**七秒后**（超过错误通知活着的 6 秒）它仍在，下一次尝试把它清掉。第二条：409
  `plugin_exists` 仍弹出覆盖确认（带着插件名）且不画拒绝句；答复它会把同一个请求带上
  `overwrite: true` 重发。

## 兼容性

不碰接口、不引入新依赖、不改 Project 配置。成功路径、覆盖确认、以及标题行对话框自己的导入都没动。
