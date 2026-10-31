# A scheduled task's enable switch keeps a refusal's reason under its row, not only in a toast

- **Date:** 2026-10-31
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-31-schedule-toggle-refusal.zh.md)

The enable switch on a scheduled task's row writes nothing optimistically either: it moves only
once the write lands, so a refused flip leaves the switch where it was and the list unchanged —
the attempt looks like nothing happened at all, and the only word about why was a toast that
dismissed itself after six seconds. The two surfaces that share that row (the scheduled-tasks page
and the chat dock's scheduled-tasks panel) now keep the server's sentence under the row the flip
named, until the next flip.

## Details

- `packages/web/src/features/schedules/schedule-toggle.ts` (new): `ScheduleToggleRefusal` plus
  `scheduleRefusalFor()` — the one place that decides which row draws the sentence. A task is
  named by the Agent whose directory holds the file plus the file name, so two Agents may hold
  tasks of the same name and only the refused one may show it.
- `packages/web/src/features/schedules/schedule-row.tsx`: a `refusal` prop draws one danger-ink
  `role="alert"` line under the name and its schedule line (two lines at most, the whole sentence
  on hover), reusing the shared lead-in `S.common.refused` so it reads like every other refused
  write in the app; no new copy.
- `packages/web/src/features/schedules/schedules-page.tsx`, `schedule-panel.tsx`: each keeps its
  own `toggleRefusal` state (both hosts already keep their own copy of the delete confirmation's
  refusal; the rows themselves are shared), cleared before a flip and filled from the failure via
  `apiErrorText` (so the words are the server's, or the app's sentence for that code) instead of
  `toastError`.

## Tests

- `packages/web/test/schedule-toggle.test.ts` (new, 4 cases): silent with no refusal, the named
  row gets the sentence, another task of the same Agent does not inherit it, and neither does
  another Agent's task of the same name.
- `packages/web/e2e/schedule-toggle-refusal.spec.mjs` (new, three cases against the real server):
  a refused flip leaves the reason on that row (and not on its neighbour), writes nothing (no
  toast in the notification region, the switch stays armed, the task stays enabled on the server)
  and the line is still there after the six seconds a toast lives; with the refusal lifted the
  next flip lands, the line goes and the switch follows; the dock's panel behaves the same.

## Compatibility

- No API, on-disk or request-shape change. A successful flip behaves exactly as before; only the
  failure path stopped using a toast.
- The Agent settings tab lists tasks in a table with text buttons rather than the shared row, so
  it is untouched this round — see the ledger.
