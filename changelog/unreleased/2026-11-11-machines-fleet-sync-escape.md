# A fleet push that cannot even start is recorded with its Project and its step

- **Date:** 2026-11-11
- **Type:** fix
- **Scope:** `server`
- **Breaking:** no

[中文版](2026-11-11-machines-fleet-sync-escape.zh.md)

Every write to a Project's model config — the whole-table PUT, the default switch, a key minted
through a platform's OAuth flow — ends in `machines.syncModelsEverywhere(projectId)`, fired and
forgotten: the person editing a key should not wait for a set of ssh tunnels. A plugin change rides
the same push.

That push was already best effort for each machine (the connect log carries a sync's own words),
but the reads in front of those machines were not inside that catch: `list()` asks every alias in
the ssh config for the session held to it, and one transport that throws there rejected a promise
nobody holds. The process filed it as a bare `unhandled_rejection` — a record that named neither
the Project whose edit asked for the push nor the step that failed, in a table where the Project
column is what a reader filters by.

The push now catches its own escape and reports it: `code` is `fleet_sync_failed`, and the Project
is attached as the record's context. `MachinesEffects.recordError` gained the two fields — it used
to carry only the error, so every such failure in this file was one indistinguishable class — and
the standing-intent timer passes its own `machines_reconnect_failed` through the same port, which is
the code the boot path in `platform.ts` already used for that fault. Per-machine failures stay
silent, exactly as before: those have the connect log, and a machine that will not take a credential
is not the fleet push failing to start.

## Details

- `packages/server/src/machines/service.ts`: `syncModelsEverywhere` wraps its body, including the
  listing and the row reads that were outside the per-machine `try`, and records an escape through
  `#effects.recordError(err, "fleet_sync_failed", projectId)`; `recordError` is now
  `(err, code, projectId?) => void`; the timer's call passes `"machines_reconnect_failed"`; the
  module's wiring goes through the new pure `machinesErrorRecord(err, code, projectId)`, which fills
  in `source: "process"` and the Project context only when one asked for the work.

## Tests

- `packages/server/test/machines-fleet-sync.test.ts` (new, 5 cases): a push whose machine list throws
  is recorded as `fleet_sync_failed` under the Project that asked and its promise still resolves; the
  same fault with the promise discarded (the shape all three real callers have) leaves nothing
  unhandled; a connected machine whose own sync fails stays silent; a push reaching no connected
  machine records nothing; and the record shape carries the Project only when there is one.
- Counter-proof: with the method reverted to its previous body, the two escape cases fail — the
  discarded-promise one as an **unhandled rejection** raised from `#liveSession` through `list()`.

## Compatibility

No interface change on the wire, no new dependency, no Project config change. The push's behaviour
when it succeeds, and its per-machine best effort, are unchanged; a real server's default switch and
whole-table PUT were run against a fresh data root and left no error record and no unhandled
rejection behind.
