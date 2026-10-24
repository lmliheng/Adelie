# Organization settings: a refused deletion keeps its question — and the reason

- **Date:** 2026-10-25
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-25-org-delete-refusal.zh.md)

The "delete" row at the bottom of the organization settings dialog asks before it really deletes,
and it asks for the organization's id typed out. That confirmation used to stay open when the
write was refused, but the reason only fell into a toast that dismissed itself after a few seconds
and floated above the card — the card itself said nothing, so all the reader saw was the buttons
coming alive again with the organization still there.

The card now closes only on the path where its write landed; a refusal draws the server's words
inside the card, right above the retry button (`ConfirmModal`'s `refusal` slot, the app's existing
"Refused:" lead-in). Opening the card again drops the previous reason, which belonged to the
attempt it named; a write in flight takes one press only, and cancelling decides nothing.

## Details

- `features/company/org-dialogs.tsx`: `doDelete()` keeps the server's words in `deleteRefusal`
  instead of only toasting them, and both `setConfirmDelete(false)` and the success notice moved
  onto the path after the `await` succeeded. The delete row's button clears the previous reason
  and the previously typed id before it opens the card; the card's `onClose` stops answering while
  a write is out (the card's own buttons are already disabled by `busy`; this is the same promise
  for an escape press).
- New browser test `e2e/org-delete-refusal.spec.mjs`: with `DELETE …/organizations/<id>` refused at
  `page.route` 500, the card, its sentence and the organization on the server all stay (nothing in
  the notification region carries the words); cancelling and reopening shows no stale reason; the
  retry on the same card really deletes — the card and the settings dialog close, the organization
  leaves the listing and reads 404.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* this card closes and
  *where* the reason is drawn. No new copy beyond the existing `S.common.refused` lead-in.
