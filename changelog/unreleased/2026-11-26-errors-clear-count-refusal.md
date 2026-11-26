# A refused count read leaves its reason beside the Clear button

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-26-errors-clear-count-refusal.zh.md)

Clear is two requests: a read of the filtered set, which supplies the count the confirmation has
to name (the delete is scoped to what the table shows, so only that read can count it), and then
the delete itself. When the read failed the confirmation never opened and the panel looked exactly
as it had before the press — rows in place, the button still the only way to try again — with the
reason in a notice that dismissed itself after six seconds.

The read is refused before the card exists, so the card cannot be the surface for it. The sentence
now stands beside the button that asked, in the footer under the table: the app's own words
("nothing was cleared") plus the server's reason, clamped to two lines with the whole text on the
hover title, until the next attempt or a change of filter. A later press that gets its count opens
the confirmation as it always did.

## Details

- `packages/web/src/features/usage/errors-panel.tsx`: `openClear`'s catch writes a new
  `countRefusal` state instead of a toast; `ClearCountRefusal` renders it as a `role="alert"` line
  (`data-testid="errors-clear-count-refusal"`) between the button and the pager, and the state is
  cleared when an attempt starts and when the filter changes (it named the set that read was about).
- `packages/web/src/lib/strings{,-en}.ts`: `usage.errorsClearCountRefused(reason)`.
- `packages/web/test/errors-panel.test.ts` (4 cases) and
  `packages/web/e2e/errors-clear-count-refusal.spec.mjs` (the real read driven into a 500: sentence
  stays past a toast's lifetime, beside the button, no dialog, no notification; letting the read
  through opens the confirmation and takes the sentence away).

## Compatibility

The Web App only. The card's own refusals (the delete itself failing) keep their sentence inside
the card, and the delete route is untouched.
