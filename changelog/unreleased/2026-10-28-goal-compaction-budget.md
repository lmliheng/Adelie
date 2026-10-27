# Goal budgets count usage from before a mid-round compaction

- **Date:** 2026-10-28
- **Type:** fix
- **Scope:** `plugins`
- **Breaking:** no

[中文](2026-10-28-goal-compaction-budget.zh.md)

Ported from PenguinHarness `eb3edfec` (`#1355`).

Goal mode's stop hook added up a round's token usage from the newest Trace file only. When a
context compaction rotated the log mid-round, everything the round had already spent went with
the older file: a round that used 110 uncached tokens against a budget of 100 was recorded as 20
and stayed `active`, so the wrap-up round never started and the goal kept working past the budget
it was given.

The hook now reads the Session's preceding Trace shards back to the round's own injected input
before counting. Earlier rounds are not charged twice — the window still starts right after the
last round input, it just no longer starts at the beginning of a shard. A shard that is missing,
unreadable or belongs to another Session ends the lookup and keeps the usage that is available:
an incomplete count is a better answer than counting an unrelated run's tokens.

## Details

- `plugins/goal/hooks/lib.mjs`: new `readRoundRecords(file, sessionId, records)`. It parses the
  shard index off the Trace file name (`<sessionId>_<NNN>.jsonl`), then walks back one shard at a
  time — pad-starting the index to the writer's three digits — until a shard contains a round
  input or the walk reaches `_001`. Each predecessor must announce the same `session_id` in its
  `session_meta`, otherwise the walk stops. The collected shards are flattened and handed to the
  unchanged `lastRoundRecords()`, which keeps the "start after the last round input" rule in one
  place. Trace names the hook does not recognize fall back to single-file accounting.
- `plugins/goal/hooks/stop.mjs`: uses `readRoundRecords(tracePath, sessionId, records)` instead of
  `lastRoundRecords(records)`.
- `plugins/goal/plugin.json`: version `2026.09.29.1` → `2026.10.28.1`, so an Agent that already
  has the plugin installed refreshes its hooks. Upstream bumps `hooks.version` in
  `package.json`; this tree keeps the plugin version in `plugin.json` and has no such block, so
  the bump lives there.
- `packages/core/test/goal-hooks.test.ts`: the fixture writer takes a target file; the old
  "counts the whole file when a compaction rotated the input away" case becomes a four-name table
  (current shard, a legacy name, another Session's shard, an out-of-range index) asserting the
  same fallback, plus three new cases — a budget spread over three shards wrapping up at
  `tokens_used: 110` and then stopping at `115`; a later round whose input sits in a previous
  shard counting only what follows that input; and a missing or foreign predecessor shard keeping
  the current shard's 20 tokens.

## Compatibility

- No on-disk change: Trace and `GOAL.json` formats, the budget semantics and the single final
  wrap-up round are exactly as before. Only the usage a round is charged with changes — for a
  round that spanned a compaction it is now the usage that actually happened.
