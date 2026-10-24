# Organization handbook: a refused deletion keeps its question — and the reason

- **Date:** 2026-10-25
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-25-handbook-delete-refusal.zh.md)

The Delete button over a handbook document asks in the shared confirmation card before the file
leaves `handbook/`. That card used to stay open when the delete was refused, but the reason only
fell into a toast that dismissed itself after a few seconds and floated above the card — the card
itself said nothing, so all the reader saw was the buttons coming alive again with the document
still there.

The card now closes only on the path where its delete landed; a refusal draws the server's words
inside the card, right above the retry button (`ConfirmModal`'s `refusal` slot, the app's existing
"Refused:" lead-in). Opening the card again drops the previous reason, which belonged to the
attempt it named; a write in flight takes one press only, and cancelling decides nothing.

## Details

- `features/company/handbook-page.tsx`: `remove()` keeps the server's words in `deleteRefusal`
  instead of only toasting them, and both `setDeleteOpen(false)` and the success notice sit on the
  path after the `await` succeeded. The document header's Delete button clears the previous reason
  before it opens the card; the card's `onClose` already stopped answering while a delete was out
  (`busy`), and the card now renders `refusal`.
- New browser test `e2e/handbook-delete-refusal.spec.mjs`: with `DELETE …/handbook/files/<path>`
  refused at `page.route` 500, the card, its sentence and the document on the server all stay
  (nothing in the notification region carries the words); cancelling and reopening shows no stale
  reason; the retry on the same card really deletes — the card closes, the row leaves the tree, the
  document reads 404 and the pane falls back to the index.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* this card closes and
  *where* the reason is drawn. No new copy beyond the existing `S.common.refused` lead-in.
