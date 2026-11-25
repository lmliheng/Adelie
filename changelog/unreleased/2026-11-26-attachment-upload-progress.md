# A big attachment's upload has a progress reading

- **Date:** 2026-11-26
- **Type:** feat
- **Scope:** `web`

[中文](2026-11-26-attachment-upload-progress.zh.md)

Sending a message with a big file attached — the report that started this was 177MB — showed nothing
at all: the composer simply went disabled for as long as it took, which on a slow link is minutes.
The reason is that attachments travel **inside the request body** as base64 (the server's
attachment-limits.ts says why, and gives the 200MB ceiling — a 177MB file is a ~236MB body on the
wire), and `fetch`, which sent it, has no upload-progress event whatsoever. That one request now goes
out over XHR for the reading, and the reading is drawn on the corner progress card (the one an Agent
deletion already uses): a title, a determinate bar, and the two byte figures — sent, and the whole
body. A body that is over inside 600ms never raises a card, and a send closes it either way: the
message appearing in the conversation is the success, and a failure is explained by the line above
the input card.

## Details

- `packages/web/src/api/xhr-upload.ts` (new): sends that one request with `XMLHttpRequest`, reads
  the progress off `upload.onprogress`, and wraps the answer back into a real `Response` — so
  everything downstream (the non-2xx → `ApiError` envelope mapping, the `Date`/`ETag` reads, the
  empty-body handling) is the same code the `fetch` path runs, and the two transports cannot drift
  apart in what they mean. The constructor is a parameter, so the node suite's tests pass their own
  fake XHR.
- `packages/web/src/api/client.ts`: `ApiFetchOptions.onUploadProgress` — passing it is what selects
  XHR; without it nothing about the call changes and ordinary messages stay on `fetch`.
- `packages/web/src/api/endpoints.ts`: `postTask` / `postSteer` forward the callback.
- `packages/web/src/features/chat/message-upload-progress.ts` (new): `inputBytes` / `steerBytes`
  size the body from the parts' own strings (rather than `JSON.stringify`-ing a 236MB body to
  measure it), and the card is raised only above 2MB; `postTaskWithUploadProgress` /
  `postSteerWithUploadProgress` are what the call sites now use.
- Call sites: the send, the queued follow-up, the `/model` switch and the `@` handoff in
  `chat-page.tsx`, the draft page's first message (`draft-view.tsx`), and steering.
- Strings: `uploadingMessage` and `uploadProgressDetail`, in both languages.

## Compatibility

Only this request's transport and what the front-end draws: the path, the body, the cookie auth and
every error code are unchanged, and the server is not touched at all. Bodies under 2MB keep going out
over `fetch`.
