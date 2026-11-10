# A dropped response body no longer ends the whole command

- **Date:** 2026-11-11
- **Type:** fix
- **Scope:** `cli`
- **Breaking:** no

[中文版](2026-11-11-cli-discarded-body-cancel.zh.md)

Five places in the CLI let go of a response body nobody was going to read with `void res.body?.cancel()`: an empty `request()` answer, the `401` token refresh, both halves of the `human_required` retry, and every readiness probe `penguin server` fires while waiting for the listener. `cancel()` rejects whenever the stream is already errored — a connection that died mid-body, a body a timeout had already aborted — and the CLI installs no `unhandledRejection` handler, so Node's default ends the process for it. A command that only meant to drop a body would die instead, on its own rejection, with nothing in the message to say which.

They all go through one `discardBody(res)` now, which swallows that rejection. The server's own drop sites (`model-balance`, `plugin-download`, `theme-download`, `proxy-probe`) have always done exactly this, and so does the CLI's SSE reader; these five were the outliers.

The window is narrow — the drop follows the headers almost immediately, so the stream has to error in between — but it is not empty: the `401` path reads the token file, and the `human_required` retry reads a clone of the body, both between the response arriving and the drop.

## Verification

`test/discard-body.test.ts` (new, 4 cases) and one case in `test/serve.test.ts` pin the drop sites by counting what actually reaches the process: an errored body, a cleanly cancelled one, a bodyless response, `request()` on a `content-length: 0` answer whose body errored, and a readiness probe whose body was left errored — each resolves and leaves an `unhandledRejection` listener with nothing. Reverted to the old form, two of them go red with exactly that escape in hand.
