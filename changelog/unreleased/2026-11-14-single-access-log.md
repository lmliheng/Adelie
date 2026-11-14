# The server logs each request once, not twice

- **Date:** 2026-11-14
- **Type:** fix
- **Scope:** `server`

[中文版](2026-11-14-single-access-log.zh.md)

The server's access log — the `GET /api/… 200 3ms` lines that fill `desktop.log` on the desktop, and
the same lines under `penguin server` — recorded **every request twice**, once from each of its two
HTTP layers. Reading a log meant skipping every other line: what looked like the page asking twice
was one request, and the pairs often disagreed with each other.

Now there is **one line per request**, from the outer layer, carrying the status the client actually
received. Two things fall out of that:

- **Half the log volume.** The routine traffic of an open window is the bulk of the file (the
  session's process list, the terminal list, `me`, the schedules, the agent config, each on its own
  timer), so the same window now costs half the bytes and the 5 MB rotation covers twice the time
  before a bug report loses its beginning.
- **No more contradictory statuses.** Where a request was for something the business surface does
  not serve — a static file, say — the inner layer's line read `404` (its own "not mine") while the
  outer layer went on to answer `200` from disk. The surviving line is the one the client saw.

## Details

- `packages/server/src/http/app.ts`: the request-logging middleware is gone (and with it the
  `Log` injection it was the only user of). The surface it wrapped is reached through the host
  layer's seam, so it saw every request the host layer had already logged — from the same
  middleware shape, in the same format.
- `packages/server/src/app.ts`: the host layer's access log stays, and its comment now says it is
  the only one, so the platform layer does not grow a second one again.
- No test asserted the access-log contents (the suites inject a no-op `Log`), so nothing else moved.
  The line format is unchanged, so anything reading the file keeps working.
