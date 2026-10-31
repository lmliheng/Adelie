# The connection switch keeps a refusal's reason under it, instead of only in a toast

- **Date:** 2026-10-31
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-31-messaging-toggle-refusal.zh.md)

The remote-control binding's enable switch writes nothing optimistically: it moves only after the
state call lands, so a refused flip springs back to where the server still has it. That left the
reason in a toast and nowhere else — six seconds after the click the screen held a switch that
would not move and no sentence saying why, while the reasons here are exactly the ones a reader
acts on (another conversation already polling this bot, no saved credential, a lost connection).

The reason now stays under the switch, in the same place the connection's own error line sits, as
`role="alert"` so it is announced when it arrives. It is cleared by the next flip and by switching
channels — another channel's switch is a different control and must not inherit the accusation.
Both hosts of the editor (the sidebar dialog and the conversation's remote-control panel) get it,
since the body is shared.

## Details

- `packages/web/src/features/messaging/messaging-binding-editor.tsx`: `useMessagingBinding` keeps
  `toggleRefusal`, set from the failed state POST (via `apiErrorText`, so the words are the
  server's) instead of `toastError`; `selectChannel` and the next flip clear it. The body renders
  it first among the lines under the status row, in the danger ink, bounded to two lines with the
  whole sentence on hover — the same shape as `lastError`. The sentence reuses the shared lead-in
  `S.common.refused`, so it reads like every other refused write in the app; no new copy.

## Tests

- `packages/web/test/messaging-binding-editor.test.ts`: one case renders a refusal and asserts the
  shared lead-in plus the reason, `role="alert"`, the line's position outside the status row, and
  that nothing is announced when no flip was refused.
- `packages/web/e2e/messaging-toggle-refusal.spec.mjs` (new, two browser cases against the real
  server): a refused enable leaves the line beside the switch, writes nothing (the switch stays
  off, the notification region holds no toast), and the line is still there after the six seconds
  a toast lives; then, with the refusal lifted, the next flip lands and the line goes with it.

## Compatibility

- No API, on-disk or request-shape change. A successful flip behaves exactly as before; only the
  failure path stopped using a toast.
