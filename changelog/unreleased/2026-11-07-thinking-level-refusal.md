# A thinking level that did not take says why above the input card, not in a six-second toast

- **Date:** 2026-11-07
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-07-thinking-level-refusal.zh.md)

The thinking level has two pickers: the one on the new-conversation page writes into the Agent's
settings (it also becomes the Agent's new default and the level the first message's Session is
created on), the one inside a conversation pins that Session (it applies from the next LLM request).
Both write on the pick, and both display **the level they read back**, not the one that was clicked —
so a refused write changes nothing on screen: the picker still reads the old level and the button
itself is the retry. The reason went to a notification that dismissed itself after six seconds, and
the screen then read exactly as it had before the press, as though the click had not registered.

That sentence now renders above the input card (the same place, and for the same reason, as the
microphone's notice: it explains a control inside the card), with `role="alert"`, the danger colour,
two lines, and the whole sentence on hover — this one is longer than the other refusals, because a
failed switch also has to say which level did not move, so two lines leave only its beginning and the
rest has to be readable on hover. It stays until the next attempt starts.

## The two pickers are saying two different things

The draft's picker writes through to the Agent's settings, so when it is refused the Agent's default
did not move either — while the click itself read as "this draft's setting" at the moment it was
made. The draft's sentence therefore says so ("the Agent's default is unchanged too"); the Session's
picker only pins this one conversation, so its sentence leaves the Agent out. Both share one entry,
split by a `forAgent` argument.

Which object the sentence belongs to is tracked the same way: the draft page keys it by Agent (a
different Agent no longer draws it), the Session page by Session (switching away and back does not
hang another conversation's failure on this one).

## Details

- `packages/web/src/features/chat/thinking-level-refusal.ts` (new): `thinkingLevelRefused(error,
  forAgent)` — the reason goes through `refusalText` (7.19's rule: an answer the server gave is read
  through its code's own localized sentence, a value this codebase raised itself is shown as it
  wrote it), and `S.chat.thinkingLevelRefused(reason, forAgent)` completes the line.
- `packages/web/src/features/chat/chat-input.tsx`: a new `thinkingRefusal` prop, drawn in the block
  that holds the microphone's notice, above the input card.
- `packages/web/src/features/chat/draft-view.tsx`: the failure branch of `onChangeThinkingLevel` no
  longer goes to a notification but writes `thinkingRefusal` (Agent id + sentence), cleared when the
  next attempt starts; the optimistic write and its rollback are unchanged.
- `packages/web/src/features/chat/chat-page.tsx`: `applyTurnThinkingLevel`'s failure branch is
  collected the same way (Session id + sentence) and handed to the composer only while that Session
  is the one on screen.
- `packages/web/src/lib/strings{,-en}.ts`: one new sentence,
  `chat.thinkingLevelRefused(reason, forAgent)`.

## Tests

- `packages/web/test/thinking-level-refusal.test.ts` (new, 5 cases): a server answer is read through
  its code's own sentence rather than the English wire message; a request that never reached the
  route keeps what it knows; nothing said falls back to the generic text; the draft's sentence names
  the Agent and the Session's does not; both follow the active language.
- `packages/web/e2e/thinking-level-refusal.spec.mjs` (new, real server + real browser, 2 cases): each
  write is stubbed to a 500 (a code the interface has its own copy for, plus an English wire
  message). A refused draft pick puts the sentence above the card, verbatim with "the Agent's default
  is unchanged too", uses the interface's words, leaves the notification region out of it, keeps the
  picker reading the old level and the Agent config on the old level — and **seven seconds later**
  (past the six an error notification lives) it is still there; once the write is allowed, a second
  pick clears it, the picker reads the new level and the config really moved. The second case: a
  refused Session pick draws the same sentence without the Agent, still visible after seven seconds,
  with the picker rolled back; a retry that lands clears it and the Session reads back the pin.

## Compatibility

No interface change, no new dependency, no Project config change. The success path, the mid-chat
"switching costs the cached context" confirmation (#310) and both optimistic writes' rollbacks are
untouched.
