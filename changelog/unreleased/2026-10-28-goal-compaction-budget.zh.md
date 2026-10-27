# 目标模式预算计入轮中压缩之前的用量

- **Date:** 2026-10-28
- **Type:** fix
- **Scope:** `plugins`
- **Breaking:** no

[English](2026-10-28-goal-compaction-budget.md)

移植自 PenguinHarness `eb3edfec`（`#1355`）。

目标模式的 stop hook 只从最新的那个 Trace 文件里加总一轮的 token 用量。如果一轮进行到一半时上下文压缩把日志
换成了新的一份，这一轮已经花掉的部分就留在旧文件里了：一轮对着 100 的预算用掉 110 个未命中缓存的 token，
会被记成 20 并继续保持 `active`，于是收尾那一轮根本不开始、目标越过给定的预算继续跑。

现在 hook 在计数之前会沿该 Session 之前的 Trace 分片回溯到本轮自己那条注入输入。已完成的轮次不会被重复计入 ——
统计窗口仍然从最后一条轮次输入之后开始，只是不再从「这一片的开头」开始。分片缺失、读不出、或属于另一个 Session
时，回溯就此停下、保留已经能读到的那部分用量：数不全，也好过把另一轮会话的 token 算进来。

## 细节

- `plugins/goal/hooks/lib.mjs`：新增 `readRoundRecords(file, sessionId, records)`。它从 Trace 文件名
  （`<sessionId>_<NNN>.jsonl`）解析出分片序号，然后一片一片往回走 —— 序号按写入方的三位补零回填 ——
  直到某一片里出现轮次输入，或者走到 `_001`。每一片的前驱都必须在自己的 `session_meta` 里报着同一个
  `session_id`，否则停下。收集到的分片展平后交给未改动的 `lastRoundRecords()`，「从最后一条轮次输入之后开始」
  这条规则因此仍然只写在一个地方。hook 认不出的 Trace 文件名退回单文件计数。
- `plugins/goal/hooks/stop.mjs`：改用 `readRoundRecords(tracePath, sessionId, records)`。
- `plugins/goal/plugin.json`：版本 `2026.09.29.1` → `2026.10.28.1`，已装过该插件的 Agent 因此会刷新钩子。
  上游改的是 `package.json` 里的 `hooks.version`；本仓把插件版本放在 `plugin.json`、没有那个块，所以版本号落在那里。
- `packages/core/test/goal-hooks.test.ts`：夹具的写入函数多一个目标文件参数；原来那条「压缩把轮次输入转走时
  数整个文件」变成四个文件名的表驱动用例（当前分片、旧式名字、另一个 Session 的分片、超出安全整数范围的序号），
  断言同一条回退；另加三条 —— 预算摊在三个分片上的那一轮先以 `tokens_used: 110` 进入收尾、再以 `115` 停下；
  输入落在前一片里的后一轮只数那条输入之后的用量；前驱分片缺失或属于别人时只保留当前那一片的 20 个 token。

## 兼容性

- 落盘格式一个没变：Trace 与 `GOAL.json` 的格式、预算语义、最后那一轮收尾都照旧。变的只有「一轮被记多少用量」——
  跨了压缩的那一轮，记下的现在是真实发生过的量。
