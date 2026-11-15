# A message that does not get out of an existing conversation keeps its reason above the card

- **Date:** 2026-11-15
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-15-session-send-refusal.zh.md)

Press send in a conversation that already has messages, and if the message does not get out (the network
dropped, the server refused, this model's key is unusable) nothing else on screen changes: the text, the
attachments and the send button all stay, so pressing it again is the retry. All the reader used to get was a
notification that **dismissed itself after six seconds**; afterwards the screen read exactly as it had before
the press — the press looked like it never happened. The reason is now written on the line **above the input
card** (danger colour, two lines, the whole sentence on hover) and stays there until the next attempt starts.

## Details

- New `packages/web/src/features/chat/message-send-refusal.ts`: `SendRefusal` (which conversation, and the
  sentence), `sendRefusalLine(sessionId, err, modelId)` to compose it, and `sendRefusalShown(refusal,
  sessionId)` to decide whether it is drawn right now. The words are the draft screen's own for a first
  message, so both screens share one rule (`sendRefusalReason`) and one sentence.
- All three send paths in `chat-page.tsx` go through it: the task (`onSend`), the queued follow-up while a run
  is going (`onQueueFollowUp`) and a steering message (`onSteer`, where 409 is not a refusal — it means the run
  had already ended and the input area delivers the whole draft as this turn's task). Each attempt clears the
  sentence first and a success leaves nothing; it is stored per Session, so opening another conversation does
  not carry it along.
- `chat-input.tsx` takes an optional `sendRefusal` and draws it in the row above the card, next to the thinking
  level's and the permission preset's refusals (all three explain a control inside the card) — the send button
  itself is one line below it.
- One sentence each in `chat.sendRefused(reason)` (zh/en); the key was renamed from `draftSendRefused` to
  `sendRefused` because the two screens share it now, and the name speaks of the message, not the page. Nothing
  else referenced the old key.
- `chat.zh.md` / `chat.en.md` gain a paragraph under "Send a message": the reason stays above the card and the
  button is the retry.

## Tests

- `packages/web/test/message-send-refusal.test.ts` (new, 10 cases): which Session the sentence belongs to, a
  server answer read through the interface's own sentence (naming the model when the key is missing), a send
  that never reached the route keeping what it knows, the generic text when the value has nothing to say, the
  active language, and the same words as the draft screen; plus "drawn for its own Session only, not for
  another, and not after the last attempt went out".
- `packages/web/e2e/session-send-refusal.spec.mjs` (new, 2 cases, real server + the repo's mock model): the task
  POST refused → the sentence above the card (measured to end above the textarea's top edge), not a
  notification, the text kept, the button still enabled, **still there after seven seconds**; allowed again →
  the same button sends it and the sentence goes. Second case: another code on the next attempt → the sentence
  becomes that reason, **one line only**, the text still there.

## Compatibility

Front-end state and rendering only: no interface, wire format or stored data changes.
