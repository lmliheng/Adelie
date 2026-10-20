# Delete model: the confirmation closes only after the delete lands

- **Date:** 2026-10-20
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-20-models-delete-model.zh.md)

A model's config dialog asks before "Delete model", naming the model and saying its config and
API key go with it. Both that confirmation and the config dialog behind it used to close as soon
as the request left, **whether the delete had succeeded or not** — while `persist` keeps the
attempted rows, which for a delete is a table *without* this model. A refused delete therefore
took the model off the page while the server still held it, and the card that opens the config
dialog went with it: there was nothing left to retry from, and the error toast was the only trace
of the refusal.

Now the delete is written before either dialog is dismissed, and a refused one leaves the card —
and the row behind it — exactly where it was.

## Details

- Both dialogs stay open until the table write lands; on a refusal the sentence stays verbatim,
  the error toast shows the server's own words, and the retry is that same confirmation.
- A refused write leaves the table as it stood before the delete (rather than the attempted one),
  so the card, its "Delete model" action and the dialog itself all survive the refusal — the
  dialog is gated on its row still being in the table, so the attempted table would have
  unmounted it mid-flow.
- The confirmation is marked busy while the request is in flight: its buttons are disabled, so a
  second click cannot start a second write.

## Compatibility

- No API, wire-format or dependency change: this is only the order of writing and dismissing.
