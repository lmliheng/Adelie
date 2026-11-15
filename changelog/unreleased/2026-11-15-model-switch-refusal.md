# A `/model` switch that does not open its new conversation keeps its reason above the input card

- **Date:** 2026-11-15
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-15-model-switch-refusal.zh.md)

A staged `/model` target turns the send button into "open a new conversation on this model and post this
message there". When that is refused (the new conversation cannot be created, its first message cannot be
sent, the model's key is unusable) the draft and the chip are still on the card, so the button pressed a
moment ago IS the retry — yet the reason used to live only in a notification that **dismissed itself after
six seconds**. It is now written on the line **above the input card** — the slot an ordinary send and a
`/agent` handoff already use — and stays until the next attempt.

A desk conversation (an employee's standing session in company mode) needs its own sentence: there `/model`
is not a fork. It **writes the picked model to the employee's chart entry, renews the desk onto it, and only
then posts the message**, so a refusal can land after the write. Hence two sentences: the ordinary one says
"could not open a new conversation on X; this conversation is unchanged", while the desk one says only what
holds in every case — the message was not sent, and the org chart is the record of the model the desk is on
now (the page reloads it as it draws the line).

## Details

- `packages/web/src/features/chat/message-send-refusal.ts` gains `modelSwitchRefusalLine(sessionId, err, model)`
  and `deskModelRefusalLine(sessionId, err, model)`; `PickedModel` carries the chip's display label and the
  upstream id. The reason still comes from the plain send's pair `sendRefusalReason`, so `model_credential_missing`
  is named through the id (its body carries no model), while the sentence itself uses the chip's label.
- `chat-page.tsx`'s `onSwitchModel` clears the previous sentence when an attempt starts; the fork branch's
  `catch` writes `modelSwitchRefusalLine`, the desk branch's writes `deskModelRefusalLine` (the org chart and
  org sessions are still reloaded in that `catch`). Neither raises a notification any more. `modelDisplay`,
  previously defined further down the file, moved above `onSwitchModel` so it can supply the label.
- One sentence pair each for `chat.modelSwitchRefused(model, reason)` and `chat.deskModelRefused(model, reason)`
  (zh/en).
- Docs: a paragraph under "In a new conversation" in `chat.zh.md` / `chat.en.md`, and the employee-model
  paragraph in `company-mode.zh.md` / `.en.md` now says where a refused desk switch leaves things and what to
  read for the truth.
- Left as it was: `askWithPicture` (the reply image's own action bar — the host is inside `packages/ui` and
  needs a slot) and `runCompaction` (`/compact` shares its path with the thinking-level dialog's "compact, then
  switch", so its host has to be decided first).

## Tests

- `packages/web/test/message-send-refusal.test.ts` grows by 8 cases: the fork sentence names the chip's model
  and says the conversation is unchanged, names the model when its key is missing, keeps what a request that
  never reached the route has to say, speaks the active language, and belongs to the conversation the chip was
  staged on; the desk sentence does **not** claim the chart was left alone (no "unchanged", yes to "the message
  was not sent" and "org chart"), names the model when its key is missing, and its English text says no
  "unchanged".
- `packages/web/e2e/model-switch-refusal.spec.mjs` (new, 3 cases, real server + the repo's mock model): a
  refused fork → the sentence above the card, not a notification, still there after seven seconds, draft and
  chip still there, no conversation left behind, and the same button lands in the new conversation once allowed;
  `model_credential_missing` → the sentence names the picked model; a desk conversation (a real organization
  and its real desk session, with the employee PATCH refused) → the sentence says the message was not sent and
  points at the chart, never claiming the conversation is unchanged.

## Compatibility

Front-end state, copy and rendering only: no interface, wire format or stored data changes.
