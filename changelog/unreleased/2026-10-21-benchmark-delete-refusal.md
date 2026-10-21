# A refused Benchmark delete keeps its confirmation and the reason in it

- **Date:** 2026-10-21
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-21-benchmark-delete-refusal.zh.md)

Deleting a Benchmark on the evaluation center asks first, and that card used to close from a `finally`:
success or refusal alike. A refused delete therefore left the Benchmark's card on the page (nothing was
deleted) but took the reason with it, and that reason arrived as a toast that dismissed itself after six
seconds and floated over the card instead of in it.

The card now closes only once the delete landed. When the server refuses one, the card stays with its
sentence — the Benchmark's title, unchanged — and the server's own words drawn under it, so the retry is
the same button rather than a hunt for a card that is still there.

## Details

- The rule is the model library's and the scheduled tasks' (`ConfirmModal`'s `refusal` slot): the reason is
  drawn inside the card that asked for the write, and opening the card clears the previous attempt's reason
  first — that sentence was about the previous attempt.
- `features/benchmark/benchmark-page.tsx`: `setDeleting(null)` moved into the success path, the `catch`
  hands the server's words to a `deleteRefusal` state instead of a toast.
- No toast is raised for the refusal any more: the card is the only place it is said, so there is nothing
  that dismisses itself while the user is still looking at the question.
- New browser spec `e2e/benchmark-delete-refusal.spec.mjs` (two tests): a refused delete keeps the card, its
  sentence and the Benchmark, and raises no toast; the retry writes it and only a written one closes the card.

## Compatibility

- No API, wire-format or dependency change: this is only when the card closes and where its refusal is drawn.
