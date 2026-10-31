# A refused 启用 / 停用 on the Agent settings tab says why under that row's status badge

- **Date:** 2026-10-31
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-31-agent-schedule-toggle-refusal.zh.md)

The Agent settings page's Schedule tab lists one Agent's tasks as a table with a text button per
row (启用 / 停用), and that button writes nothing optimistically: it sends the whole file back with
`enabled` flipped, and until the write lands the row keeps the state the server has. So a **refused**
flip used to leave the table exactly as it was — the button did not move, the badge did not move —
with the reason only in a toast that dismissed itself after six seconds: a button that seemed to do
nothing, and no sentence left saying why.

The two surfaces that list tasks with the shared `ScheduleRow` (the scheduled-tasks page and the
chat dock's panel) gained this line for their switch one round ago; this tab is the third list of
the same thing, and it now draws its reason under the row's status badge: the shared lead-in
`S.common.refused`, in the danger ink, as `role="alert"`, clamped to two lines with the whole
sentence on hover. The row it belongs to is picked by the same rule the other two use
(`scheduleRefusalFor`) — a task is named by its Agent's directory plus its file name — and the next
flip clears it, since it is that attempt's answer and not the row's standing state. No new copy was
written.

## Details

- `packages/web/src/features/agents/schedules-tab.tsx`: a `toggleRefusal` state, filled from the
  failed `updateSchedule` (via `apiErrorText`) instead of `toastError`, cleared at the start of the
  next flip; a `ToggleRefusal` block under the status badge, so the sentence sits where the reader
  was looking when the button did not move. The rest of the file is untouched — a successful flip
  still says so with its toast and still reloads the table.

## Tests

- `packages/web/e2e/agent-schedule-toggle-refusal.spec.mjs` (new, two browser cases against the
  real server): a refused flip leaves the reason under that row's badge and nothing on the
  neighbouring row, the notification region without a dismissible toast, the button and the badge
  where the server still has them, and the line still there seven seconds later; then, with the
  refusal lifted, the same button lands — the line goes, the button becomes 启用 and the badge 停用.

## Compatibility

- No API, on-disk or request-shape change: the PUT body is exactly the one `toggleBody` built
  before. Only the failed path stopped using a toast.
