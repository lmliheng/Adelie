# 换布局不再重放文件面板与记忆面板的那两条命令

- **Date:** 2026-11-19
- **Type:** fix
- **Scope:** `web`

[English](2026-11-19-dock-commands-across-layout.md)

聊天页交给停靠面板的每一条命令都是「按一下」，不是一份状态：每次点击一个新对象（「在树里定位这个文件」
「打开这条记忆」「聚焦这个子会话」），由页面一直拿着，直到下一次点击、换会话或者这个面板的标签被关掉。
可响应它们的面板体，会在布局把面板在宽窗口的侧栏与窄屏的合并面之间挪动时被重新挂载 —— 原先记在面板体
里的那份「已经执行过」跟着旧挂载一起没了，而命令还在页面上，于是新的挂载又执行了一遍：文件面板把读者
已经关掉、已经离开的那个文件又打开；记忆面板把读者已经退出来的那条记忆（或那份列表）又拽回去。

这份账现在记在模块作用域（`dock-command-once.ts`），活得比重新挂载长、仍随标签页消失。同一族的第三条
命令（子会话面板「你在看哪一段对话」，上一轮刚修）也改用这份记录，不再自己留一个 `WeakSet`，三条命令
从此只有一种记法。

## 细节

- `packages/web/src/features/chat/dock-command-once.ts`（新）：`claimOnce(command)` —— 同一个命令对象第一次
  返回 true、之后返回 false；页面每次点击都造新对象，所以再点同一个文件仍是一条新命令。
- `packages/web/src/features/chat/workspace-browser.tsx`：`openRequest` 的 effect 仍是「一条命令只执行一次」，
  但改在模块作用域认领，不再是组件实例的 ref。
- `packages/web/src/features/chat/memory-view.tsx`：`request` 的 effect 改成认领一次（它此前每次挂载都重新
  应用，正是把读者拽回去的那一处）。
- `packages/web/src/features/chat/subagents-view.tsx`：点选那份 `WeakSet` 换成共用的认领。

## 测试

- `packages/web/test/dock-command-once.test.ts`（新，4 条）：一个对象无论几次挂载只执行一次、每次点击各自
  成一条、三种命令形状都能认领、刷新从头开始。
- `packages/web/e2e/dock-command-across-layout.spec.mjs`（新，2 条，真服务端 + 仓库自带 mock 模型 + 系统
  chromium）：① 文件面板从回复里的卡片打开 `demo.html`，读者随后在树里打开 `note.txt`，1280 → 390 → 回来
  三刻都不该再冒出 `demo.html` 的旧预览；② 记忆面板从 Task 汇总卡片落到一条记忆上，读者按「返回列表」，
  换布局之后仍停在列表，不会跳回那条记忆。那条记忆由 mock 新增的一条分支（`memory write test <绝对路径>`）
  走普通文件工具真写出来，所以卡片是真的。
- 反证：同一份 spec 跑改前源码与改前产物 → 两条都在 390 上 **失败**（文件：旧的 `demo.html` iframe 又出现；
  记忆：又回到那条已经退出来的记忆里）；放回改后源码重建，产物与留底逐字节相同（`diff -rq`）。
- 相邻回归复跑全绿：`subagent-panel-selection-across-layout.spec.mjs`（2 条）与 `files-switch.spec.mjs`（1 条）。

## 兼容

只有前端状态：不改接口、不改传输格式、不写存储。记录随标签页消失，刷新后与改动前一样从「没有命令」开始。
