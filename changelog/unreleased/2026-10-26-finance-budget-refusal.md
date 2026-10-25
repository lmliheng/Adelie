# Finance: a refused budget keeps the box, the typed amount and the reason

- **Date:** 2026-10-26
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-26-finance-budget-refusal.zh.md)

The finance page edits an employee's monthly budget in place: a number box in the reader's own
currency, save and cancel, with what it will store in USD underneath. Its write used to report a
refusal through a toast alone, so a few seconds after the attempt the row stood with the typed
amount still in the box, no explanation anywhere, and a live save button — the reason had gone to
where nothing else was looking.

The box now holds its own answer: a refusal draws the server's words on one line under it (the
app's existing "Refused:" lead-in), right where the retry is, and the typed amount stays as typed.
Text the box cannot read — a negative amount, say — says its piece on that same line instead of in
a toast. Cancelling lands back on the row as it was; opening the editor again drops the previous
reason, which belonged to the attempt it named.

## Details

- `features/company/finance-page.tsx`: `BudgetEditor` gains a `refusal` line and its own hint for
  text it cannot read (the existing `budgetHint` copy, now drawn where it can be read); the page
  keeps the refusal in `budgetRefusal` keyed by employee, so it is drawn in the row that asked.
  `saveBudget`'s `catch` no longer toasts, and both the landing path and cancelling clear it.
- New browser spec `e2e/finance-budget-refusal.spec.mjs`, two cases: with the write refused at
  `page.route` 500, the reason is under the box, the notification region never carries it, the
  chart's stored budget is unchanged and the box still holds the typed amount; cancelling and
  reopening shows the stored budget without a stale reason, and the retry really writes. The
  second case types an amount the box cannot read and proves it writes nothing at all.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *where* a refused budget and
  an unreadable one are reported. No new copy beyond the existing `S.common.refused` lead-in.
