# 引擎推进台账

> **第一版：** 2026-10-04
> **谁在读它：** 定时任务 `adelie-buildout` 每 4 小时醒一次，从本台账与 `docs/web-progress.md`
> 里取**一条**做掉（两边轮流，见下）。设计细节在每条指向的文档里，这里只记「做什么、怎么算
> 做完、做完了出现什么」。
> **一轮的固定动作**：与 `docs/web-progress.md` 同 —— 取一篇第一个未勾选的条目 → 实现 → 验证
> （`pnpm -r typecheck && pnpm -r test && pnpm -r build`，界面类另加 `node scripts/audit.mjs --with-e2e`）
> → 勾上并写一行结果 → commit + push（**不切版本、不发产物**）→ 用 `csu-mail` 发一句汇报到
> 0110230306@csu.edu.cn。卡点就停下并在邮件里写清。

## 条目

- [ ] **1. 用真模型验一次「计划文件」的落地** —— 2026-10-04 把运行时的计划状态机删了，改成
  提示词让模型把计划写进 `<会话目录>/PLAN.md`（工作区之外，`AgentRuntimeConfig.scratchpadDir`）。
  单测与端到端（假模型）都过了，但**真模型会不会真的写、写得进去吗**还没验过。
  做法：在 `/root/adelie-workspace` 发**一条小任务**（例如「给 README 加一行安装说明，然后跑一遍
  测试」；要长到值得写计划，但别跑长任务，花了钱记一笔）。用 CLI（key 在 `~/.adelie/.env`）
  或 4000 上的 Web 都行。看四件事：① 会话目录里出现 `PLAN.md`；② 工作区里**没有** PLAN.md；
  ③ 时间线里没有计划卡/验收卡；④ 任务结束时模型有没有把计划更新到最新。结论写回来。
- [ ] **2. 提示词守则与 penguin 逐条对照** —— 用户的要求是「学习 penguin 的模式」。penguin 的默认
  提示词（`/root/penguin-harness/packages/core/src/state/default-config.ts` 的 `# Success criteria` /
  `# Constraints` / `# Stop rules` 几段，只读）里有几条 Adelie 的 `buildSystemPrompt()`
  （`packages/runtime/src/agent.runtime.ts`）还没有：命令一律非交互跑、搜索只从 CWD 往下、
  路径解析不了先缩小范围而不是扩大、名字没见过的先去查、独立调用要在同一轮里一起发出去。
  **一次只搬一条**，搬完写清「搬的是哪条、为什么值得、测试里怎么体现」。不要一次全搬。
- [ ] **3. 跨版本事件的读法再确认** —— 重放会跳过认不得的事件类型，界面渲染成一行
  「未识别的事件类型：X（这份历史来自另一个版本）」（2026-10-04 已改）。还没看的：`session export`
  对这类事件的呈现（现在落到 JSON 兜底分支）、以及 `docs/` 里是否还有段落把已删的
  `plan_updated` / `verification` 当现行机制描述。做法：导出一段含旧事件的会话看一眼，grep 全仓
  文档。**只改真错的地方**，历史存档（`packages/cli/run_test/`、CHANGELOG 里已发布的条目）不动。

> 条目 2 与 3 谁先谁后都行；条目 1 优先 —— 它是这一轮改动的直接验收。

## 已完成的轮次

- **2026-10-04 · 0** —— 建台账。同一天已完成的引擎改动记在 `CHANGELOG.md` 的
  「未发布 — 计划与验收不再由运行时代管（改学 penguin）」里：删掉运行时的计划状态机与验收子系统，
  计划改成模型自己维护的 `PLAN.md`（会话目录里），验收改成「跑项目自己的命令」。
  残留：真模型没验过（条目 1）；提示词只搬了 penguin 的「三次修法」与「自己跑命令验证」两条。
