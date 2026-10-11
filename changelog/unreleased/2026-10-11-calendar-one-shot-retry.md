# A one-shot calendar event whose dispatch failed fires again on the next pass

- **Date:** 2026-10-11
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-11-calendar-one-shot-retry.zh.md)

Ported from upstream PenguinHarness (#852, commit `adfa2a19`).

When a one-shot calendar event's dispatch came back skipped — no desk could be opened, or the Task could not be queued — its consumed slot is now released, so the next reconcile pass fires the event again and carries the desk notices that were re-queued with it. Before, the slot stayed consumed and the employee's ticket changes sat in the queue indefinitely, with a single dispatch error on record. The run never started in that case, so the retry cannot fire the event twice; a failure that persists shows as an `error` outcome on every pass. Periodic events are unchanged (their next slot fires regardless), and a one-shot skipped because its employee was budget-paused is still consumed without backfill. `OrgCacheRepo.markCalendarSlot` accepts `null`.
