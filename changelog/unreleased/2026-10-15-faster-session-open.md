# A historical conversation opens without waiting for the sidebar

- **Date:** 2026-10-15
- **Type:** fix
- **Scope:** `server`, `web`

[中文版](2026-10-15-faster-session-open.zh.md)

Ported from upstream PenguinHarness (#984, commit `74efa5aa`).

Opening a conversation queued behind the sidebar's Session list. The chat page would not look up
the routed Session until that list had loaded, and the list asked each server once per Agent and
page — requests the browser serialises, so the conversation's own reads waited behind them.

## The conversation no longer waits for the sidebar

- The chat page's direct lookup of the routed Session no longer waits for the list to finish
  loading (`features/chat/chat-page.tsx`, `features/chat/route-probe.ts`).
- A lookup that fails while the list is still loading decides nothing: a Session created a moment
  ago may not be listed or answerable yet. The route stays pending and the lookup runs once more
  when the list settles. The page reads whether the list is still loading when the lookup
  **settles**, not when it was sent, so a lookup sent during the first load that fails after it
  still redirects.
- One lookup per Session is in flight at a time. It is no longer cancelled and re-issued on every
  list change, which used to send a dozen identical requests for one deep link, and an answer
  about a Session the route has since left is dropped.
- The lookup usually answers before the list's first load. When it does, the conversation shows
  the fetched row at once; the row joins the sidebar list only after the list has settled, and
  only if the list did not bring it itself (a row beyond the first page, or an organization's
  row).

## The sidebar's list fan-out is one request per server

- `POST /api/projects/:projectId/sessions/batch` carries up to 256 entries in one request, each
  asking for one page of one Agent's list. An entry takes the parameters of
  `GET /api/projects/:projectId/agents/:agentId/sessions` (`limit`, `order`, `offset` or an
  activity-order `before` cursor, `category`, `workspaceGroup`, `withCounts`, `excludeOrg`) and is
  checked by the same rules; one malformed entry makes the whole request a 400.
- `results` answers the entries in request order. An Agent this server does not host comes back as
  `ok: false, reason: "absent"`, which is a real answer; any other failure comes back as
  `reason: "error"`, and the sidebar never reads that as "no conversations".
- `reload()` and `loadMoreFor()` send one request per source — this server and each connected
  machine — so Workspace grouping's per-group pages go out as one request per server too.

The history read (`GET /api/sessions/:id/messages`) is unchanged: it is already bounded in bytes
server-side, and a windowed page is capped at 4 MiB with its images served by reference.
