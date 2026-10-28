# A subagent lands on the `run_subagent` call that spawned it

- **Date:** 2026-10-28
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-28-subagent-card-binding.zh.md)

Ported from PenguinHarness `3fa746b2` (`#1107`).

A child session used to be placed on "the latest allowed `run_subagent` card that has no child yet",
which is only right while one call runs at a time. Several calls at once could give a child another
call's card: the card showed the wrong description, took the wrong thinking level as its fallback,
and the transcript chip next to a card named the other conversation.

The child's first model message is the opening prompt its spawning call handed it, verbatim (live
and in a spliced Trace alike), so it now settles the binding: the child moves onto the card whose
prompt that is, with the `agent_id`, `model_id` and `provider` the child's `session_meta` records
— inherited parent values included, so an inherited self-spawn cannot capture an explicitly chosen
reviewer or another model just because the prompts match. When missing metadata leaves different
selectors ambiguous, or the child was bound standalone, the positional binding stands; a denied
call never takes a child.

No message protocol, wire record or stored data changes: the reducer only reads the child's
existing `session_meta` and opening user-text records.

## Details

- `packages/web/src/lib/omni/stream-model.ts`: `StreamModel.unconfirmedSubagents` marks children
  bound by position before their opening prompt arrived; the first model message routed into that
  child moves it with `moveToSpawningCard`, which picks the card through `spawningCard` (prompt +
  resolved identity, earliest still-running or else latest finished among identical calls) and
  swaps with an unconfirmed child already sitting there.
- `packages/web/test/agent-topology.test.ts`: four cases — mixed inherited/explicit agent, model
  and provider with the explicit child arriving first, plus an ambiguous match without parent
  metadata — alongside the existing parallel-launch, background-launch, denied-call and
  history-replay scenarios.

## Compatibility

- No dependency, API, wire-protocol or stored-data change. A conversation with one call at a time
  binds exactly as before.
