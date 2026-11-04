# A message the subagent panel could not deliver says why above its composer, not in a six-second toast

- **Date:** 2026-11-05
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-05-subagent-send-refusal.zh.md)

The agents dock has a composer of its own, so a child session can be answered from the panel. When
that message did not reach the child — the child had been released and could not be revived, the
server refused it, the connection dropped — the composer deliberately kept what was typed (`onSend`
answers `false` for exactly that reason) while the reason went to a notification: six seconds later
it was gone, leaving a box that still held the message, with the same button to retry it, and
nothing saying what had happened.

That sentence now sits right above the box it belongs to (`role="alert"`, danger colour,
`NoticeStrip`'s danger tone) and stays there until the next attempt clears it. A released child
keeps its own wording ("the subagent session no longer exists and could not be revived") because
there the child is what is missing, not the message; every other failure is named for the action and
carries the server's own words, read through the app-wide refusal rule (a request that never reached
the route says what its code means, not its wire message).

## Details

- `packages/web/src/features/chat/subagent-send-refusal.ts` (new): `subagentSendRefused(err)` — the
  pure decision, so which sentence appears is in one place and testable without the panel.
- `packages/web/src/features/chat/subagents-view.tsx`: the panel's `SubagentComposer` gains a
  `sendRefusal` state, written by `sendFailure` (which used to `toastError`) and cleared by the send
  and steer paths before their requests leave; the strip renders above `ChatInput`, inside the same
  reading column. The composer is keyed by child, so switching nodes never carries a stale line over.
- `packages/web/src/lib/strings{,-en}.ts`: one new pair, `subagentPanel.sendRefused(reason)`.

## Tests

- `packages/web/test/subagent-send-refusal.test.ts` (new, 5 cases): the released child keeps its own
  sentence; a server answer is named for the action and carries its words; a request that failed on
  the way out reads through `refusalText`; nothing to say falls back to the generic sentence; the
  active language is the one used.
- `packages/web/e2e/subagent-send-refusal.spec.mjs` (new, real server, real browser): spawn a child,
  stub the child-message `POST` to 500, press send in the panel's composer. The line appears above
  the box with the server's words, the notification region never carries them, the draft stays in the
  box, and **seven seconds later** (past the six an error notification lives) it is still there; once
  the route is allowed through again the next send leaves nothing behind.

## Compatibility

No interface change, no new dependency, no Project config change. The panel's `pinChildLevel`
failure (a thinking-level pick in the toolbar) keeps its toast: what the reader has to change there
is the picker itself, not the composer.
