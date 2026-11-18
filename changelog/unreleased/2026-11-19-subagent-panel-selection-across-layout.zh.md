# 换布局不再把子 Agent 面板切回它自己挑的那一段对话

- **Date:** 2026-11-19
- **Type:** fix
- **Scope:** `web`

[English](2026-11-19-subagent-panel-selection-across-layout.md)

智能体面板是一块停靠面板：窗口跨过断点（宽窗口的右侧栏 ↔ 窄屏的合并面）时，这块面板从一处挂载点挪到
另一处，React 卸载原来那份、挂载新的一份，面板自己记着「现在显示哪一段对话」的那个状态也就跟着没了。
第二百六十八、二百六十九轮把子 Agent 输入框里的字、写在框上方的几句原因和暂存的引用 chip 都记在了组件
之外；**「你在看哪一个」这一项不在其中**，于是换布局之后面板退回自动选中的第一个子 Agent —— 你明明刚从
上面的调用图里点到另一个子 Agent、或者点到主会话，屏幕上却换成了另一段对话。

现在这一项也留住了：调用图里的每一次点选都同时写进一份按**父会话**记的模块级记录（一个会话 id 加它
`ctx.origin` 那条链，短字符串而已），下一次挂载先读它；记录里的那段对话若已经不在当前显示的这个 Task 的
调用图里（比如某个 chip 把范围钉到了别的 Task、或者流重新同步成了新的模型视图），就照旧退回自动选中，
不会拉起一段什么也渲染不出来的对话。

顺带补上了同一条路上的另一处重放：面板上那块「某个 chip 让我聚焦这个子 Agent」的跳转命令是页面持着的
一次性指令，之前每次重新挂载都会重新执行一遍 —— 于是你刚才在调用图里点的那一下，会被这条旧指令盖回去。
现在同一条指令只执行一次（按页面给它的那个对象本身记账，点同一个 chip 每次都是新对象，所以重按照常生效）。

## 细节

- `packages/web/src/features/chat/subagent-panel-selection.ts`（新）：`restoreSubagentSelection`（纯函数，
  只在这段对话仍在这个 Task 的调用图里时返回它，`origin` 链取**今天那个节点**而不是记录）、
  `readSubagentSelection` / `writeSubagentSelection`（按父会话，什么都没选时删掉条目）。
- `packages/web/src/features/chat/subagents-view.tsx`：`selected` 的所有写入走同一个 `pick()`（写屏幕也写
  记录，一次性写，不等 effect）；渲染时 `selected ?? 记录里那一项 ?? 自动选中的第一个子 Agent`；
  `focusRequest` 的那条 effect 加一份 `WeakSet` 的「已经执行过」，重新挂载不再重放。
- 文档 `chat.zh.md` / `chat.en.md` 讲子 Agent 的那一条各补一句。

## 测试

- `packages/web/test/subagent-panel-selection.test.ts`（新，6 条）：按父会话隔离、主会话（空 `origin`）也是
  一次点选、清空时删条目、只在节点还在时恢复、`origin` 取自调用图而不是记录。
- `packages/web/e2e/subagent-panel-selection-across-layout.spec.mjs`（新，2 条，真服务端 + 仓库自带 mock
  模型 + 系统 chromium）：在调用图里点主会话节点，1280 → 390 → 回 1280 三刻都还是那个节点被选中、
  「主会话请在对话区查看」都在；再把子 Agent 点回来，换布局后新的挂载显示的是它（记录跟着最后一次点选）。
- 反证：同一份 spec 跑改前源码与改前产物 → 第一条 **1 failed**（390 上退回子 Agent，`pressed` 变
  `[false, true]`、「主会话请在对话区查看」消失）；放回改后源码重建，产物与留底逐字节相同（`diff -rq`）。

## 兼容

只有前端状态：不改接口、不改传输格式、不写存储。记录随标签页消失（刷新后回到自动选中，与改动前一致）。
