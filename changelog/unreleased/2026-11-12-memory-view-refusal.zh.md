# 没打开的那条记忆，原因留在它自己那一行

- **日期:** 2026-11-12
- **类型:** 修复
- **范围:** `web`、`ui`
- **破坏性变更:** 否

[English](2026-11-12-memory-view-refusal.md)

Agent 设置页的记忆分区把被拒的读取讲在它被问的地方。按下一行记忆的「查看」会取一个文件并打开查看面板；这次读取
失败时面板根本没出现、什么都没写、那一行连按钮都留在原地 —— 而原因只有页面顶部一条六秒后自己消失的通知。人要的
是那条记忆，拿到的是没打开，而屏幕上再没有一句话说这次尝试有没有动过它。

现在那句话画在**那一行里**，就在它说的那条记忆下面、收住这一行的横线之上：
`记忆「<标题>」没有打开，打开只是读取，记忆一条都没有被改动：<原因>`。它留到下一次尝试为止（不论那次尝试是
哪条记忆），那一行的「查看」就是重试。这件事不再另弹通知。

这也收掉了前面几轮一路做下来的那一族：已经有地方可留的拒绝就留在那里，只有**写到位的**写操作（以及根本没有面可留的
读取）仍然发通知。

## 细节

- `packages/web/src/features/agents/memory-file-refusal.ts`（新增）：`memoryViewRefused(title, error)`
  按 `refusalText`（全应用统一的拒绝口径）造句；`memoryFileRefusalFor(refusal, scopeKey, fileName)`
  决定这句话归哪一行。认的是分组的 **key** 与文件的**名字**，不是它们的标题 —— 标题是标签，两条记忆可能同名。
- `packages/web/src/features/agents/memory-tab.tsx`：`openView` 写进这个槽，不再 `toastError`
  （这一页也不再引用它）；`fileRow` 把句子交给行的 `notice`。
- `packages/ui/src/components/data/list-row/list-row.tsx`：`ListRow` 多一个可选的 `notice` —— 一条整行的
  说明，画在行内、行的横线之上，于是原因属于那一行，而旁边的文字列宽度一寸未动。
- `packages/web/src/lib/strings{,-en}.ts`：两种语言各一句。

## 测试

- `packages/web/test/memory-file-refusal.test.ts`：句子走 `refusalText` 而不是线上原话、保留没到路由的失败、
  没话说时回落到通用文案、点名是哪条记忆、说明这次读取什么都没改、跟随当前语言；归属只落在一条行上。
- `packages/ui/test/list-row.test.ts`：`notice` 是行标签的子节点（在它的横线之内）、排在动作之后、没有拒绝时不出现。
- `packages/web/e2e/memory-view-refusal.spec.mjs`：真服务端 + 真浏览器 —— 被拒的读取把句子留在那一行、通知区
  没有东西、面板没开、七秒后两侧都与开始时一模一样；同一颗按钮再按一次面板就打开。第二条用例说明后一次尝试
  （哪怕是另一条记忆）会清掉前一句。

## 兼容性

线上接口没变、没有新依赖、Project 配置没变。其余拒绝的句子、成功的通知、删除 / 导入 / 导出那几处、以及这一页
初次加载失败的错误都一字未改。
