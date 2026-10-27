# Leaving a model stream cancels the upstream request

- **Date:** 2026-10-28
- **Type:** fix
- **Scope:** `core`
- **Breaking:** no

[中文](2026-10-28-llm-stream-cleanup.zh.md)

Ported from PenguinHarness `aff7ee37` (`#1354`).

`GenerativeModel.streamGenerate()` turns one request into an iterator of messages. A caller that
stops reading before the response ends — the engine abandoning a turn, a consumer that breaks out
of its loop, a request that threw or timed out — used to leave two things behind: the request's
own `AbortController` stayed un-aborted, and the upstream iterator was never closed. The provider
kept generating into a stream nobody read (and kept billing for it), and the connection stayed
open until the provider finished on its own.

Every exit that happens **before** the response's stop event now cancels the request and asks the
iterator to close. A response that already reported its stop is left untouched: the turn is
committed and billed, and the transport may still be reading the end of the stream. Cleanup is
best effort — an upstream whose `return()` throws, rejects or never settles cannot replace the
outcome or hold the caller open. This is the same aborted request the engine's own interruption
path expected; it just no longer waits for somebody else to do it.

## Details

- `packages/core/src/llm/generative-model.ts`: the upstream iterator is hoisted out of the `try`
  (`let it: AsyncIterator<UniEvent> | undefined`), and the `finally` — after clearing the idle
  timer and removing the abort listener — calls `ac.abort()` and
  `void Promise.resolve(it?.return?.()).catch(() => undefined)` **only when the translator has not
  seen a finish reason**. The never-settling branch (`res === STOPPED`) no longer closes the
  iterator on its own; the `finally` does it once, for every exit. This fork's translator has no
  `stopped` getter (that arrived with a later upstream commit), so the guard uses the equivalent
  `sawFinishReason()`.
- `packages/core/test/llm.test.ts`: three lifecycle cases — a consumer leaving early, a user abort
  while the generator is suspended at a `yield`, and a received stop that must stay untouched —
  plus the three cleanup-failure cases (`throw` / `reject` / `hang`) that must still let the caller
  leave. Locally adapted: this tree's `UniEvent` vocabulary is `{ type: "text" }` items with an
  explicit `stop` event, and its loop pulls until `done` instead of breaking at the stop, so the
  "left untouched" case asserts that no `return()` is requested and the signal stays un-aborted
  rather than that the producer's `finally` never runs.

## Compatibility

- No dependency, API, on-disk or protocol change: the same request made to the same endpoint; when
  a caller leaves, the connection is now closed instead of being left streaming. A completed
  request behaves exactly as before, usage included.
