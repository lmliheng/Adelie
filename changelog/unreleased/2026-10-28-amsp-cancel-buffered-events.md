# A cancelled AMSP stream stops at once, buffered events included

- **Date:** 2026-10-28
- **Type:** fix
- **Scope:** `amsp`
- **Breaking:** no

[中文](2026-10-28-amsp-cancel-buffered-events.zh.md)

Ported from PenguinHarness `ca7114a2` (`#1326`).

`readSse`/`sseData` only looked at the abort signal after pulling a chunk from the network. A caller
that aborts from its own loop body — the loop runs while the generator is suspended at `yield` — was
therefore not seen until the next chunk arrived, and everything already parsed out of the current
chunk was still dispatched. A `[DONE]` buffered behind the last event ended the read quietly, so
`AgentClient` reported a run the caller had cancelled as `completed`, and the events after the abort
reached the caller anyway.

The signal is now checked right after each event is dispatched. The next read rejects with the
caller's own abort reason before another buffered event is handled, and `AgentClient` checks the
signal once more where its read loop ends without an error: a cancelled run is never reported as one
that completed. No constructor, wire record, on-disk format or endpoint changes; a stream that is
read to its end behaves exactly as before.

## Details

- `packages/amsp/src/sse.ts`: after `yield event`, `if (signal?.aborted) throw signal.reason` —
  the check next to `reader.read()` cannot see an abort that happens while the generator is
  suspended, which is exactly when a caller's loop body runs.
- `packages/amsp/src/client.ts`: `AgentRun.#drive` checks `control.signal.aborted` after the read
  loop, before `collector.result()` — the buffered `[DONE]` ends the loop with no error at all, so
  the existing `catch` never saw it.
- `packages/amsp/test/sse.test.ts`: two abort cases (an abort between two events of one chunk, and
  one before a buffered `[DONE]`), plus a contract guard for an abort after the event at the end of
  the body.
- `packages/amsp/test/client.test.ts`: a run whose chunk carries `run.done` + `[DONE]`, aborted in
  the loop body — the iteration and `result()` both reject with `signal.reason`.

## Compatibility

- No dependency, API, wire-protocol or stored-data change. A run whose signal aborts after the
  stream finished normally is still not undone by it; only a cancellation that lands before the
  stream ends now takes precedence over the outcome it happened to reach.
