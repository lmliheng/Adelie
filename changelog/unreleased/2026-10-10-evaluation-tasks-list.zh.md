# 「评估任务」折叠夹只收 Agent 启动的被测会话

- **Date:** 2026-10-10
- **Type:** fix
- **Scope:** `web`, `docs`

[English](2026-10-10-evaluation-tasks-list.md)

在评估中心点击**使用**、从**评估**或**优化**标签页打开的对话是普通对话：它归入执行这项工作的 Agent 自己的对话列表，不再归入会话列表的**评估任务**折叠夹。这个折叠夹只收 Agent 经 `penguin run --source benchmark` 自己启动的被测会话 —— `agent-evaluation` 就是这样启动每道题目、每次运行的。

本条移植自上游 PenguinHarness（#969，提交 `8a774995`）。

## 细节

- **使用**对话框不再给预填的对话打标记，新建对话草稿创建 Session 时也不再以 `source` 发送这个标记。早先版本保存的、带这个标记的草稿同样创建为普通 Session —— 逐字段解析器会像丢弃其他未知字段一样把它丢掉。
- 本次改动之前创建的这类对话，Trace 里仍记着 `source: "benchmark"`，继续留在**评估任务**折叠夹：Trace 只追加，归类规则（`!archived && source === "benchmark"`）也没变。不做任何迁移。
- 服务端与 CLI 的行为与之前一致：`POST …/sessions` 仍接受 `source: "benchmark"`，`penguin run --source benchmark` 为每个被测会话发送它。只有 `SessionCreateRequest.source` 与 `CreateSessionOptions.source` 的文档注释改了。
- 评估中心、对话与服务端 API 文档（中英各一份）随之更新。
