# A model row in the Network panel separates "still fetching", "no longer kept" and "nothing sent"

- **Date:** 2026-11-27
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-27-network-model-body-notes.zh.md)

A model call's row in the conversation's "网络" panel carries only its boundaries (the stream's `request_begin` / `request_end`); the request and response bodies are fetched from the server when the row is opened, out of an in-memory ring of the newest 100 model calls. It used to leave the body empty when the fetch found nothing, so "请求体" and "响应体" fell back to `（空）` — the same words a call that really sent an empty request would show. Opening an older row in a long conversation (more than 100 calls in one server process), or looking while the fetch was still in flight, or looking after the request itself was refused, all read as `（空）`.

The three now read apart: "Fetching this call's content from the server…", "The server has no record of this call (it keeps the last 100 model calls).", and "Could not fetch this call's content: <the server's sentence>". A model call is made by the server, so this page never sees its headers — those two empty tables now say "not captured" rather than `（空）`.

## Details

- `packages/web/src/features/network/model-exchange-pick.ts` (new): which record belongs to the row, lifted out of the panel — nearest by end time, and anything outside a 5-second window is a different call (a multi-step turn makes one call per step). The window used to be a literal inside the panel's `useEffect`.
- `packages/web/src/features/network/network-panel.tsx`: the detail keeps this fetch's outcome (`loading` / `missing` / `refused` with the server's sentence); `BodyBlock` and `HeaderTable` take an `empty` note saying what an empty table means here; the detail is mounted per row id (`key={open.id}`) so the previous row's answer does not follow along.
- `packages/web/src/lib/strings{,-en}.ts`: three new strings.
- `packages/web/test/model-exchange-pick.test.ts`: 4 cases — nearest wins, the closer of two inside the window, null for an empty ring and for records beyond the window, and the window's edges.
- `packages/web/e2e/network-panel.spec.mjs` gains one real-browser case: answer `model-exchanges` with an empty list, open the model row's "请求" tab, and it must say the server has no record rather than `（空）`.

## Compatibility

Only what this page says when it cannot fetch a row's content changes; the API, the data and the wording when the record is there are untouched, and there is no new dependency.
