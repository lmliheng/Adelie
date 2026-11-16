# A "compact, then switch" that cannot start keeps the question and its reason in the card

- **Date:** 2026-11-16
- **Type:** fix
- **Scope:** `web`, `docs`

[中文版](2026-11-16-thinking-switch-compact-refusal.zh.md)

Changing the thinking level mid-conversation asks first (issue #310): **compact, then switch** (the
recommended, cheap path), **switch anyway**, or **cancel**. That first press asks the server to start a
compaction, and the server can refuse it — no context compaction configured for this agent, no finished
conversation turn yet, just compacted, a Task already running. A refusal did nothing at all: no compaction,
no switch (the level the reader picked was never pinned), and yet the card **closed** and the pick was
released on the next pass, so the level switched anyway while the reason lived in a notification that
**dismissed itself after six seconds**. A reader who chose the cheap path got the expensive one, silently.

Now the card stays open on the same pick with the sentence under its own question — "could not compact the
context first — the thinking level is still 〈x〉: 〈why〉" — so **switch anyway** is a choice made knowing
what it costs, and **cancel** really leaves everything as it was. A compaction that *did* start and then
failed or was aborted keeps its previous treatment: the pick is still applied and a notice says so (that one
is about order, not a veto).

## Details

- `packages/web/src/features/chat/thinking-level.ts`: `StagedThinkingSwitch`'s open card gains an optional
  `refusal`, and the `"settle"` phase plus `heldThinkingSwitch`'s `notice: "none"` are gone — nothing
  releases the pick behind a card that is still asking.
- `chat-page.tsx`'s `compactThenThinkingSwitch` passes an `onRefused` writer that returns the card to
  `ask` on the same level with the sentence (it only touches the state it staged itself, so a pick from
  elsewhere still wins), and the "compacting" notification now goes out only once the server really accepted
  the request.
- `thinking-level-refusal.ts` gains `compactBeforeSwitchRefused(level, err)`: the reason comes from the same
  `sendRefusalReason` the `/compact` command uses, so the same refusals say the same words on both surfaces,
  and the level named is the one the trigger and the transcript still show.
- One sentence pair for `chat.thinkingSwitchCompactRefused(still, reason)` (zh/en).
- Docs: the thinking-level paragraph in `chat.zh.md` / `chat.en.md` no longer claims the level always
  switches; it now separates "started but did not finish" from "never started".

## Tests

- `packages/web/test/thinking-level-refusal.test.ts` +3: the level still in force and the code's own reason,
  a request that never reached the route keeps what it knows, and the sentence speaks the active language.
- `packages/web/test/thinking-level.test.ts`: the `"settle"` case is replaced by "the card still carrying a
  refusal holds the pick" — the branch that used to release it.
- `packages/web/e2e/thinking-switch-compact-refusal.spec.mjs` (new, 2 cases, real server + the repo's mock
  model): the compaction stubbed to 500 `internal` → the card is still on screen with the sentence inside it
  (never the wire's English), no notification, the trigger still reads the old level, no `PATCH` was sent,
  still there after seven seconds, and **switch anyway** then pins "high"; and cancel after a refusal changes
  nothing and the next pick asks afresh without the previous sentence.

## Compatibility

Front-end state, copy and docs only: no interface, wire format or stored data changes. This supersedes the
"the dialog deliberately keeps its notice" note in `2026-11-16-compact-refusal`.
