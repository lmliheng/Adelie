# 记忆组没有导出成时，原因留在那一组里

- **日期:** 2026-11-11
- **类型:** 修复
- **范围:** `web`（`ui` 的折叠段多一个槽）
- **破坏性变更:** 否

[English](2026-11-11-memory-export-refusal.md)

记忆页每一组的标题条上都有「导出」：拉一次那组记忆的传输文档，再用一个临时的对象地址交给浏览器。服务端拒了这次
下载时，那一组还在、组里每一条记忆都还在、连按下去的那颗按钮都还在原地，可唯一解释原因的那句话是一条六秒后
自己消失的通知 —— 它浮在列表上方，而读者的视线落在下面某一组上。

这正是 7.19 禁止的形状，也是技能页（7.101）、钩子页（7.103）与插件卡片（7.107）各自已经改过一次的同一件事，只剩
记忆页这一处还在弹通知。原因现在画在发问的那一组里（`role="alert"`、危险色、最多两行、整句挂悬停），留到下一次
尝试开始为止；再按一次那颗「导出」就是重试。句子说「导出只是读取，记忆一条都没有被改动」—— 导出确实只读，而
这正是读者会怀疑「是不是动到文件了」的那一刻。

这一处的宿主有个别处没有的麻烦：导出按钮在**折叠段**的标题条上，而正文是会被折起来的。所以折叠段（`ui` 的
`CollapsibleSection`）多了一个 `notice` 槽：它画在标题条与正文之间、卡片之内、折起来的那部分之外 —— 组是折着的
时候，标题条就是这一组仅有的可见部分，句子必须跟着它留下。

## 细节

- `packages/ui/src/components/layout/collapsible-section/collapsible-section.tsx`：新增 `notice` 槽（head 之后、
  fold 之前，`border-line-muted` 分隔）。不传就是空的，既有用法一个字节没变。
- 新增 `packages/web/src/features/agents/memory-export-refusal.ts`：`memoryExportRefused(scope, error)` 造句
  （原因走 `refusalText`，与全应用每一个拒绝同一个规则）；`memoryExportRefusalFor(refusal, scopeKey)` 决定这句
  归哪一组 —— 按**键**认领而不是标题，两个工作区的目录可能叫同一个名字，而键才是这次尝试真正发问的那一组。
- `packages/web/src/features/agents/memory-tab.tsx`：`exportScope` 失败不再 `toastError`，记进 `exportRefusal`
  交给那一组的 `notice`；每次尝试开始先清上一句。`scopeTitle` 从组件内提到模块级：拒绝句要在失败的那一刻造句，
  而那条路径可能在组件提前返回之后。
- `packages/web/src/lib/strings{,-en}.ts`：新增一句 `memory.exportRefused(scope, reason)`。

## 测试

- `packages/ui/test/collapsible-section.test.ts`：`notice` 在 head 之后、body 之前（折着也在），不传就根本没有
  这一段。
- `packages/web/test/memory-export-refusal.test.ts`（新增，9 条）：服务端的原因按错误码念（绝不念线上原文）、
  界面自己抛出的句子原样保留、什么都没说时落到通用文案、念出组名、点明导出只是读取没有改动记忆、英文那一句、
  以及「只归发问的那一组、按键而不是按标题」三条。
- `packages/web/e2e/memory-export-refusal.spec.mjs`（新增，2 条，真服务端 + 真浏览器）：被拒时句子只在那一组里、
  逐字、通知区 0 条、七秒后仍在、折起来之后仍然可见；放行后按同一颗按钮，句子消失、浏览器真拿到那份文档，服务端
  那份记忆与开始时逐项相同。

## 兼容性

线上接口没变、没有新依赖、Project 配置没变。折叠段的既有用法（模型库、插件库、画廊）原样不变；记忆页其它动作
—— 查看 / 编辑 / 添加走对话、删除与导入的确认框及其拒绝行、提示词的两段与占位符 —— 一个字节没动。
