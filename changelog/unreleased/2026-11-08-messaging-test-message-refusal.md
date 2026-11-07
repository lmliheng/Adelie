# A refused test message in the messaging card says why, in the card, not in a six-second toast

- **Date:** 2026-11-08
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-08-messaging-test-message-refusal.zh.md)

The messaging card's "send test message" button puts one fixed line into the chat the connection
already knows, and writes nothing: the card looks exactly as it did before the press whatever the
outcome. A refused message therefore used to leave the one sentence that explained it in a
notification that dismissed itself after six seconds, while everything a reader would act on — the
connection's state, the bot's membership in the chat, the platform's reply window, the last
delivery failure — is on the rows right above it.

That sentence now renders under the row of two probe buttons with `role="alert"`, the danger colour,
two lines and the whole sentence on hover, and it stays until the next press or a channel switch:
the button is the retry. It is a slot of its own rather than the probe's: "the credentials do not
connect" and "the chat did not take the message" are different facts, answered by different buttons.

The line also distinguishes what it can and cannot know. When the route answered — the platform
refused the send, no chat is known any more, or the request was rejected — the message did not go
out, and the platform's own words are kept for a refused send (its detail is the actionable half;
the code's sentence merely repeats the button). When the request never came back with an answer, the
server may well have delivered it and only the reply was lost: that shape says the delivery is
unconfirmed, because claiming otherwise would send a second copy into a chat that already holds the
first.

## Details

- `packages/web/src/features/messaging/messaging-test-message-refusal.ts` (new):
  `messagingTestMessageRefusal(error)` — a `<channel>_send_failed` answer keeps the platform's
  detail, everything else goes through `refusalText` (7.19's rule: an answer the server gave is read
  through its code's own localized sentence rather than the English wire message), and a request
  that never answered gets `S.messaging.testMessageUnconfirmed` instead of
  `S.messaging.testMessageRefused`.
- `packages/web/src/features/messaging/messaging-binding-editor.tsx`: the hook gains
  `testMessageRefusal` (cleared when the next press starts, when the channel is switched, and when
  the editor is pointed at another Session — editing the fields does not clear it, because the
  message goes through the stored binding rather than through the draft); the send's failure branch
  no longer goes to a notification but writes it; `MessagingBindingBody` draws it after the probe's
  line, in the same block under the button row.
- `packages/web/src/lib/strings{,-en}.ts`: two new sentences, `messaging.testMessageRefused(reason)`
  and `messaging.testMessageUnconfirmed(reason)`.

## Tests

- `packages/web/test/messaging-test-message-refusal.test.ts` (new, 7 cases): the platform's own words
  survive a refused send (and the code's generic sentence is not used instead); a send failure with
  no detail falls back to that sentence; a `no_chat` and a rejected request read their code's
  localized sentence rather than the English wire message; a request that never answered says the
  delivery is unconfirmed instead of "not sent"; nothing to say falls back to the generic text; both
  languages.
- `packages/web/test/messaging-binding-editor.test.ts` (+1 render case): the line is drawn under the
  button row, after the probe's own line and before the credential fields, with the whole sentence
  on hover — and with nothing refused the card draws no alert.
- `packages/web/e2e/messaging-test-message-refusal.spec.mjs` (new, real server + real browser): the
  send route is stubbed (the row dialog's two buttons need a connected binding with a known chat, so
  the `GET …/messaging` read is supplied too; no request leaves the machine). A refused send puts the
  sentence in the card, verbatim, once, in the platform's words, leaves the notification region out
  of it, and **seven seconds later** it is still there with the button pressable again. The second
  case: the same button once the send is allowed clears the sentence and pops the ordinary "test
  message sent" toast, with both requests recorded. The third: a request that never answers reads
  the unconfirmed sentence and never claims the message did not go out.

## Compatibility

No interface change, no new dependency, no Project config change. The success path, the probe's own
refusal, the save's refusal and the enable switch's refusal are untouched.
