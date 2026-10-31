# A refused theme import says why in the dialog, and on the card, instead of in a toast that expires

- **Date:** 2026-11-01
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-01-theme-import-refusal.zh.md)

Importing a theme happens on two surfaces of the appearance page, and both kept their refusal
nowhere. The dialog (a picked `.json` file, or an address the server fetches) stays open on a
failure — nothing was written, and the picked file or the typed address is still there to retry —
but the reason went to a toast that dismissed itself after six seconds, above a dialog that said
nothing about what had just failed. The library's cards are the same story one level down: a card
is a theme and one import button, the button writes nothing optimistically, and a refused import
(that entry is gone from the catalogue, its file is not the id it was listed under, the fetch
failed) left every card looking exactly as it did, with the explanation in that same six-second
toast. With two or more cards on screen, the toast did not even say which one to think about.

Both surfaces now keep the sentence where the import was asked: the dialog draws it under the file
or the address field, and a card draws it under its own import button. Both use the shared lead-in
`S.common.refused`, the danger ink and `role="alert"`; the card's line is clamped to two lines with
the whole sentence on hover. No new copy was written — every code already had its own localized
sentence in `themeImportErrorText`.

## Details

- `packages/web/src/features/settings/theme-import.ts`: `themeImportRefusal(err)` — the rule "409
  `theme_exists` is a question (open the overwrite confirmation), everything else is a refusal"
  now lives here once, returning `null` for the question and the existing sentence otherwise. Both
  callers had written that branch out themselves; neither could have got it right by accident.
- `packages/web/src/features/settings/theme-import-dialog.tsx`: a `refusal` state, filled from the
  failed import instead of `toastError`, cleared when the dialog opens, when it closes, when the
  source switches (a sentence about a file must not sit beside a URL) and when the next attempt
  starts; the sentence is a `NoticeStrip` at the bottom of the dialog's body, under the source it
  was about. A 409 still opens the overwrite card, which resends that very request.
- `packages/web/src/features/settings/theme-registry-section.tsx`: a `refusal` of `{id, text}` —
  one attempt at a time, like the import itself — cleared by the next attempt and by every
  re-read of the catalogue (a sentence about a card of the old grid is stale); the card whose
  button was refused draws it, and no other card does.

## Tests

- `packages/web/test/theme-import.test.ts` (+3 unit cases): the 409 is the only answer that comes
  back as "ask"; every other code — including a 409 with some other code, which has no card to
  open — is a refusal carrying the same sentence the failure mapping gives, and never an empty
  line.
- `packages/web/e2e/theme-import-refusal.spec.mjs` (new, three browser cases against the real
  server, catalogue stubbed): a refused registry import leaves the reason on that card and nowhere
  else, with no dismissible toast and the line still there seven seconds later, and the same
  button lands once the refusal is lifted; a 409 still opens the overwrite question instead of
  drawing a line; a refused import by address keeps the dialog, the address and the reason, and
  the confirm beside it retries that same address.

## Compatibility

- No API, catalogue or request-shape change: the dialog sends the same bodies and the card sends
  the same `{id, overwrite}`. Only the failed paths stopped using a toast.
