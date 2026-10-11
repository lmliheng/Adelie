# A Session's follow-up queue holds at most 16 entries

- **Date:** 2026-10-11
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-11-follow-up-queue-cap.zh.md)

Ported from upstream PenguinHarness (#853, commit `092a595c`).

`POST /api/sessions/:sessionId/tasks` with `queueIfBusy` now refuses the seventeenth queued follow-up with `429 queue_full` instead of enqueuing without bound; the cap is `FOLLOW_UP_QUEUE_LIMIT` (16) per Session. The paths that always ask to queue — an organization's channel mention, or a calendar dispatch to a busy desk — record the refusal as `org_dispatch_failed` and move on (a periodic calendar event fires again at its next slot), so a mention storm or an @all fan-out no longer grows a desk's queue without limit and replays every entry as a model call. The `409 task_in_progress` answer without `queueIfBusy` is unchanged, and draining one entry frees one slot.

One difference from upstream's entry: this fork has not ported #852 yet, so a **one-shot** calendar event whose dispatch is refused still consumes its slot rather than retrying — see `docs/FORK-PROGRESS.md`.
