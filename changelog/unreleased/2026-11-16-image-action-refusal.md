# A reply picture's refused layer split keeps its reason under the picture's own bar

- **Date:** 2026-11-16
- **Type:** fix
- **Scope:** `ui`, `web`

[中文版](2026-11-16-image-action-refusal.zh.md)

"Split into layers" on a reply picture in the lightbox is **a message to the Agent** (the App has no image
endpoint of its own — the model, the credential and the file all live on the Agent's side), so a refusal
writes nothing at all: the conversation is unchanged, the picture is still there, and the button that was
pressed has not moved — it IS the retry. Until now the press closed the overlay before running, so the reason
survived only as a notification that **dismissed itself after six seconds** over the top of the page: six
seconds later the screen read as it had before the press, with neither the picture nor the button that failed
still on it. That is the most expensive place this repo's rule — a refusal's reason must not live only in a
toast — has been broken.

The lightbox now **holds the overlay open for an action that answers**: when `onSelect` returns a promise the
button reads as busy, the overlay stays, and the sentence the promise resolves to is drawn **directly under
the capsule bar** (`role="alert"`, danger tone, two lines at most, the whole sentence on hover). Resolving
nothing, or rejecting, finishes the press and closes the overlay as before. The sentence is the caller's: here
it is still the plain send's `sendRefusalReason`, and the copy says the message was not sent — it claims
nothing about the Workspace, because the turn never left.

## Details

- `packages/ui`'s `LightboxAction.onSelect` may now return `Promise<string | null | undefined>`: a non-empty
  string is that press's refusal (drawn under the bar, overlay kept); an empty answer means the work landed
  and the overlay closes; a plain `void` action behaves exactly as before. The button is `disabled` while the
  answer is outstanding, so the same turn is never delivered twice.
- The decision lives in a pure module, `src/components/overlays/lightbox/action-press.ts`
  (`pressLightboxAction`): `pending` first (only for an answering action), then exactly one `done` /
  `refused`. A rejected promise counts as finished — wording the failure is the caller's job, since only it
  knows what the press meant.
- Closing the overlay (Esc, the backdrop, the close glyph) drops the previous refusal with it: a second visit
  is a fresh look at the picture, not a reminder of what failed there before.
- `packages/web/src/lib/image-actions.ts`'s `ask` returns `Promise<string | null>`; `chat-page.tsx`'s
  `askWithPicture` no longer raises a toast and hands the sentence to the picture's bar instead.
- One sentence pair for `chat.imageAction.refused(reason)` (zh/en): "couldn't split this picture into layers,
  and no message was sent: …".

## Tests

- `packages/ui/test/action-press.test.ts` (new, 7 cases): a plain action runs and reports `done`, the action
  runs before it is reported, an answering action reports `pending` and then splits on its answer (empty, a
  refusal sentence, an empty string, a rejected promise, a promise-like).
- `packages/ui/test/lightbox.test.ts`: the old source scan for "close first, then run" is rewritten for the new
  contract — every press goes through `pressLightboxAction`, and the bar may not go back to closing first.
- `packages/web/test/image-actions.test.ts` grows by 1: an action hands the refusal sentence back unchanged.
- `packages/web/e2e/image-action-refusal.spec.mjs` (new, 1 case, real server + the repo's mock model): with
  `POST …/tasks` stubbed to 500 `internal` (carrying an English wire message) → the overlay is still up, the
  sentence sits under the action bar (measured below the button), it does not contain the wire message, the
  notification region has no buttons, one request was made, and the line is still there after seven seconds;
  with the stub lifted, the same button → the overlay closes and `使用技能：seedream` / "拆成图层（--layers）"
  land in the conversation; reopening the picture does not bring the earlier refusal back.

## Compatibility

Front-end action contract, state and rendering only: no interface, wire format or stored data changes. The
new return value on `LightboxAction` is optional, so every existing caller — a page that hands in no actions,
or plain ones — behaves as it did.
