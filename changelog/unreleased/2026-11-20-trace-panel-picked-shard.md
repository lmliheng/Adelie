# A layout change keeps the Trace panel on the shard the reader had picked

- **Date:** 2026-11-20
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-20-trace-panel-picked-shard.zh.md)

A Session that compacted holds one Trace file per compaction shard, and the Trace panel's pill row
opens on the newest one. A reader who picked an older shard and then crossed the breakpoint (the wide
window's right dock ↔ the narrow merged surface) came back on the newest shard — the pick was panel
state and went with the body that was torn down. Measured in a browser on a two-shard Session: `#001`
picked at 1280 came back as `#002` at 390, and stayed `#002` crossing back.

The picked shard is part of the panel's place now, alongside the open rounds and the offset, so it
travels with the rest under the same rule: **only a layout change brings it back.** A tab closed and
reopened, or a conversation switched away from and back to, still opens on the newest shard.

## Details

- `packages/web/src/features/traces/trace-place.ts`: `TracePlace` gains `fileIndex` — the shard the
  reader had picked, or `null` when it is the one the panel opens on (the newest). Keeping the default
  as `null` rather than as a number means the existing "a place that is where the panel opens by
  itself is dropped rather than kept" rule still needs no listing to decide.
- `packages/web/src/features/traces/trace-panel.tsx`: the record seeds the pill selection on mount
  (`arrived.fileIndex`), and an effect keeps the record in step with the selection and the listing —
  the selection is recorded as `null` while it *is* the newest file, so picking the newest back leaves
  a place that the drop rule can still throw away. The listing is a dependency because the default
  moves when a newer shard appears while the reader stays where they were; a pick that vanished is
  left to `activeTraceFile`'s fallback, exactly as before.

## Tests

- `packages/web/test/trace-place.test.ts` (+1 case, 7 total): a place that only picked another shard
  is kept, and picking the newest back drops it.
- `packages/web/e2e/trace-place-across-layout.spec.mjs` (+1 case, 4 total): a Session with two shards
  (the second is a copy of the first in the same date directory — the mock model cannot drive a real
  compaction inside a spec), the older shard picked, crossed 1280 → 390 → 1280 — `#001` on both
  sides. Read back through the per-file export link, which follows the selection.
- Counter-proof with the same spec against the pre-change build: 1 failed — the narrow side read
  `#002` while `#001` was picked; the other three cases pass before the change too.
- Two-state probe on a real server: after — opened on `#002`, picked `#001`, `#001` at 390 and again
  at 1280; before — the same pick came back as `#002` on both sides.

## Compatibility

Frontend state only: no interface, wire format or stored data changes. The place lives in memory, so a
reload opens the panel on the newest shard (same as before this change).
