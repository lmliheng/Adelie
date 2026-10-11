# 一个 Session 的 follow-up 队列最多保留 16 条

- **Date:** 2026-10-11
- **Type:** fix
- **Scope:** `server`

[English](2026-10-11-follow-up-queue-cap.md)

移植自上游 PenguinHarness（#853，提交 `092a595c`）。

带 `queueIfBusy` 的 `POST /api/sessions/:sessionId/tasks` 现在对第 17 条排队的 follow-up 以 `429 queue_full` 拒绝，而不是无上限入队；上限为每个 Session 的 `FOLLOW_UP_QUEUE_LIMIT`（16）。总是要求排队的路径——组织频道的 @提及、日程向繁忙工位的派发——把拒绝记为 `org_dispatch_failed` 后继续（周期日程项在下一个槽位照常触发），因此一场提及风暴或一次 @all 扇出不再让工位队列无限增长、再把每一条都重放成一次模型调用。不带 `queueIfBusy` 时的 `409 task_in_progress` 不变；排出一条即空出一个位置。

与上游那条的一处差别：本仓尚未移植 #852，因此派发被拒的**一次性**日程项仍会消耗它的时间槽、不会重试——见 `docs/FORK-PROGRESS.md`。
