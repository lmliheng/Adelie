# 侧边栏底部多了当前会话的待做清单

- **Date:** 2026-11-15
- **Type:** feature
- **Scope:** `server`, `web`, `ui`, `core`, `docs`

[English](2026-11-15-session-todos.md)

侧边栏底部、用户行上面多了一个**待做**块，记当前这个会话还剩什么没做。行头是「还剩几条 / 一共几条」，行尾的箭头收起或展开；勾选表示做完，可以删除，也可以在底部的输入框回车新增。换一个会话看到的就是那一份，清单只跟着当前会话走。

这份清单不只是浏览器里的状态，而是这个会话 scratchpad 里的 `TODO.json`（和目标插件的 `GOAL.json` 同一套路）。界面和 Agent 读写的是同一个文件：你在这里加的，Agent 下一轮就能看到；Agent 做事时补上的，那个回合结束就出现在这里 —— 它做的每件事都是同一份清单上的一条。默认提示词里也加了一条，让 Agent 手上有好几件事时把它们记在这儿。

写盘失败不会装作成功：那一次改动当场撤回并在原位说明，点**重试**再发一次；读不出清单时说的是另一句话。

## 细节

- `packages/server/src/services/session-todos.ts`、`packages/server/src/http/routes/sessions.ts`：新路由 `GET/PUT /api/sessions/:sessionId/todos`。文件不存在（或读不出）时 `GET` 给空清单而不是 404 —— 每个会话都有这份清单，多数只是没写过。`PUT` 收整份清单、写完把真正落盘的那份返回。上限 200 条、单条 500 字；超出，或者哪一项不是 `{text, done}`，一律 400 并说出是第几条，且一个字节都不动原文件。Agent 手写坏的文件读取时容错：形状不对的项丢掉、过长的文本截断，不让一次读取把整块拖垮。
- `packages/web/src/features/account/session-todos.tsx`：四个纯函数（增、勾、删、数还剩几条）加一个 `useSessionTodos`。勾选是乐观更新，失败回滚到上一次服务端确认过的内容；清单在切换会话时、以及这个会话的回合跑完时重新读一次（那时 Agent 的改动都落了盘），空闲会话不另开定时器。
- `packages/ui/src/components/shell/sidebar-frame/sidebar-frame.tsx`：`SidebarFrame` 多了一个可选 `foot`，画在账户那块之前；不传就不画，连带那条分隔线也没有 —— 新建对话的草稿态就是这样，草稿还没有能记清单的会话。
- `packages/core/src/state/default-config.ts`：默认提示词的 # Suggested workflows 加了一条，让 Agent 把还没做完的事记在同一个 scratchpad 的 `TODO.json` 里。默认配置变了，内核版本随之从 `2026-10-05` 提到 `2026-11-15`（旧的提示词哈希进了上一代名单）。
- 中英文案在 `packages/web/src/lib/strings.ts` / `strings-en.ts` 的 `account.todos` 段；README 式的说明写进 `packages/docs/content/web-app.zh.md` / `web-app.en.md` 的侧边栏一节，`server-api.zh.md` / `server-api.en.md` 的两条新路由。

## 测试

- `packages/server/test/session-todos.test.ts`（11 条）：空文件读成空清单、Agent 手写的脏文件、PUT 往返且落盘字节与序列化逐字一致、目录不存在时自动建、六种非法请求体都 400 且文件不变、未知会话 404。
- `packages/web/test/session-todos.test.ts`（4 条）：四个纯函数的取舍。
- `packages/core/test/kernel-version.test.ts`：默认提示词变更后的钉住哈希守卫（改提示词必须提到 `2026-11-15`，正是上面那条）。

## 兼容性

纯增量：新路由、新区块、新文案，没有新依赖、没有数据库变更、没有 Project 配置变更。已有会话没有 `TODO.json`，第一次打开就是空清单。服务端不认识这两个路由时（比如只换了前端），这一块读出失败并就地说明，不影响侧边栏其它部分，其余功能照旧。
