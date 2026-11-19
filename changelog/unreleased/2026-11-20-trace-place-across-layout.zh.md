# 换布局不再把轨迹面板拽回最新那一轮（读者开着哪几轮、滚到哪一行）

- **Date:** 2026-11-20
- **Type:** fix
- **Scope:** `web`

[English](2026-11-20-trace-place-across-layout.md)

轨迹面板是一块停靠面板：窗口跨过断点（宽窗口的右侧栏 ↔ 窄屏的合并面）时，它从一侧的挂载点挪到另一侧，
原来那份被卸载、新起一份。文件面板与记忆面板已经能把各自的位置带过去，轨迹面板不能：读者把文件最新那一轮
合上、把第一轮打开，再往下滚一段，跨过去就是最新那一轮又开着、第一轮合着、面板回到它自己打开的起点。
真浏览器里量过：`[true,false,false]` 在 320 px → 390 上变成 `[false,false,true]` 在 846 px，跨回宽屏
仍是 `[false,false,true]` 在 488 px。

现在这块面板的位置也跟着走，规则与另外两块一样：**只有换布局才交回**。关掉标签页再开、切到别的会话再回来，
仍旧从文件最新那一轮开始。

## 细节

- `packages/web/src/features/traces/trace-place.ts`（新）：按会话记一处位置 —— 离开时的停靠面、读者开着的
  轮次（taskIndex）、面板的偏移。规则与 `memory-place.ts` / `workspace-view-memory.ts` 相同：只在落到**另一个**
  停靠面时才交回；「一轮没开、也在顶上」的位置整条丢掉；记录进出各拷一份。新挂载上来先写一次记录、盖上它
  现在所在的面 —— 这一笔是让反方向那次跨界能找到位置的唯一原因。
- `packages/web/src/features/traces/trace-panel.tsx`：记录在挂载时给出初值；滚动盒在 `scroll` 里直接读自己的
  偏移、直接写进记录（不走 React 状态）；偏移等文件视图报「这处位置要的东西都画出来了」之后才设。
- `packages/web/src/features/traces/trace-file-view.tsx`：`fileAtArrival()` 用读者的轮次作初值、不请求滚动到
  任何一轮；`fileAfterAnalysis()` 保留这些轮次（不按最新那一轮重新决定），且不设 `reveal` —— 回到哪里由位置
  自己的偏移说了算。视图把当前开着的轮次报上去（面板存进记录），并在「分析到了、窗口里开着的每一轮事件也到
  了」时报一次就位。
- `packages/web/src/features/chat/builtin-dock-panels.tsx`：轨迹标签页的体从 `useDockPanel()` 取所在表面
  （`merged ? "merged" : position`），与文件、记忆两块同一写法。

## 测试

- `packages/web/test/trace-place.test.ts`（新，6 条）：只交给另一个面、不交给同一个面；没留过位置的会话没有
  记录；进出各拷一份；后写的覆盖前一条（连它盖的面一起）；「一轮没开、在顶上」整条丢掉；只滚过 / 只开过一轮
  都算一处位置。
- `packages/web/test/trace-file-view.test.ts`（+2 条）：带着轮次到来的视图保留它们、不滚去最新一轮（开着的是
  第一轮那张卡，不是最后那张）；那次到来之后的刷新仍按老规矩走，且不再滚动。
- `packages/web/e2e/trace-place-across-layout.spec.mjs`（新，3 条）：① 合上最新一轮、打开第一轮，1280 → 390 →
  1280 走一遍，两侧轮次相同；② 面板滚到 320 后往返，两侧都在 320；③ 换布局把位置带回来之后，关掉标签页再开
  —— 面板仍旧从最新那一轮开始。
- **反证（同一份 spec，改前产物）**：2 failed —— ① 轮次回来是 `[false,false,true]`；② 320 变成 715。第三条改前
  也绿（它是「关掉标签页仍从头开始」那条护栏）。
- 两态探针（同一脚本，两条腿各发三轮）：改后三刻都是 `[true,false,false]` 与 320 px；改前 390 上是
  `[false,false,true]` / 846 px，跨回宽屏是 `[false,false,true]` / 488 px。

## 兼容性

只动前端状态：接口、线上格式与已存数据都没变。位置只在内存里，刷新后仍从文件最新那一轮开始（与改前一致）。
