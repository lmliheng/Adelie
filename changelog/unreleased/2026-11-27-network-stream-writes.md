# The Network panel's event-stream tab reads what the server wrote

- **Date:** 2026-11-27
- **Type:** feat
- **Scope:** `server`, `web`

[中文版](2026-11-27-network-stream-writes.zh.md)

The conversation's 网络 panel drew two numbers on a stream connection's 事件流 tab: what the server wrote, and what the browser received. The second one came from the page's own record; the first read "未采集", with a note promising it "in a later version". That left the one question a quiet stream raises unanswered — nothing was written, or what was written never arrived.

The server now keeps a record of what it writes. A page names each connection with a `requestId` query parameter when it opens the stream (an `EventSource` cannot set headers), and every frame written under that id is counted with its event name, its SSE id, its size and its moment. The panel reads the record back when the tab opens and re-reads it while the connection is still writing, so the count moves on a stream a reader is watching.

The count is a lower bound the record can vouch for, never a guess: a record whose head fell out of the server's ring says how many frames it lost and refuses to read as a difference, and a page row that is still open has no count to compare against yet.

## Details

- `packages/server/src/services/stream-writes.ts` (new): an in-memory ring, the newest 50 connections, each keeping the newest 500 frames with a `dropped` count; an evicted connection is not resurrected by later writes (a tail-only record would read as the whole thing). Nothing is written to disk.
- `packages/server/src/http/sse.ts`: the `requestId` query parameter, a record for each frame on the way out (heartbeat included), and the connection's open/close stamps.
- `packages/server/src/http/routes/sessions.ts`: `GET /api/sessions/:sessionId/stream-writes?requestId=` — the Session's own reader only; `record: null` means nothing was captured under that id.
- `packages/web/src/api/sse.ts` names each connection after the 网络 panel's own row; `api/endpoints.ts` reads the record back; `features/network/stream-write-view.ts` (pure) turns it into counts, gaps and rows with offsets from the open (two clocks are involved, so no absolute times); the panel draws the count, the two gap sentences, a partial-record note, and the frames newest first.
- Tests: `packages/server/test/stream-writes.test.ts` (ring semantics, and frames read back over a real stream, including that another user cannot read them), `packages/web/test/stream-write-view.test.ts`, and a case in `packages/web/e2e/network-panel.spec.mjs`.

## Compatibility

New read-only endpoint; existing streams are unchanged and a stream nobody names leaves no record (the CLI and an Agent's own tools are unaffected). No new dependency; the record lives in memory only and a restart empties it, which the panel states.
