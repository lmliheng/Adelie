# A refused compaction-threshold change says why inside the card that asked for it

- **Date:** 2026-11-08
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-08-context-threshold-refusal.zh.md)

The context panel's dashed cutter never writes straight through: a release (or Enter on it) opens a
confirmation naming the Agent and the threshold it is about to replace, and the card's Save performs
the write. When the server refused that write, the card stayed open on the edited number — the Save
is the retry — but the only account of why was a notification above it, gone after six seconds. What
was left looked like a question nobody had answered.

That is the shape 7.19 bans, and on this card it costs more than usual: the field still holds the
number the person asked for, so nothing on screen says whether that number is in force. It is not —
the Agent still holds the old threshold.

The reason now renders inside the same card, under its sentence and above the buttons
(`role="alert"`, the danger tone, the whole sentence wrapping), until the next attempt or until the
card is closed. It names the threshold that was asked for, because that number lives nowhere else
once the dialog is gone, and says outright that the Agent still has the old value.

## Details

- `packages/web/src/features/chat/context-threshold-refusal.ts` (new): `contextThresholdRefused(tokens, error)`.
  The reason goes through `refusalText` (7.19's rule: an answer the server gave is read through its
  code's own localized sentence, never the English wire message); the figures go through
  `humanizeTokens`, so the sentence reads the same as the field and the ring above it.
- `packages/web/src/features/chat/context-gauge.tsx`: `confirmThreshold` keeps a refusal in
  `thresholdRefusal` instead of leaving it to the caller, and hands it to `ThresholdDialog`, which
  passes it to the shared `ConfirmModal`'s `refusal` slot. A newly proposed value and a closed card
  both clear it. The `onChangeCompactionLimit` contract now says the rejection is drawn here.
- `packages/web/src/features/chat/chat-page.tsx`: `onChangeCompactionLimit` no longer posts a toast
  before rethrowing — the card that asked is what says why, and a toast there sits above a dialog
  the person is still looking at.
- `packages/web/src/lib/strings{,-en}.ts`: one new sentence, `chat.contextThresholdRefused(n, reason)`.

## Tests

- `packages/web/test/context-threshold-refusal.test.ts` (new, 6 cases): the server's reason read
  through its code (never the wire message), a sentence this codebase raised itself kept as written,
  the generic text when nothing was said, the requested threshold named in `humanizeTokens` figures,
  the Agent's old value called out, and the English sentence.
- `packages/web/e2e/context-threshold-refusal.spec.mjs` (new, real server + real browser): one round
  through the mock model so the panel has a measured context, then the cutter moved two steps left
  and released, then Save refused at `page.route` and read back from server through the API. The
  sentence appears once, inside the card, in the interface's words; the notification region stays
  empty; the card keeps the edited number; the Agent still holds the old threshold — and **seven
  seconds later** the sentence is still there. Allowed, the same Save clears it, closes the card,
  writes the threshold and moves the cutter onto it.

## Compatibility

No interface change, no new dependency, no Project config change. The card's other behaviours — the
field's own validation, the window-cap hint, the success toast — are unchanged.
