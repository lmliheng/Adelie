# A draft's first message that could not go out says why under the input card, not in a six-second toast

- **Date:** 2026-11-07
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-07-draft-send-refusal.zh.md)

The new-chat screen (a draft, before any Session exists) makes exactly one write: pressing Send
creates the Session and posts its first task. When either half is refused, nothing is persisted —
an empty Session the first half already created is deleted again — the message and the staged
files stay in the composer, and the Send button is the retry. What the reader got was a
notification over the card that dismissed itself after six seconds: afterwards the screen read
exactly as it had before the press, with the button back to normal and nothing saying why the
message never left.

That sentence now renders under the input card (`role="alert"`, danger colour, two lines, the
whole sentence on hover) and stays until the next attempt starts — the next press is the retry, and
it clears the sentence of the attempt before it.

## Whose words

The reason comes from the value the send threw, by the app-wide rule the confirmation dialogs'
refusal slots and 7.89–7.93 use:

- the server answered → `apiErrorText`, whose code carries the interface's own sentence, with the
  draft's model id for the one copy that needs it (`model_credential_missing` — the response body
  names no model);
- nothing answered (the connection dropped, the request never left) → `refusalText`' rule, keeping
  what the value itself has to say rather than flattening it to the generic text.

## Details

- `packages/web/src/features/chat/first-send-refusal.ts` (new): `sendRefusalReason(err, modelId)`
  picks the reason (the pure part, testable without the page) and `sendRefused(reason)` builds the
  sentence.
- `packages/web/src/features/chat/draft-view.tsx`: the page keeps `sendRefusal`; `onSend` clears it
  when an attempt starts and writes it in the catch instead of raising a toast, and the sentence is
  drawn between the input card and the ownership pills.
- `packages/web/src/lib/strings{,-en}.ts`: one new sentence, `chat.draftSendRefused(reason)`.

**Deliberately unchanged:** the thinking-level picker on the same page still reports a refused
write through a notification — it lives in the shared composer (`chat-input.tsx`) together with the
same family on a Session, so it wants its own round rather than this one. The success path (create,
post, navigate) is untouched, as is every other page's send.

## Tests

- `packages/web/test/first-send-refusal.test.ts` (new, 7 cases): a server answer reads through the
  code's sentence and never the English wire message; the model the draft was aimed at is named for
  a missing credential; a send that never reached the route keeps its own words; a value with
  nothing to say falls back to the generic text; the sentence speaks the active language.
- `packages/web/e2e/draft-send-refusal.spec.mjs` (new, real server + real browser, 2 cases, both
  writes stubbed to a 500 with a code the interface translates plus an English wire message): a
  refused session creation puts the sentence under the card, uses the interface's words, leaves the
  notification region out of it, keeps the composer's text and the Send button enabled — **seven
  seconds later** (past the six an error notification lives) it is still there, and a retry that
  lands navigates into the new conversation with the sentence gone. The second case refuses the
  first task after the Session was created: the same sentence, the draft still on `/chat/new`, and
  that empty Session gone (`GET` answers 404), so resending does not pile them up.

## Compatibility

No interface change, no new dependency, no Project config change. Only the failure path of the
draft's send is affected.
