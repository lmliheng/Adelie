# 每个对话的内置浏览器各用各的：标签、活动标签与 cookie 不再互相串

- **Date:** 2026-11-25
- **Type:** feature
- **Scope:** `server`, `web`, `desktop`, `cli`, `docs`
- **Breaking:** yes — 桌面应用的内置浏览器连接协议升到第 2 版，旧版桌面应用会被提示更新。

[English](2026-11-25-builtin-browser-per-conversation.md)

内置浏览器原来整个应用只有一份：一个标签池、一个全局的「活动标签」指针，网页也都跑在同一个
Chromium 分区里。于是两个对话同时用它就会互相抢 —— 面板在两个对话之间来回跳，甲正在填的页面
在乙点一下、敲一下之后失焦，一个危险操作甚至可能落到乙的页面上。cookie 也是共用的，甲在某个
站点登录过，乙再去就已经是登录态；`penguin browser` 也没有任何「绑定到某个对话」的选项。

现在浏览器按**对话**分开了。每个对话有自己的标签集与自己的活动标签，一个对话里打开、切换、
关闭标签都不会再动到另一个对话的面板，面板也只显示它自己那个对话的标签。每个对话的网页还各跑
在自己的 Chromium 分区里，cookie 与站点存储归它自己，两个对话登录同一个站点是两次独立的登录。
命令行用 `--session <id>` 把命令绑定到某个对话，没写时退回 `ADELIE_SESSION_ID`；缺省作用域
——没有对话、会话之外的命令行——沿用原来的分区，这次改动之前用过的浏览器数据不会被孤立。

## 细节

- `packages/server/src/builtin-browser/partitions.ts`（新）：作用域到分区（缺省作用域是
  `persist:penguin-browser`，某个对话是 `persist:penguin-browser:<sessionId>`），以及壳上报的
  分区反查回作用域。
- `packages/server/src/builtin-browser/service.ts`：一个作用域的标签与活动指针存在它自己的注册表
  里（`Map<scope, TabRegistry>` 加一条 `tabId → scope` 的路由），每个动作都在自己的作用域内解析
  `active`，`builtin_browser_tabs` 按作用域分别下发并带上 `sessionId`。
- `packages/server/src/builtin-browser/routes.ts`：`/status`、`/tabs`、激活、关闭、导入、清除数据
  都从 `?sessionId=` 或请求体读作用域。
- `packages/server/src/api/types.ts` / `shell-link.ts`：壳上报的标签带 `partition`、命令也带，
  连接协议升到第 2 版（`MIN_PROTOCOL_VERSION = 2`）。
- `packages/desktop/src/builtin-browser-rules.ts` / `builtin-browser.ts`：壳接受这个分区族，把每个
  guest 收进它 `<webview>` 指定的分区，并按分区各留一个 `Session`。
- `packages/web/src/features/builtin-browser/`：新增 `scope.ts` 把当前对话解析成作用域；store 按
  作用域分别存标签、活动标签与关闭中的状态；面板、标签条、工具栏与页面层都只读当前对话的作用域；
  每个 `<webview>` 带上它所属对话的分区。
- `packages/cli/src/commands/browser.ts`：每个子命令加 `--session <id>`，优先于
  `ADELIE_SESSION_ID`。
- 文档与 browser-automation 技能的说明改为「按对话隔离」。

## 测试

- `packages/server/test/builtin-browser/`：13 文件 / 181 用例，含 5 条新的按对话隔离用例（各自的
  标签集、各自的活动指针、各自的分区，以及重启后按分区把每个标签还原回它的作用域）。
- `packages/web/test/builtin-browser-state.test.ts`（44 条，含一组按对话隔离）、
  `builtin-browser-scope.test.ts`（2 条）、`builtin-browser-events.test.ts`。
- `packages/cli/test/browser-commands.test.ts`（40 条，含 2 条「命令作用于哪个对话」）、
  `packages/desktop/test/builtin-browser-rules.test.ts`。
- `pnpm -r typecheck`、`pnpm lint`（0 警告 0 错误）、`pnpm -r test` 全部包通过。

## 兼容性

桌面应用与服务端讲的是连接协议第 2 版：壳连上来时先报自己的版本，服务端拒绝低于第 2 版的壳，
所以旧版桌面应用在内置浏览器那一块会看到「当前桌面应用版本过旧，请更新后使用内置浏览器」的提示，
更新应用后即正常。缺省作用域沿用原来的 `persist:penguin-browser` 分区，这次改动之前用过的浏览器
会保留它的 cookie 与登录态；只有对话才会分到自己的分区。
