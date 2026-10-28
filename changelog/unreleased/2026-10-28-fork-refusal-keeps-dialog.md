# A refused fork keeps the dialog open, with the reason inside it

- **Date:** 2026-10-28
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-28-fork-refusal-keeps-dialog.zh.md)

A reply's footer forks the conversation from that reply, behind a confirmation. Pressing Confirm
used to close the dialog first and fire the request afterwards: if the fork did not happen, the
only report was a toast — which dismisses itself after six seconds and sits over a dialog that is
no longer there — while the conversation stayed exactly as it was. The one place the user was
looking said nothing about what went wrong or whether anything had happened at all.

The dialog now settles from the answer. It stays up, disabled with its spinner, until the fork
request returns; a fork that happened closes it (the app is already navigating to the new
conversation), and one that did not keeps it, with the server's own sentence in the refusal slot —
`操作被拒绝：` followed by the reason, the same rule every other confirm dialog in the app follows.
The button is clickable again, so a retry is one click from the reason.

## Details

- `packages/web/src/features/chat/task-stats-line.tsx`: the dialog owns the outcome. A new
  `forkNow()` awaits `onFork`, closes the dialog only on success, and renders the failure through
  the `refusal` slot; the state is cleared whenever the dialog is opened, so an old reason never
  greets a new attempt.
- `packages/web/src/features/chat/chat-page.tsx`: `onFork` no longer toasts — it **rejects**, so
  the caller can decide where the reason belongs. The "reply cannot be located" branch (the
  position is not in history yet) now throws an `Error` carrying the localized sentence already
  written for it (`S.chat.forkSessionFailed`) rather than toasting it.
- `packages/web/src/lib/api-error.ts`: new `refusalText()` — `apiErrorText` for anything the
  server answered (localized by code), the thrown message for a condition this codebase raised
  itself, and the generic failure only for a value with nothing to say. Kept in one place because
  every refusal slot wants the same rule.
- `packages/web/test/api-error-text.test.ts`: three cases for `refusalText` — a mapped server
  code stays localized, an unmapped one still falls through to the server's sentence, a
  self-raised `Error` shows its own text, and a value with nothing to say reads as the generic
  failure.
- `packages/web/e2e/session-fork.spec.mjs`: a second test in the fork spec. The fork request is
  answered with the server's own stale-position refusal (`invalid_fork_position`, 400) and the
  test asserts the question stays up, the reason is inside it, exactly one request was made, the
  page did not move — then removes the refusal and confirms again, which forks and navigates.

## Compatibility

- No API, on-disk or protocol change. A fork that succeeds behaves exactly as before; a fork that
  fails is now reported in the dialog instead of a toast.
