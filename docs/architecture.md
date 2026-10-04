# 架构

Adelie 只有一条主线：**引擎干活，外壳呈现，接口是唯一的接缝**。

```
        ┌──────────────────────── 四种形态 ────────────────────────┐
        │  adelie (CLI)   adelie-desktop   adelie-web (PWA)          │
        │      │                │(fork)          │ SSE             │
        └──────┼────────────────┼────────────────┼──────────────────┘
               │                ▼                ▼
               │         adelie-server ──────────┘   HTTP + SSE（docs/api.md）
               ▼                ▼
        ┌──────────────────────────────────────────────────────────┐
        │  adelie-runtime    ReAct 循环、计划、审批、验收、预算      │
        │  adelie-tools      文件 / Git / 命令 / 搜索 / MCP          │
        │  adelie-providers  DeepSeek / OpenAI 兼容端点              │
        │  adelie-core       类型、事件流、会话持久化、上下文折叠      │
        └──────────────────────────────────────────────────────────┘
```

## 为什么这样切

**引擎不依赖任何外壳，外壳不实现任何业务。** CLI 与服务器是用同一种方式驱动运行时的两个调用方：
构造 `AgentRuntime`（注入 `onSessionEvent` / `onStreamDelta` / `requestApproval`），调 `run(task)`，
把事件写到终端或推成 SSE。审批、预算、验收、工具集这些语义只在引擎里存在一处。

**桌面壳是壳，不是第二个前端。** 它挑一个空闲端口、fork 服务端、开窗口加载
`http://127.0.0.1:<port>` —— 页面与浏览器里那份完全一样。代价是壳无法做「深度集成」，
好处是四端只有一个前端要维护。

**会话事件流是唯一事实源。** 运行时把每次状态迁移写成事件（`task_started` / `decision` /
`observation` / `plan_updated` / `approval` / `context_folded` / `stopped` / `verification`），
落盘成 JSONL，界面与「接着聊」都由它回放重建。模型增量（`delta`）**不进**事件流：
它可能半截，进了就会让一份中间产物混进事实源。

## 数据放在哪

| 东西 | 位置 |
| --- | --- |
| 用户级配置（API Key） | `~/.adelie/.env` |
| 会话事件（JSONL，按工作区索引） | `~/.adelie/sessions/`，`ADELIE_SESSIONS_ROOT` 可覆盖 |
| 桌面壳的数据与 `server.log` | 系统 userData 目录下的 `Adelie/`（源码运行是 `Adelie (dev)`） |
| 工作区指令 | 工作区根的 `ADELIE.md` / `AGENTS.md` / `CLAUDE.md` |

## 安全边界

- 工具只能在工作区内动文件：所有文件工具过 `fs-guard`（resolve + realpath + relative 判定，拒 `..` 逃逸与符号链接）。
- 需要审批的动作（写文件、跑命令、网络请求）默认**拒绝**；有交互层时由人拍板，决定写进事件流。
- 服务端默认只绑回环；绑非回环或显式设了 `ADELIE_TOKEN` 时，`/api/*` 必须带凭证。
- 桌面壳只绑回环，且不注入 Node 到页面（`nodeIntegration: false`、`sandbox: true`）。

## 与 PenguinHarness 的关系

外壳的分工与工程做法取自 PenguinHarness：桌面壳 fork 服务端、页面走同源 HTTP/SSE、没有私有 IPC；
视觉沿用同一套语言（发丝边框、单一蓝色强调、深色模式纯黑、系统字体）。引擎是 Adelie 自己的，
不依赖 `@prismshadow/*` 的任何包 —— 两个产品各自演进，互不牵扯版本。
