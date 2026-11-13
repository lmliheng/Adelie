# The Trace panel shows the live frames this browser actually received

- **Date:** 2026-11-13
- **Type:** feature
- **Scope:** `web`

[中文版](2026-11-13-trace-transport-frames.zh.md)

When a live conversation went quiet there was no way to tell, from the browser, whether data had
stopped arriving or the server had stopped writing: a frame is gone the moment it is delivered, and
a reload replaces the connection with a different one.

The Trace panel now carries a **Transport** view, recording by default. It lists the SSE frames
this browser received — newest first, each with its event name, the id the channel gave it, its byte
length and the opening of its payload — together with the connection's own markers (`open`,
`reopen`, `stalled`, `live`, `probe`, `error`, `closed`) and one marker for any quiet stretch longer
than the server's heartbeat, carrying how long it lasted. It does not have to be switched on first:
a stream that went quiet is noticed after the fact, and frames recorded only from the moment the
reader switches it on are exactly the ones already missed. Whoever does not want it can turn it off,
and the choice is remembered in the browser.

## Details

- `packages/web/src/api/sse-frames.ts`: the page-level ring (300 entries, oldest out), fed by
  `api/sse.ts` with every frame it receives. Recording is on unless the toggle turned it off
  (`penguin.sseFrames`, written as `0` when off), and turning it off drops what was collected — a
  frozen list left on screen would read as a stream that stopped. Identical consecutive markers
  closer together than ten seconds collapse into one, so a browser retrying a dead connection cannot
  flush the ring.
- `packages/web/src/features/traces/sse-frame-list.tsx`: the view — toggle, count, clear button and
  rows — re-rendering on the recorder's notifications only while its dock tab is showing.
- `packages/web/src/features/traces/transport-rows.ts`: which entries this Session's panel shows
  (its own channel plus the page's user-level one, marked, newest first, capped at 120 rows).
- `packages/web/src/features/traces/trace-panel.tsx`: the view, above the file pills, and present in
  **every** state of the listing — while it loads, when it failed, and when the Session has produced
  no Trace file at all (the 「暂无轨迹」 empty state). That last one is exactly the moment the
  question "did the stream deliver anything" gets asked.
- `packages/web/src/lib/format.ts`: `formatTime` also takes epoch milliseconds, so a live record's
  own clock prints without a round trip through ISO text.

## Tests

- `packages/web/test/sse-frames.test.ts`: recording is on by default and turns off with the ring;
  the newest 300 survive; a quiet stretch past the heartbeat leaves one marker carrying its length
  while one exactly at the interval leaves none; identical markers collapse and frames never do;
  subscribers are notified until they leave; byte lengths are counted on UTF-8 and previews capped.
- `packages/web/test/sse.test.ts`: frames reach the recorder from the subscription with their event
  name, id and byte length.
- `packages/web/test/transport-rows.test.ts`, `packages/web/test/sse-frame-list.test.ts`: row
  selection, order and cap; and the rendered markup — recording from the start, the frames in the
  wire's own words, another Session's channel left out.
- `packages/web/test/trace-panel.test.ts`: the panel's shell — the Transport view is drawn while the
  listing is still loading, and with no Session selected either.

## Compatibility

No wire change, no new dependency, no Project config change. It records by default, but only in the
current page's memory, never written to storage and never sent anywhere; a reader who does not want
it turns it off and sees the panel as it was. The view holds the receiving side only: what the
server wrote is not visible from the browser, and it does not claim otherwise.
