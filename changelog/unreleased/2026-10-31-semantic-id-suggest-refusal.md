# A refused id proposal says why under the id box, instead of only in a toast

- **Date:** 2026-10-31
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-31-semantic-id-suggest-refusal.zh.md)

Every create dialog that names an object with a semantic id (Project, Agent, Benchmark,
organization, channel) wears the same id field, whose "generate with AI" button asks the server for
an id derived from the display name. The server always answers with an id, so what the field had to
say was only how much that id is worth. **The request itself failing** is another matter — no access
to that Project, company mode switched off under an org or channel dialog, the connection gone —
and then the box is left exactly as it was while the reason arrived as a toast and nothing else: six
seconds after a reader looked away, a button that had done nothing and no sentence saying why.

That sentence now sits under the id box, in the same place as "this id is a placeholder" and "this
one is a transliteration": the shared lead-in `S.common.refused`, in the danger ink, as
`role="alert"` so it is announced when it arrives. The next edit or the next click clears it — it is
this click's answer, not the field's standing state. All five create dialogs share this body, so all
five get it, and no new copy was written.

## Details

- `packages/web/src/features/semantic-id/semantic-id-field.tsx`: a `refusal` state, filled from the
  failed request via `refusalText` (the server's own words when it has them, this app's own sentence
  for the conditions it raises itself) instead of `toastError`; cleared by a change in the box and
  by the next attempt. The box itself is untouched — the click obtained nothing.
- `packages/web/src/features/semantic-id/id-suggest-notice.ts`: a new pure function `idSuggestLine`
  decides which line goes under the box in one place: refusal, then the attention-toned placeholder
  note, then the quiet transliteration one. The field never holds two at once (it clears the note
  before asking); the order is written down so a later edit cannot quietly let a note hide why the
  button did nothing.

## Tests

- `packages/web/test/id-suggest-notice.test.ts`: four new cases pinning the combinations (neither, a
  note alone, a refusal alone, and a refusal outranking a leftover note).
- `packages/web/e2e/semantic-id-suggest-refusal.spec.mjs` (new, two browser cases against the real
  server): a refused proposal leaves the reason under the id box, the box still empty and the
  notification region without a toast, and the line is still there seven seconds after a toast would
  have gone; then, with the refusal lifted, the same click lands an id and the line goes with it.

## Compatibility

- No API, on-disk or request-shape change. The three notes a successful proposal draws are word for
  word as before; only the failed path stopped using a toast.
