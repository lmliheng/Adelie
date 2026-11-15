# A `/agent` handoff that does not get out keeps its reason above the input card

- **Date:** 2026-11-15
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-15-handoff-send-refusal.zh.md)

A staged `/agent` target turns the composer's send button into "hand this draft over to that agent": pressing it
opens a **new** conversation and posts the draft there as its first message. When either half is refused (the
new conversation cannot be created, the first message cannot be sent, this project's model key is unusable)
nothing is written — the empty conversation the first half created is deleted again — and this conversation is
not touched, so the draft, the staged files and the target chip are all still on the card, and the button
pressed a moment ago IS the retry. All the reader used to get was a notification that **dismissed itself after
six seconds**: afterwards the screen read exactly as it had before the press. The reason is now written on the
line **above the input card** — the same slot an ordinary send uses — naming the agent, and stays until the
next attempt starts.

## Details

- `packages/web/src/features/chat/message-send-refusal.ts` gains `handoffRefusalLine(sessionId, err, agent,
  modelId?)`: the same sentence pair a plain send uses (`sendRefusalReason`, so a server answer speaks the
  interface's own words and a request that never reached the route keeps what it knows), with one clause
  naming the agent and saying this conversation was not touched. `modelId` is the project's default model —
  the new conversation is created on it, and `model_credential_missing` names no model of its own.
- `chat-page.tsx`'s `onHandoff` writes that sentence into the existing `sendRefusal` slot instead of raising a
  notification, and clears the previous sentence when a new attempt starts. A success navigates to the new
  conversation, which takes the sentence with it.
- One sentence each in `chat.handoffRefused(agent, reason)` (zh/en).
- `chat.zh.md` / `chat.en.md` gain a paragraph under "Hand off to another agent": a handoff that does not open
  its new conversation writes nothing, says why above the card, and the button is the retry.
- Left as it was: the `/model` switch's own refusal (still a notification) and the composer's `/compact`. They
  read differently — a desk session renews its model instead of opening a conversation — so each gets its own
  round rather than one sentence stretched over all three.

## Tests

- `packages/web/test/message-send-refusal.test.ts` grows by 6 cases: the sentence names the agent and says the
  conversation is unchanged, it is the plain send's sentence with one clause replaced (not a second copy of the
  reason), it names the model the new conversation would have been created on, it keeps what a request that
  never reached the route has to say, it speaks the active language, and it belongs to the conversation the
  chip was staged on.
- `packages/web/e2e/handoff-send-refusal.spec.mjs` (new, 2 cases, real server + the repo's mock model, the
  target agent created through the API, the `/agent` chip staged through the real command): conversation
  creation refused with a code the interface has its own words for → the sentence above the card (measured to
  end above the textarea's top edge), not a notification, **still there after seven seconds**, the draft and the
  chip still there, and no conversation left behind; allowed again → the same button lands in the new
  conversation. Second case: `model_credential_missing` → the sentence names the project's default model, one
  line only.

## Compatibility

Front-end state and rendering only: no interface, wire format or stored data changes.
