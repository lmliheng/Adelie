# 换布局不再丢掉子 Agent 输入框上方暂存的引用

- **Date:** 2026-11-19
- **Type:** fix
- **Scope:** `web`

[English](2026-11-19-subagent-reference-chips-across-layout.md)

智能体面板是一块停靠面板：窗口跨过断点（宽窗口的右侧栏 ↔ 窄屏的合并面）时，它从一侧的挂载点挪到另一侧，原来
那份被卸载、新起一份。第二百六十八轮给这块面板里没发出的字与那几句原因找了记录，让它们跨得过去；**暂存的引用
chip** 不在其中 —— 在子 Agent 自己的对话里选中一段、点**添加到对话**，输入框上方就多一枚摘录 chip，跨一次断点
它就不见了，再跨回来也不回来，而它自始至终还没发出去。

现在这些 chip 同样留得住：它们是读者自己的暂存、什么都没发出去，换一次布局不该把它们撤下。它们也是这处唯一
**有意不写进**会话草稿缓存的东西（见 `chat-input.tsx` 里 `references` 那一段）：十分钟前引用的文件可能已经
变了，从存储里恢复上来的 chip 会声称一段文件里早已不存在的原文 —— 所以它们只活在按标签页记的这份记录里，
随标签页一起消失。

## 细节

- `packages/web/src/features/chat/subagent-composer-keep.ts`：记录多一格 `references`
  （`ComposerReference[]`），写进「这块面板不能忘的事」那一段，并写明为什么草稿缓存不参与；列表为空算作「没话要说」，
  所以没暂存过 chip 的子会话不会留下空条目。
- `packages/web/src/features/chat/subagents-view.tsx`：子会话输入框把记录里的 chip 当 `initialReferences` 交回去，
  每次变化都走文字用的那个 `remember()`。
- `packages/web/src/features/chat/chat-input.tsx`：新增 `initialReferences` / `onReferencesChange`；暂存、chip 的
  ×、发送成功后的清空都走同一个 `stageReferences` 并且都会回调，好让已发出的引用不会留在调用方的记录里、下次
  挂载又冒出来。草稿页两个都不传，行为与改前一致。

## 测试

- `packages/web/test/subagent-composer-keep.test.ts`：新增三条 —— chip 单独也留得住、顺序原样保留（消息按这个
  顺序带走它们）、最后一枚被拿走时整条记录丢掉。
- `packages/web/e2e/subagent-composer-across-layout.spec.mjs`：新增一条，用面板自己的选区菜单在子会话框上暂存
  一段摘录，然后 1280 → 390 → 1280 走一遍，两侧各读一次 chip 与它的 ×；整页只有这一枚 chip（主输入卡没有收下
  这次暂存），拿 × 撤下之后下一次换布局也不会回来。
- **反证（同一份 spec，改前源码 + 改前产物）**：1 failed —— 390 那一刻 chip 已经没了。探针两态读数一致：改后
  三个时刻都在、都在输入框上方、`overflowX` false；改前 390 与跨回 1280 都是 0。

## 兼容性

只动前端状态：接口、线上格式与已存数据都没变。chip 不写 localStorage，因此刷新不会恢复它们（与改前一致）。
