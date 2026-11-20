# A channel message that did not go out says why above the composer, not in a leaving toast

- **Date:** 2026-11-21
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-21-channel-send-refusal.zh.md)

Pressing Send in an organization channel is the composer's only write. When it failed, the reason
arrived as a notification over the stream that dismissed itself after six seconds — while the box
still held every word (mentions included) and the send button was still there, so afterwards
nothing on screen said why the message had not gone out (7.19's rule: the sentence belongs where
the attempt was made).

The reason now draws above the box, right where the send button is, and stays until the next
press; a new attempt clears the previous sentence first. Which sentence is which stayed a pure
function with a test: the interface's own lead-in plus the server's reason — the dictionary's
words for a code it knows (`internal`), the server's own sentence for one it does not, which is
the common case for channel writes (`channel_archived`, `not_a_member`).

## Details

- `packages/web/src/features/company/channel-send-refusal.ts` (new): `channelSendRefusalLine(err)` —
  the lead-in is `S.company.channels.sendRefused`, the reason goes through the shared `refusalText`
  (the same rule the chat card and the subagent composer follow).
- `packages/web/src/features/company/channel-composer.tsx`: a `sendRefusal` slot drawn above the
  input row (`role="alert"`, `data-testid="channel-send-refusal"`, danger ink, two lines, the whole
  sentence on hover). It draws outside the box — nothing still goes below it, which is the place
  for a hint (read once, then costs a row of the stream on every later visit); this is the answer
  to a press.
- `packages/web/src/features/company/channel-view.tsx`: `send` no longer raises a toast; it records
  the sentence together with the channel it was pressed in, clears it at the start of every
  attempt, and clears it with the rest of the stream state when the reader switches channels — so
  a sentence never follows them into a channel that did not fail, a late failure included.
- Both dictionaries gain `company.channels.sendRefused`.

## Tests

- `packages/web/test/channel-send-refusal.test.ts` (new, 5 cases): an unknown code keeps the
  server's words (`channel_archived`), a known one uses the dictionary (`internal`), a sentence
  the app raised itself is kept, nothing to say falls back to the generic sentence, and the
  lead-in follows the interface language.
- `packages/web/e2e/channel-send-refusal.spec.mjs` (new, 3 cases, real server + real browser):
  ① the store answers 500 → one sentence above the composer, nothing of it in the notification
  region, the box still holding the draft, the button still pressable, still there after seven
  seconds, and the retry lands; ② the channel is archived under the reader (a real 409,
  `channel_archived`) → the server's sentence above the composer, the draft kept; ③ switching to
  another channel and back carries no sentence over.
- **Reverse test**: the same spec against the pre-change build fails all three (no such slot); the
  two-state probe — one script, two builds — read the toast holding the reason and the slot empty
  before, and the slot holding it still after eight seconds now.

## Compatibility

Front-end rendering only: no API, wire format or stored data changed, and the server was not
touched. Both refusals it shows (`channel_archived`, the store's 500) keep their meaning and
status codes.
