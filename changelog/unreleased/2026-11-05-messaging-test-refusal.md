# A messaging credential probe that did not get through says why under its button, not in a six-second toast

- **Date:** 2026-11-05
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-05-messaging-test-refusal.zh.md)

The messaging card's "test connection" button runs the selected channel's current — still unsaved —
values through the server's credential probe, which saves nothing. When the probe was refused
(Telegram rejecting the token, a Feishu base domain that does not dial, WeChat's stored bot token
gone stale), the card looked exactly as it did before the press while the reason arrived as one
notification that dismissed itself after six seconds — and the App ID, the secret and the base
domain that sentence is about are the fields right below it.

That sentence now sits under the probe buttons (`role="alert"`, danger colour, two lines with the
whole text on hover) and stays until the form is edited, the channel is switched or the next probe
starts — the same button is the retry. A probe that *connects* keeps its toast (the latency,
Telegram's bot name and its Group Privacy caveat): that outcome leaves nothing behind to explain.
A request that never reached the route now reads its code's own localized sentence instead of the
server's English wording, the rule the app's other refusal slots already follow.

## Details

- `packages/web/src/features/messaging/messaging-test-refusal.ts` (new): `messagingTestRefusal(...)`
  — the pure decision, so which sentence appears is in one place and testable without the card.
- `packages/web/src/features/messaging/messaging-binding-editor.tsx`: the hook gains a `testRefusal`
  state, written by the probe's failed branch (which used to `toastError`) and cleared by a form
  edit, a channel switch, a session swap and the start of the next probe; the card renders it below
  the two probe buttons, above the gating hint. The four per-channel probe calls collapse into one
  answer shape, and only the connecting branch differs (Telegram's notices stay as they were).

## Tests

- `packages/web/test/messaging-test-refusal.test.ts` (new, 6 cases): a connecting answer leaves
  nothing; the platform's detail is carried verbatim; no detail falls back to the generic sentence;
  a failed request reads through `refusalText` (not the wire message); a client-raised error keeps
  its message; the active language is the one used.
- `packages/web/test/messaging-binding-editor.test.ts`: one case for the rendered card — the line
  appears once, between the probe button and the credential fields, bounded and with the whole
  sentence on hover, and nothing when no probe was refused.
- `packages/web/e2e/messaging-test-refusal.spec.mjs` (new, real server, real browser): bind Feishu
  to a conversation, stub the probe route. A refused answer draws the line and no notification, and
  it is still there **seven seconds later**; editing a field drops it and the retried probe (now
  connecting) carries the edited value and toasts its numbers; a 500 on the route draws the code's
  own sentence.

## Compatibility

No interface change, no new dependency, no Project config change. The other button beside the probe
("send test message") keeps its toast: what its failure asks the reader to change lives in the chat
platform, not in a field on this card.
