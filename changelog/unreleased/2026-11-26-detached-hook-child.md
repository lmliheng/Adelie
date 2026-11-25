# A stop hook's detached Session no longer draws an agent row in the conversation

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-26-detached-hook-child.zh.md)

After a long Task, an agent row ("General Agent" and a short id) could appear under the final
reply, and clicking it opened the agent panel, which said the Session had no subagents.

The row was the detached Session a stop hook spawns. When a stop hook answers with a subagent, the
hook loop writes the child's Session id into the `hook` event and then streams the child's
`session_meta` behind it, so a host can register that Session — the parent's Trace keeps no
subagent pointer to it beyond that. The Web App's stream model created a nested model for any
unknown origin head and, finding no open `run_subagent` card to bind it to, appended a standalone
subagent item — the row.

The stream model now records the Session id a stop hook event names and drops records whose first
origin hop is that Session, so no row is drawn and no nested model is opened.

## Details

- `packages/web/src/lib/omni/stream-model.ts`: `StreamModel.detachedChildren` (filled by
  `handleEvent`'s new `hook` case from a `stop` event's `output.session_id`) and a check at the top
  of `pushMessage`'s origin branch, before `routeNested`.
- `packages/web/test/stream-model.test.ts`: one case pushing the record sequence a stop hook's
  answer produces — the `hook` event, then the child's `session_meta` with its origin — and
  asserting no `subagent` item and no entry in `subagents`.

## Compatibility

The Web App only; the server-side registration of the child Session is unchanged, and the parent's
Trace is neither rewritten nor read differently.

## Note

A hook child inherits the run's approval callback: under an approval mode that asks, its tool calls
wait for an approval no surface in the Web App shows. That predates this change and is left as is.
