# Org chart: a refused leave keeps its question — and the reason

- **Date:** 2026-10-25
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-25-org-chart-leave-refusal.zh.md)

The "Leave the organization" row of an employee card's menu asks in the shared confirmation card
before the employee is taken off the chart. That card used to stay open when the leave was
refused, but the reason only fell into a toast that dismissed itself after a few seconds and
floated above the card — the card itself said nothing, so all the reader saw was the buttons
coming alive again with the employee still on the chart, and the retry meant opening the menu
again.

The card now closes only on the path where its leave landed; a refusal draws the server's words
inside the card, right above the retry button (`ConfirmModal`'s `refusal` slot, the app's existing
"Refused:" lead-in). Opening the card again drops the previous reason, which belonged to the
attempt it named; a write in flight takes one press only, and cancelling decides nothing.

## Details

- `features/company/org-chart-page.tsx`: `runLeave()` keeps the server's words in `leaveRefusal`
  instead of only toasting them, and both `setLeaveFor(null)` and the success notice sit on the
  path after the `await` succeeded. The menu's "离任" row clears the previous reason before it
  opens the card; the card's `onClose` already stopped answering while a write was out (`busy`),
  and the card now renders `refusal`.
- New browser test `e2e/org-chart-leave-refusal.spec.mjs`: with
  `DELETE …/organizations/<org>/employees/<employee>` refused at `page.route` 500, the card, its
  sentence and the chart on the server all stay (nothing in the notification region carries the
  words); cancelling and reopening shows no stale reason; the retry on the same card really lets
  the employee go — the card closes, the employee's card leaves the canvas and the chart holds
  the CEO alone.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* this card closes and
  *where* the reason is drawn. No new copy beyond the existing `S.common.refused` lead-in.
