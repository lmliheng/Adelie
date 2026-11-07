# A refused Save in the messaging card says why, in the card, not in a six-second toast

- **Date:** 2026-11-07
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-07-messaging-save-refusal.zh.md)

The messaging card's Save persists the selected channel's credentials and writes nothing
optimistically: while the request is in flight the form keeps every value that was typed, the saved
baseline it is compared against does not move, and it is the **success** answer that pops the
"saved" toast. A refused write therefore left a form that looked exactly as it had before the
press — still unsaved, no success toast — with the only explanation in a notification that
dismissed itself after six seconds. Whoever was looking at the button rather than at the
notification region was left with a form that still read "unsaved" and no reason for it, while the
credential the server had just rejected is a field on that same form.

That sentence now renders at the end of the card with `role="alert"`, the danger colour, two lines,
and the whole sentence on hover, and it stays until the next save starts or the channel is switched:
Save itself is the retry. The two hosts place Save differently — the session-row dialog keeps it in
its footer, the conversation's Messaging panel keeps it under the form — so the slot lives at the
end of the shared body, which is above Save in both, rather than being duplicated per host.

## Details

- `packages/web/src/features/messaging/messaging-save-refusal.ts` (new): `messagingSaveRefusal(error)`
  — the reason goes through `refusalText` (7.19's rule: an answer the server gave is read through
  its code's own localized sentence rather than the English wire message, a value this codebase
  raised itself is shown as it wrote it, and anything with nothing to say falls back to the generic
  text), and `S.messaging.saveRefused(reason)` completes the line.
- `packages/web/src/features/messaging/messaging-binding-editor.tsx`: the hook gains `saveRefusal`
  (cleared when the next save starts, when the channel is switched, and when the editor is pointed
  at another Session); Save's failure branch no longer goes to a notification but writes it, and
  `MessagingBindingBody` draws it as its last element. Validation failures keep answering through
  `fieldErrors` — the fields that block the save name themselves, and saying it twice would read as
  two problems.
- `packages/web/src/lib/strings{,-en}.ts`: one new sentence, `messaging.saveRefused(reason)`.

## Tests

- `packages/web/test/messaging-save-refusal.test.ts` (new, 5 cases): a server answer is read through
  its code's own sentence rather than the English wire message (including a 409 whose code the
  interface has its own copy for); an error this codebase raised keeps its message; nothing to say
  falls back to the generic text; both languages.
- `packages/web/e2e/messaging-save-refusal.spec.mjs` (new, real server + real browser, 3 cases): the
  write is stubbed to a 500 (a code the interface has its own sentence for, plus an English wire
  message). A refused save in the row dialog puts the sentence in the card, verbatim, once, in the
  interface's words, leaves the notification region out of it, and **seven seconds later** it is
  still there with the edited field untouched and Save still pressable. The second case: the same
  button, once the write is allowed, clears the sentence and pops the ordinary saved toast, with
  both request bodies recorded. The third travels the other host — the conversation's Messaging dock
  panel — and checks that the sentence sits **above that panel's own Save**, which is what the
  shared slot at the end of the body buys.

## Compatibility

No interface change, no new dependency, no Project config change. The success path, the enable
switch's own refusal, the credential probe's refusal and the "send test message" path are untouched.
