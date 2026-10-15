# 打开历史对话不再等待侧栏

- **Date:** 2026-10-15
- **Type:** fix
- **Scope:** `server`, `web`

[English](2026-10-15-faster-session-open.md)

移植自上游 PenguinHarness（#984，提交 `74efa5aa`）。

打开对话此前排在侧栏的 Session 列表后面：对话页要等那个列表加载完成才去查证路由指向的 Session，而该列表
按「每个 Agent 每页一次」向每台服务器各发一次请求 —— 浏览器会把这些请求串行化，于是对话自己要读的东西
就排在它们后面。

## 对话不再等待侧栏

- 对话页对路由指向的 Session 的直接查证，不再等待列表加载完成（`features/chat/chat-page.tsx`、
  `features/chat/route-probe.ts`）。
- 列表仍在加载时查证失败，不构成任何判定：刚创建的 Session 可能还没进列表、也还不作答。路由保持待定，
  列表落定后再查证一次。页面读的是查证**落定那一刻**列表是否仍在加载，而不是发出请求时 —— 因此在首次加载
  期间发出、加载完成后才失败的查证，仍然照旧重定向。
- 同一个 Session 同时只有一个查证在途。它不再随列表每次变动被取消并重新发起（那会让一次深链发出十来个
  相同的请求）；路由已经离开的 Session 的查证结果被丢弃。
- 查证通常在列表首次加载之前就有答案，此时对话立刻显示取回的那一行；该行要等列表落定后才并入侧栏列表，
  且只在列表自己没带回来时才并（首页之外的行，或组织自己的行）。

## 侧栏的列表请求改为每台服务器一次

- 新增 `POST /api/projects/:projectId/sessions/batch`，一次请求最多携带 256 个条目，每个条目请求一个
  Agent 的一页。条目接受与 `GET /api/projects/:projectId/agents/:agentId/sessions` 相同的参数
  （`limit`、`order`、`offset` 或活动序的 `before` 游标、`category`、`workspaceGroup`、`withCounts`、
  `excludeOrg`），并按相同规则校验；任一条目不合法，整个请求返回 400。
- `results` 按请求顺序作答。服务器上不存在的 Agent 回 `ok: false, reason: "absent"`，这是一个真实答案；
  其余失败回 `reason: "error"`，侧栏绝不会把它读成「没有对话」。
- `reload()` 与 `loadMoreFor()` 每个来源（本服务器与每台已连接机器）只发一次请求，按工作区分组时各分组的
  分页请求因此也合为每台服务器一次。

历史读取（`GET /api/sessions/:id/messages`）未改：它在服务端本来就是有界的，一页窗口上限 4 MiB，图片按
引用下发。
