# A Stop that did not reach the server keeps its reason above the composer

- **Date:** 2026-11-17
- **Type:** fix
- **Scope:** `web`, `docs`

[中文](2026-11-17-chat-stop-refusal.zh.md)

**Stop** on the input card is one Session abort request, and the `catch(() => undefined)` behind it
swallowed the failure whole: when the server answered with an error the composer looked exactly as
it had before the press — the same **Stop** button, the run still writing — with nothing anywhere
saying the press had not landed. Not even a notification expired here; the screen read as though the
button had done nothing, and the reader had no way to tell a lost click from a run that would not
stop.

A Stop the server did not take now says why in the slot above the card that a refused send already
occupies: what was pressed (stop this run), that it did not land (the run is still going), and why —
in the interface's own words, never the wire's English. Nothing was stopped, so the same **Stop**
button stays and pressing it again is the retry. The sentence lives and dies with that run: it goes
the moment this Session is idle again, not on a timer. A 404 says nothing: the Session itself is
gone, so the run it asked about went with it, and a sentence would outlive its subject. (The route's
204 is not a refusal either: it says there was no run left to abort, which is the very state this
press wanted.)

## Details

- `packages/web/src/features/chat/message-send-refusal.ts`: new `stopRefusalLine(sessionId, err)`
  returning the same `SendRefusal` shape a refused send uses — `null` on 404 — the rule the API
  tab's Try it applies in `stopFailed`.
- `packages/web/src/features/chat/chat-page.tsx`: `stopRefusal` in its own slot (not in `sendRefusal`,
  because it is the one refusal that stops being true by itself) and cleared when `stream.taskState`
  is idle again; `onStop` no longer swallows the failure but writes the reason into that slot; the
  slot reaches the composer scoped by Session.
- `packages/web/src/features/chat/chat-input.tsx`: a `stopRefusal` prop, drawn above the card next to
  the other refusals (`role="alert"`, `data-testid="stop-refusal"`, danger ink, two lines at most,
  the whole sentence one hover away).
- Copy `chat.stopRefused(reason)`, in both languages.
- Docs: one line in the "While a Task runs" section of `chat.zh.md` / `chat.en.md` (what a Stop that did not reach the server looks like).

## Tests

- `packages/web/test/message-send-refusal.test.ts`, 6 more cases: the sentence says the run is still
  going and speaks the interface's language (never the wire's English); a 404 produces nothing; a
  press that never reached the route keeps what the error had to say; no model is named; it is drawn
  only for the Session it belongs to.
- `packages/web/e2e/chat-stop-refusal.spec.mjs` (new, 2 cases, real server + the repo's mock model,
  with the mock's `background move test` — `sleep 45` in the foreground — keeping the run going):
  the abort POST refused as 500 `internal` → the sentence above the card says the run is still going,
  never carries the wire's English, raises no notification, is still there four seconds later, and
  then the same button lets the abort through and the sentence goes with the idle Session; and a 404
  draws nothing at all while **Stop** stays where it was.

## Compatibility

Front-end state, copy and docs only: no interface, wire format or stored data changed.
