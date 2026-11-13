# A batch archive that was refused in part says which chats did not move

- **Date:** 2026-11-13
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-13-batch-archive-refusal.zh.md)

The sidebar's batch bar has no bulk route: 批量归档 / 批量取消归档 send one PATCH per ticked
conversation, so a batch can land halfway. Their outcomes were read as a whole (`Promise.all`), and
a refusal was reported with a notification. Two things went wrong at once. The first refused row
threw away every other row's answer, so rows the server HAD archived stayed on screen exactly as
they were — the list disagreed with the server about conversations nobody could see were already
gone, and the 已归档 folder never appeared. And the reason lived in a toast that dismissed itself
after six seconds, above a list that looked untouched; every tick stayed on, including the rows
that had already moved.

Both actions now read their outcomes per row — through the new `lib/batch-outcome.ts`, the same
rule the batch delete already followed — so the rows that landed take the server's own copy and
move into the 已归档 folder, the refused ones stay ticked (they are exactly what a retry would act
on), and the bar keeps the count of what is still left plus the server's words:
`还有 1 个对话没有归档：<原因>`. The two buttons above it are the retry, which is why the sentence
belongs in the bar: nothing asked a question first, so there is no card to keep. A batch that went
through whole still just says so in a toast and drops every tick.

## Details

- `packages/web/src/lib/batch-outcome.ts` (new): `splitBatchOutcome(targets, results)` — what
  landed (the row plus whatever its request answered), what was refused, and the first refusal's
  reason (a host shows one reason; the rows say which of them did not go).
- `packages/web/src/components/layout/sidebar.tsx`: `batchSetArchived` runs `Promise.allSettled`
  and reads it through the splitter; the landed rows go through `replace(row.value.session)`, the
  refused ones become the selection; the `已归档` folder is opened only when the archiving of the
  open conversation actually landed. A new `batchArchiveRefusal` state is drawn by the bar
  (`role="alert"`, red ink, whole-row width) and cleared at the start of every attempt, when a tick
  changes, when the selection is cleared and when the mode is left — the sentence counts the ticks
  it was about. `confirmBatchDelete` now uses the same splitter (behaviour unchanged).
- `packages/web/src/lib/strings.ts` / `strings-en.ts`: `batchArchiveRefused` and
  `batchUnarchiveRefused`, in both dictionaries.

## Tests

- `packages/web/test/batch-outcome.test.ts` (new, 6 cases): each row gets its own answer, a refusal
  in the middle keeps the rows that landed after it, the first reason is the one kept, a batch
  refused whole leaves every row, a short result list invents nothing, and a result with no row is
  ignored.
- `packages/web/test/sidebar-batch-sessions.test.ts`: the two new dictionary strings, the bar's
  refusal slot, and that both actions read their outcomes through the one splitter (the delete's
  three assertions were updated for the shared helper).
- `packages/web/e2e/session-batch-archive-refusal.spec.mjs` (new, 2 cases, real server + the
  repository's mock model + a real browser): two ticked chats, one PATCH refused — the sentence is
  in the bar, nothing in the notification region, still there after seven seconds, the refused row
  still ticked while the landed one is archived for real and has moved into 已归档 — then the same
  button retries and the bar goes; and a batch refused whole keeps both ticks until 取消选择 takes
  the sentence with them.
- `packages/web/e2e/session-batch-delete-refusal.spec.mjs` (existing, unchanged) still passes —
  the delete path moved onto the shared splitter.
- Against the page as it was before the change (rebuilt from `HEAD`'s `sidebar.tsx`), both new
  cases fail on the missing refusal line.

## Compatibility

No API change, no new dependency, no stored format change. A batch that goes through behaves
exactly as before; what changed is a batch that does not — it can no longer look as if it did.
