# A refused desk renewal says why in its dialog, not in a six-second toast

- **Date:** 2026-11-04
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-04-desk-renew-refusal.zh.md)

"New desk session" on the org chart is a dialog that is its own confirmation: a changed workspace is
written to the employee tree first and a fresh desk session opened afterwards, and an untouched one is
just the session. The first write has always answered where it was asked — an invalid workspace lands
under the field, because the box is what has to change. When the **second** write was the one refused,
the dialog stayed open with the field as it was, and the reason went to a notification: six seconds
later it was gone, leaving a dialog that read exactly as it did before the press, with the same button
to retry it.

That sentence is now drawn in the dialog, above the workspace field (`role="alert"`, danger colour,
`NoticeStrip`'s danger tone — the same shape as the "mark blocked" form in the ticket dialog). Above
the field rather than under it because the renewal, not the path in the box, is what was refused: the
reader still sees which path they tried, and the sentence does not take the field's own error slot,
where "invalid workspace: …" belongs. It belongs to the attempt that produced it — the next press
clears it before it sends, and reopening the dialog carries no old answer.

## Details

- `packages/web/src/features/company/employee-dialogs.tsx`: `DeskRenewDialog` gains a `refusal` state —
  `confirm()` clears it before the request and sets it when the desk-session write fails (it used to
  raise `toastError`); the open effect clears it too. It draws one `S.common.refused(reason)`, the
  app-wide refusal slot's wording (7.19: a request that never reached the route reads its error code's
  localized sentence).
- The header comment now records why the sentence lives in the dialog and why it stays out of the
  field's `error` slot.

## Tests

- One more case in `packages/web/e2e/employee-refusal.spec.mjs` (real server, real browser): the
  renewal's `POST` is stubbed to 500 at `page.route`. The refusal keeps the dialog, draws the reason
  inside it and puts nothing in the notification region; **seven seconds later** (past the six an error
  notification lives) it is still there; cancelling and reopening carries no old answer; once allowed
  the dialog closes and the page follows the new desk session to its chat.

## Compatibility

No interface change, no new dependency, no Project config change, no new strings —
`S.common.refused` already existed and keeps its exact wording.
