# The Trace panel shows the live frames this browser actually received

- **Date:** 2026-11-13
- **Type:** feature
- **Scope:** `web`

[中文版](2026-11-13-trace-transport-frames.zh.md)

When a live conversation went quiet there was no way to tell, from the browser, whether data had
stopped arriving or the server had stopped writing: a frame is gone the moment it is delivered, and
a reload replaces the connection with a different one.

The Trace panel now carries a **Transport** toggle, off by default. Switched on, it lists the SSE
frames this browser received — newest first, each with its event name, the id the channel gave it,
its byte length and the opening of its payload — together with the connection's own markers (`open`,
`reopen`, `stalled`, `live`, `probe`, `error`, `closed`) and one marker for any quiet stretch longer
than the server's heartbeat, carrying how long it lasted. The choice is remembered in the browser.

## Details

- `packages/web/src/api/sse-frames.ts`: the page-level ring (300 entries, oldest out), fed by
  `api/sse.ts` with every frame it receives. Recording stays off unless the toggle turned it on
  (`penguin.sseFrames`), and turning it off drops what was collected — a frozen list left on screen
  would read as a stream that stopped. Identical consecutive markers closer together than ten
  seconds collapse into one, so a browser retrying a dead connection cannot flush the ring.
- `packages/web/src/features/traces/sse-frame-list.tsx`: the view — toggle, count, clear button and
  rows — re-rendering on the recorder's notifications only while its dock tab is showing.
- `packages/web/src/features/traces/transport-rows.ts`: which entries this Session's panel shows
  (its own channel plus the page's user-level one, marked, newest first, capped at 120 rows).
- `packages/web/src/features/traces/trace-panel.tsx`: the view, above the file pills.
- `packages/web/src/lib/format.ts`: `formatTime` also takes epoch milliseconds, so a live record's
  own clock prints without a round trip through ISO text.

## Tests

- `packages/web/test/sse-frames.test.ts`: recording stays off until the toggle and turns off with
  the ring; the newest 300 survive; a quiet stretch past the heartbeat leaves one marker carrying
  its length while one exactly at the interval leaves none; identical markers collapse and frames
  never do; subscribers are notified until they leave; byte lengths are counted on UTF-8 and
  previews capped.
- `packages/web/test/sse.test.ts`: frames reach the recorder from the subscription with their event
  name, id and byte length.
- `packages/web/test/transport-rows.test.ts`, `packages/web/test/sse-frame-list.test.ts`: row
  selection, order and cap; and the rendered markup — off by default, the frames in the wire's own
  words once on, another Session's channel left out.

## Compatibility

No wire change, no new dependency, no Project config change. It is off by default, so a reader who
never opens the toggle sees the panel as it was. The view holds the receiving side only: what the
server wrote is not visible from the browser, and it does not claim otherwise.
