# The conversation has a Network panel: what each turn actually sent

- **Date:** 2026-11-27
- **Type:** feat
- **Scope:** `web`

[中文](2026-11-27-network-panel.zh.md)

The conversation's dock gains a permanent **网络** tab beside sub-agents, files, memory, traces and
schedules. It records the requests this page makes — nothing is enabled first, and nothing is sent
to the server: the list lives in this page's memory and a reload empties it.

The list is grouped by turn, newest first, each row showing time, method, status, path, frames and
duration; failures are red, retries carry `×n`, a slow request is tagged, and an in-flight one pulses.
The toolbar switches the scope (本次回复 / 最近 5 回合 / 全部), filters by kind (接口 / 模型 / 流 /
上传) and searches by path, status or model. A row opens its detail **inside** the panel (← returns
to the list), with tabs for the overview (a timing breakdown), what was sent, what came back, the
stream's events, and the other requests of the same turn.

The assistant reply's footer gains `⚡ N 个请求 · M 次模型调用 · 耗时`; clicking it opens the panel on
that turn, and the panel's menu can hide the line. Settings › 系统 gets a 「网络记录」 section for the
ring size, what is recorded, and clear/export.

## Details

- `packages/web/src/api/net-log.ts` (new): the recorder. It keeps a ring of 300 entries, each body
  capped at 64 KB (marked truncated), and stamps entries with the Session, the current turn and a
  request id. Model calls are read off the stream's own `request_begin` / `request_end` events and
  become child rows of the turn — that is where a page can see them, since they happen server-side.
  Secrets are masked by default: `authorization`, `cookie`, `set-cookie`, `x-api-key`, and any name
  matching `*token*` / `*secret*` / `*password*`; URL parameters `key` / `token` / `api_key` /
  `access_token`; JSON fields by the same names. Showing the raw text asks first, for that one entry.
- Instrumented at the API layer's own doors — `apiFetch` / `apiFetchWithMeta` / `apiFetchStream`
  in `api/client.ts` and the upload XHR — never on a global `window.fetch`. The two SSE
  subscriptions in `api/sse.ts` open a row per connection and count the frames the page received;
  the frame data itself is the existing `api/sse-frames.ts` store, so the detail's event list and
  the trace panel show the same frames.
- `packages/web/src/features/network/` (new): `network-panel.tsx` (toolbar, list, detail),
  `net-rows.ts` (grouping, filtering, the summary numbers), `net-inline-row.tsx` (the reply's line),
  `net-export.ts` (JSON export, masked again on the way out), `net-focus.ts` (open the panel on a
  given turn).
- The tab is registered in `features/chat/builtin-dock-panels.tsx`; the inline line is drawn from
  `message-item.tsx` / `message-stream.tsx`; the settings section is `features/settings/network-section.tsx`
  (in 设置 › 系统 through `lib/settings-sections.ts`), and the panel's preferences (ring size, inline
  row, slow highlight) persist in this browser's `localStorage`.

## Compatibility

Nothing is recorded outside this page, and the panel is the only reader. No server change and no new
API: what it shows comes from requests the page already makes and from the stream it already reads.
The server-written half of the event stream — the frames the server put on the wire — is a
placeholder marked 未采集 until a capture point exists on the writing side.
