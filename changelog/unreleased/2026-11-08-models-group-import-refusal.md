# A refused group import says why in the dialog, not in a six-second toast

- **Date:** 2026-11-08
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-08-models-group-import-refusal.zh.md)

The model library's "Add group" dialog has an import mode: point it at an endpoint, the server
lists the models it serves, and one press appends them all as a new user-defined group. That press
is one whole-table write, so a refusal writes nothing at all — the group the reader just named is
not there, nothing from the listing landed, and the dialog stays open (it closes only on a written
save) over a page that still shows no such group.

The reason used to be raised as a notification, which sits over the dialog and dismisses itself
after six seconds: once it left, the dialog looked exactly as it had before the press and the page
behind it had not changed either, so nothing on screen said why. It now renders in the dialog's own
error line, under the base URL field and above the buttons — the same slot the listing's own
failures use — and stays until the form is edited, the mode is switched, or another attempt starts.
The import button is the retry, and the fields it will send are the ones on screen.

The sentence names both facts the reader needs before retrying: which group was not created, and
that the table behind the dialog did not move. "Saving failed" alone would leave open whether half
the listing had landed.

## Details

- `packages/web/src/features/models/group-import-refusal.ts` (new): `groupImportRefusal(name,
  outcome)` answers the line or `null` for a written save (which closes the dialog, so there is
  nothing to say).
- `packages/web/src/features/models/models-page.tsx`: `importGroup` hands `persist`'s verdict back
  to the dialog instead of toasting it (the docstring claiming "the dialog closes the moment the
  import lands, so there is no card here" was wrong — it closes only on a written save, which is
  exactly why the verdict travels back); `runImport` draws the refusal in the dialog; switching mode
  clears the previous answer.
- `packages/web/src/lib/strings{,-en}.ts`: `models.groupImportRefused(name, reason)`.
- `packages/web/src/features/models/write-outcome.ts`: the header now names the import path among
  the call sites that hand the words to a card.

## Tests

- `packages/web/test/group-import-refusal.test.ts` (new, 4 cases): a written save says nothing; a
  refusal names the group and keeps the server's words; it also says the table did not move; both
  languages.
- `packages/web/e2e/models-group-import-refusal.spec.mjs` (new, real server + real browser; both
  routes the flow uses — `models/list` and the table `PUT` — are stubbed, so nothing depends on a
  provider): a refused import puts the whole sentence in the dialog, records the write attempt and
  the listing, leaves the notification region empty, keeps the dialog and its fields, and the line
  is **still there seven seconds later** with the server table unchanged; the second case shows the
  mode switch retiring the sentence and the same button, once the write is allowed, closing the
  dialog and writing both models.

## Compatibility

No interface change, no new dependency, no Project config change. The dialog's other failures
(invalid URL, a listing that failed or was empty), the create-only path and every other model-library
write are untouched.
