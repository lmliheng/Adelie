# A refused batch delete keeps its confirmation and the reason in it

- **Date:** 2026-10-22
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-22-session-batch-delete-refusal.zh.md)

The sidebar's batch delete goes out **one conversation at a time** (the server has no bulk route), so it can land
halfway. That batch used to run over `Promise.all`: the first refused row threw away every other row's outcome, the
card stayed open but the reason was a toast that dismissed itself after six seconds above it, and every row was
still ticked while the list and the server already disagreed — there was no telling which conversations had really
gone.

Now each row's outcome is kept: the ones that went leave the list and the ticks, the refused ones **stay ticked**
(so the card's own count is exactly what a retry would act on), and the card stays open with the server's words
under its sentence, so the retry is the same button. Only a batch where nothing was refused closes it.

## Details

- The rule follows the model library, scheduled tasks, evaluation center, plugin market, conversation and plugin
  settings rounds (`ConfirmModal`'s `refusal` slot): the reason is drawn inside the card that asked.
- `components/layout/sidebar.tsx`: `confirmBatchDelete` collects per-row outcomes with `Promise.allSettled` — rows
  that landed go to `forgetDeletedSessions` and leave the ticks, refused rows keep theirs; the card closes only when
  nothing was refused, otherwise "N of the selected chats were not deleted: <the server's words>" goes to a new
  `batchDeleteRefusal` state. The conversation on screen is only left for when it actually went away. Opening the
  card from the batch bar clears the previous reason first.
- Copy: `chat.batchDeleteRefused` (one line in each dictionary).
- New browser spec `e2e/session-batch-delete-refusal.spec.mjs` (two tests): a batch refused in part — card, sentence
  and the server's words all stay, the landed row is gone from the list while the refused one is still ticked and
  the card's count drops to 1, no toast, and the retry closes the card and really deletes; a batch refused whole —
  both rows and both ticks stay, the count is unchanged, and reopening the card after Cancel carries no old reason.

## Compatibility

- No API, wire-format or dependency change: this is only how a batch's outcomes are remembered and where the reason
  is drawn.
- Batch archive / unarchive are a different path (`Promise.all` + toast) and were left alone.
