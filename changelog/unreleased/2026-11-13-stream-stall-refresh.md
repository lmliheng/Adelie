# A live stream that never delivers anything no longer leaves the page looking frozen

- **Date:** 2026-11-13
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-13-stream-stall-refresh.zh.md)

A conversation whose live SSE stream was being swallowed — the handshake completed, the response
body never arrived, which is what a proxy or NAT in between can do — went completely silent: the
page kept showing whatever it already had, nothing ever moved again, and a Task running on the
server read as a hung agent. The client's only liveness watch was armed by the server's `ping`, so
a connection that never delivered one was not watched at all.

The connection is now watched against both failures. One that receives nothing at all within 30
seconds is treated as open but not connected, and reopened; after three of those in a row the
stream is judged stalled — it stops reopening at once, probes once a minute, and tells the page,
which then refreshes the conversation from `GET /messages` on a timer and says so in a strip above
the composer. The first event to get through clears the verdict, the timer and the strip.

## Details

- `packages/web/src/api/sse.ts`: a first-frame deadline (`FIRST_FRAME_MS`, 30 s) beside the
  existing silence window (`SILENCE_MS`, 50 s), which still applies only to a stream that has
  pinged. Three connections in a row with nothing on them (`MAX_STALLED`) stop the immediate
  reopen and switch to one probe a minute (`STALL_REPROBE_MS`). The new `onLiveness` handler
  reports the verdict, and every reconnect — probes included — keeps resuming from the newest
  event id seen.
- `packages/web/src/lib/omni/stream-controller.ts`: `refresh()`, which refetches the tail window in
  place and, unlike a resync rebuild, keeps the pending-approvals table, so an approval on screen
  stays answerable while the stream is down. It is a no-op while a load is in flight, after a
  failed one, and once disposed.
- `packages/web/src/features/chat/use-session-stream.ts`: the verdict starts and stops a
  six-second refresh timer and is exposed as `streamStalled`.
- `packages/web/src/features/chat/stream-stalled-banner.tsx`: the strip, mounted above the composer
  beside the goal banner.

## Tests

- `packages/web/test/sse.test.ts`: a connection with nothing on it is reopened at the deadline;
  three in a row stall the stream, hold no connection open, report once and probe a minute later;
  a frame on a probe returns it to live and the probing stops; a probe the browser itself gives up
  on schedules the next one; a stalled stream keeps resuming from
  the newest id it ever saw. The earlier guarantees are unchanged: a greeted stream's 50-second
  silence window, a stream that only pings, a late tab, a stream that spoke but never pinged, and a
  connection the caller closed or the browser gave up on.
- `packages/web/test/stream-controller.test.ts`: a refresh lands the refetched history in a fresh
  model without duplicating it, keeps the pending approval, and leaves the transcript on screen
  until the fetch returns; it is a no-op while a load is in flight, after a failure, and once
  disposed.

## Compatibility

No wire change, no new dependency, no Project config change, one new line of copy (the strip). A
server older than the heartbeat is unaffected: it answers a subscribe with its `task_state`
snapshot, which retires the new first-frame deadline, and its silence was never watched.
