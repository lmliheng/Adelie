# A video can now go into the chat: drop a clip in and the model watches it

- **Date:** 2026-10-26
- **Type:** feat
- **Scope:** `core`, `server`, `web`, `docs`
- **Breaking:** no

[中文](2026-10-26-video-input.zh.md)

The composer's paperclip menu gains **Upload video**, and a clip can be dropped or pasted in as
well. Before sending it shows as a card with its first frame, name and size (removable); after
sending it is a video in the conversation, playable and full-screen.

When the Session's model **takes video input** (the Seed family and friends — their card says
**Video**), the clip rides this turn's request as a video content part: the model can describe it,
summarize it, answer questions about what is on screen, with no intermediate step. When the model
**does not**, the send is not refused either: the clip lands in the Session scratchpad and the
message carries an `[attached file: …]` line, exactly like an attachment, for the Agent to open
with its own tools. The frontend never asks you which kind of model this is; the server decides.

## Details

- **AgentHub patch** (`patches/@prismshadow__agenthub.patch`, produced with `pnpm patch` and
  registered under `patchedDependencies` in `pnpm-workspace.yaml`, pinned to 0.4.15): the
  `ContentItem` union gains `{ type: "video_url"; video_url: string }`, and
  `transformUniMessageToModelInput` gains the branch that turns it into Chat Completions'
  `{"type":"video_url","video_url":{"url":…}}` — the shape providers ask for (Ark's video
  understanding API). Unlike an image the video is **not** re-encoded to base64; it is passed
  through as the data URL it already is.
- **core**: `VideoUrlPayload` and `videoUrlMessage()` in the omni-message public API; a video budget
  on `GenerativeModel` (`maxVideos`) — one clip per request, older ones replaced by an
  `[video omitted: …]` line, because a video request is tens of megabytes of base64 and a history
  replaying two of them would be refused for good. The limit comes from
  `catalogSupportsVideo(provider, modelId)` (or the entry's `video` annotation).
- **server**: a task input part `{type:"video_url", videoUrl, fileName?}` and a `videos` field on
  `/steer`; an inline video is capped at **32MB** (413 `video_too_large` — Ark takes a video under
  50MB inside a 64MB body and base64 inflates by 4/3) and must be a `data:video/…` URL; on a model
  that takes no video the clip becomes an attachment instead (an http(s) URL cannot be written to
  disk, and that combination is a 400 that says why). The model list reports `video`, `/api/me`
  reports `videoMaxMb`, and the composer uses both for its pre-flight check and its branch.
- **History pages**: a `video_url` is served by reference like an image (new route
  `GET /api/sessions/:id/trace-video?file=&ordinal=`, in `services/trace-media.ts` — the old
  `trace-images.ts` was renamed into it), or one page would read tens of megabytes of base64 whole.
  Recalling an undelivered message (#287) hands an inline video back to the composer as submitted.
- **Both sides read the same two sources.** Whether a clip rides inline or becomes a file is
  decided twice — by the composer, from the model it is given, and by the task/steer routes. Those
  answers have to agree: a model marked `video = true` by hand (a row the catalog does not know)
  was offered video input by the composer while the routes, reading the catalog alone, filed the
  clip away as a scratchpad attachment without a word. The routes now read the Project entry first
  and fall back to the catalog, exactly as the model list does.
- Docs: the notes in `models.zh.md` / `models.en.md` carry the **Video** label and both paths.
- Tests: `server/test/video-input.test.ts` (inline / written to disk / a nameless clip named after
  its type / a non-video data URL / the 413 / both steering paths / a Project entry marked
  `video = true` on a model the catalog never heard of) and
  `server/test/trace-media.test.ts` (video by reference, its bytes and type, the 404s and 400s);
  `web/e2e/video-input.spec.mjs` runs the whole path in a real browser — the composer stages a real
  1-second WebM, the model is handed the `video_url` part with the very bytes that were picked
  (answered by the mock's new Chat Completions branch), the browser decodes the clip in the
  transcript, and a reloaded page is served it by reference.

## Compatibility

- One **patch** is now part of the install: `pnpm install` applies
  `patches/@prismshadow__agenthub.patch` (pnpm computes a `_patch_hash` for it); the package is
  still the published `@prismshadow/agenthub@0.4.15`. Upstream has no `video_url` support yet, which
  is why the patch is version-pinned — an upstream bump makes pnpm complain rather than silently
  dropping it.
- The server API only grows: old input parts and old `/steer` bodies behave as before; `/api/me` and
  the model list carry extra fields that old clients ignore.
- A Session that never carries a video is unaffected: the video budget is a no-op when no video is
  in play.
