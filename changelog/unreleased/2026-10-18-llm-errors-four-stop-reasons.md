# The `llm-errors` browser tests catch up with today's four stop reasons

- **Date:** 2026-10-18
- **Type:** test
- **Scope:** `web`, `core`
- **Breaking:** no

[中文](2026-10-18-llm-errors-four-stop-reasons.zh.md)

The three cases still assumed the behaviour from before 2026-08-25: `llm-errors.spec.mjs` asserted that a 403 quota error rides the reconnect ladder, and that a 401 leaves a dead Session unlocked by a Models-page CTA. Neither exists any more — upstream #458 (`573259f0`, stop reasons converged to `completed` / `aborted` / `retryable` / `fatal`) made every 4xx other than 408/429 fatal, and dropped the auth-dead notice. Our own core tests already pin today's rule (`isFatalProviderRejection`), so this change touches fixtures, specs and one comment only — **no product behaviour changes**.

- **Retry ladder**: the first case now uses a truncated stream (an SSE stream missing `message_delta` / `message_stop`). It classifies as `malformed`, which stays retryable, so the countdown, "retry now" and the successful retry keep real-browser coverage. An HTTP 5xx would not do: the protocol SDK retries 5xx internally (~0.4s, measured), so neither the engine nor the Trace ever sees it.
- **Give up**: the second case uses a persistently retryable failure too, and asserts the abort carries `backoff_interrupted`.
- **Quota 403**: a new case pins today's rule — one attempt, `fatal` / `rejected`, the provider's own text on screen, no reconnect line, the composer usable.
- **Auth 401**: the fourth case is rewritten to today's behaviour — `fatal` / `auth`, the banner carrying the provider's `invalid_api_key` text, no retry; after the model's key is updated the **same conversation** continues. The old case asserted a "model API authentication failed" notice and a "open model settings" button that neither this tree nor upstream has any more (#458 removed them).
- `mock-llm.mjs`'s three quota branches become two retryable-failure branches plus one quota-fatal branch; the contradictory comment on `isAuthenticationError()` in `generative-model.ts` ("a bare 403 … rides the retry ladder") now says what the code does.

## Compatibility

None: fixtures, specs and a comment only; no interface or wire format changes.
