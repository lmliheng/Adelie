# A Stop that did not reach the server keeps its reason above the subagent's composer

- **Date:** 2026-11-18
- **Type:** fix
- **Scope:** `web`, `docs`

[中文](2026-11-18-subagent-stop-refusal.zh.md)

**Stop** in the agents panel's child composer is one request on the panel's own abort route, and the
`catch(() => undefined)` behind it swallowed the failure whole: a server error left the panel exactly
as it had looked before the press — the subagent still running, the same **Stop** button — with no
word anywhere, not even the six-second notification the main composer's own Stop used to raise.

A Stop the route did not take now says why above that box, in the panel's own words (this line sits
next to the parent conversation's card, so it names *which* run is still going). Nothing was stopped,
so the same **Stop** button stays and pressing it again is the retry; the sentence lives and dies
with that run — it goes the moment the subagent is idle again, not on a timer. A 404 says nothing:
that is the parent Session gone, and the run went with it. (The route's 204 is not a refusal either:
it says there was nothing left to stop, which is the very state the press wanted.)

## Details

- `packages/web/src/features/chat/subagent-send-refusal.ts`: new `subagentStopRefused(err)` returning
  `string | null` — `null` on 404 — the same rule the chat card's `stopRefusalLine` applies. The
  module's header now covers both presses that land on that composer.
- `packages/web/src/features/chat/subagents-view.tsx`: `SubagentComposer` keeps `stopRefusal`, cleared
  when the child's run goes idle (the effect the chat page uses) and on the next press; `onStop` no
  longer swallows the failure but writes the reason into that slot; the line is drawn above the box,
  next to a refused send's (`role="alert"`, `data-testid="subagent-stop-refusal"`, danger ink).
- Copy `subagentPanel.stopRefused(reason)`, in both languages.
- Docs: one line in the Subagents bullet of `chat.zh.md` / `chat.en.md`.
- `packages/web/e2e/mock-llm.mjs`: a "slow subagent test" trigger that hands a subagent a prompt whose
  own turn runs `sleep 45` in the foreground, so the child is still running while the spec presses
  Stop.

## Tests

- `packages/web/test/subagent-send-refusal.test.ts`, 5 more cases: the sentence names the press and
  says the run is still going, in the code's own words and never the wire's English; a 404 produces
  nothing; a press that never reached the route keeps what the error had to say; the generic sentence
  when there is nothing to say; the active language.
- `packages/web/e2e/subagent-stop-refusal.spec.mjs` (new, 2 cases, real server + the repo's mock
  model): the abort POST refused as 500 `internal` → the sentence above the child's box says the
  subagent is still running, never carries the wire's English, raises no notification, is still there
  four seconds later, and takes neither slot the main card owns; then the same button lets the abort
  through and the sentence goes with the idle run. And a 404 draws nothing at all while **Stop** stays
  where it was.

## Compatibility

Front-end state, copy, a test mock and docs only: no interface, wire format or stored data changed.
