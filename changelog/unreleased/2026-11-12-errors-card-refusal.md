# Both confirmation cards in the error center keep a refused write's reason inside the card

- **Date:** 2026-11-12
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-12-errors-card-refusal.zh.md)

The cost center's error panel has two cards that ask before they write: 清空 deletes every record in
the range, and 忽略这类异常 adds a rule that hides a class of them. Both closed on success and stayed
open on failure — correctly — but the reason for the failure was only a notification that dismissed
itself after six seconds. The card then read exactly as it had before the attempt: on the delete card
that is a question about deleting records that were refused, waiting to be answered again; on the
ignore card it is a class that is still in the table with nothing saying why.

Each card now carries the refusal itself, in the shared card's `refusal` slot — `操作被拒绝：<reason>`
under the sentence that was refused, beside the button that retries it. The sentence above is
untouched (a refused write changed nothing), the toast is gone, and the reason is cleared when the
next attempt starts or the card is closed, so reopening it starts clean.

## Details

- `packages/web/src/features/usage/errors-panel.tsx`: a `clearRefusal` state on the delete card and an
  `ignoreRefusal` state on the ignore card. Both are filled from `apiErrorText` only when the write is
  refused, emptied at the start of every attempt and when the card closes; the delete card is also
  emptied when it is opened (its sentence is about a count that has just been re-read). The two
  `toastError` calls they replace are gone — the card is the whole account of the refusal, which is
  the app-wide rule.
- Nothing else about either card moved: what they name, when they close, what they delete or silence,
  and the retry being the same button.

## Tests

- `packages/web/e2e/cost-center-clear.spec.mjs`: the refused-delete test now reads the reason inside
  the card, checks the notification region holds nothing, and that the card still reads as it did —
  the prior sentences plus the one line; it then closes the card, reopens it, and sees a clean card
  before letting the retry through.
- `packages/web/e2e/errors-ignore.spec.mjs`: a new refused-ignore test — the card stays open on the
  class it named with the reason inside it and nothing in the notification region; the row is still
  in the table, no notice to undo, no rule on the Project; the card reopens clean and the retry lands
  a rule.
- Both run on a real server, the repository's mock model and a real browser.

## Compatibility

No wire change, no new dependency, no Project config change, no new copy: the sentence is the
existing app-wide `操作被拒绝：<reason>`. Successful writes and every other notification are untouched.
