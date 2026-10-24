# Org chart: a refused hire or field edit keeps its question — and the reason

- **Date:** 2026-10-24
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-24-employee-refusal.zh.md)

Two personnel actions on the org chart ask before they rewrite the chart file: hiring a
subordinate (which may create its Agent as well) and editing one field of an employee — its
monthly budget or its reporting line. Both confirmations used to close themselves as soon as the
write came back, including when it was refused; the reason fell into a toast that dismissed itself
after a few seconds and sat over a card that was already gone, while the chart on screen and on
disk had not changed at all.

Both cards now close only on the path where their write landed. A refusal leaves the card
standing with the server's words drawn under its sentence (`ConfirmModal`'s `refusal` slot, the
app's existing "Refused:" lead-in), so the retry is the button that was pressed; cancelling
decides nothing, and opening either card again drops the previous reason, which belonged to the
attempt it named.

## Details

- `features/company/employee-dialogs.tsx`: `HireDialog.hire()` and `EmployeeEditDialog.save()`
  keep the server's words in `hireRefusal` / `saveRefusal` instead of only toasting them, and
  close their card on the success path alone. Both bail out while a write is in flight (the
  cards' own buttons are already disabled by `busy`), and both clear the refusal when they open
  the card anew. `EmployeeEditDialog` also clears it when the dialog itself is opened, so the
  reason from the last question cannot be read under a new one.
- New browser test `e2e/employee-refusal.spec.mjs` (2 cases, one per card): with the write
  refused at `page.route` 500, the card, its sentence and the chart's stored state all stay
  (nothing to dismiss in the notification region); reopening shows no stale reason; the retry on
  the same card writes it — the card goes and the chart holds the hire / the new cap.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* the two cards close and
  *where* the reason is drawn. No new copy beyond the existing `S.common.refused` lead-in.
