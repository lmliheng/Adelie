# A refused ticket progress note keeps its reason under the box

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

The ticket's Progress section has a one-line box for appending a note. Pressing **Add progress**
(or Enter) and being refused used to leave only a notification that dismissed itself after six
seconds: the sentence stayed in the box and the button stayed live, but nothing on screen said why
the press had not landed, and once the notification was gone it looked as if nothing had happened.
The reason is now drawn under that box — a refusal wrote nothing, the note is still in the box, and
the same button is the retry.

## Details

- `packages/web/src/features/company/ticket-dialog.tsx`: the box gets its own refusal slot
  (`progressRefusal`), apart from the `refusal` the four confirmations share — that one is drawn
  inside their own cards, while this box is not a card and stays on the page. The sentence is the
  library's `NoticeStrip` (`role="alert"`, danger tone, the shared `S.common.refused(...)` lead-in)
  under the input row; every attempt clears the previous sentence, and a success clears it with the
  box.
- `packages/web/e2e/ticket-refusal.spec.mjs` gains one test: `…/progress` answered with a 500 → the
  sentence is under the box, the notification area holds no entries, no note landed on the ticket,
  and the box keeps the sentence; with the stub lifted, the next press puts the note on the ticket,
  empties the box and clears the sentence.

## Compatibility

Only where the failure is drawn changed. The interface, the data root and the success path are
unchanged.
