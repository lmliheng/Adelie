# A refused Stop keeps its reason under the button that is still the retry

- **Date:** 2026-11-17
- **Type:** fix
- **Scope:** `web`, `docs`

[中文版](2026-11-17-api-try-stop-refusal.zh.md)

The API tab's **Try it** stops a run through the Session's abort route, and the catch behind that press raised
a notification that dismissed itself after six seconds: a 500 left the panel exactly as it looked before the
press — the run still going, the same **Stop** button in the same place — with nothing anywhere saying the
press had not landed. Six seconds later even the notification was gone, and the screen read as though nothing
had been pressed at all.

Now a Stop the server did not take draws its reason under that same button: what was asked (stop this run),
that it did not take effect (the run is still going), and why — in the interface's own words, never the wire's.
The button stays, and pressing it again really is the retry. The sentence stays while the run keeps writing
rows and goes when the stream ends, so it never outlives the run it is about. A 404 says nothing: the Session
itself is gone, so the run is over too, and a sentence about a stop that no longer has a subject would outlive
it.

## Details

- `packages/web/src/features/agents/api-try-log.ts`: `TryState` gains `stopRefusal`, the reducer gains
  `stopRefused` (and clears the sentence on `start` and on `ended`), and the new `stopFailed(err)` returns the
  action that says it — `null` for 404 — the same shape `approvalAnswerFailed` has for refused decisions.
- `packages/web/src/features/agents/api-try-panel.tsx`: the sentence is drawn under the input's button row
  (`role="alert"`, `data-testid="api-try-stop-refusal"`, danger colour, two lines at most, the whole sentence
  one hover away), and `onStop` dispatches it instead of raising a notification.
- One sentence pair for `agent.apiTryStopRefused(reason)` (zh/en).
- Docs: the "Try it" section in `agent-api.zh.md` / `agent-api.en.md` says what a stop that could not reach
  the server looks like.

## Tests

- `packages/web/test/api-try-log.test.ts` +2: the sentence reads in the interface's own words (never the wire
  English), sits under the Stop button that is still up, survives further payloads, clears when the stream ends
  and on a new run; and a 404 yields no action at all.
- `packages/web/e2e/api-try-stop-refusal.spec.mjs` (new, 2 cases, real server + the repo's mock model, the
  mock's slow prompt keeping the run under way): the abort POST stubbed to 500 `internal` → the sentence is
  under **Stop**, says the run is still going, never the wire's English, no notification, still there four
  seconds later, then the same button lands the abort and the sentence goes with the stream's `run.done
  aborted`; and a 404 leaves the panel silent.

## Compatibility

Front-end state, copy and docs only: no interface, wire format or stored data changes.
