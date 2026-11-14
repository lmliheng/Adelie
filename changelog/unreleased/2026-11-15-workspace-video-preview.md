# An mp4 in the Files panel plays in the pane

- **Date:** 2026-11-15
- **Type:** feature
- **Scope:** `server`, `web`, `ui`, `docs`

[中文版](2026-11-15-workspace-video-preview.zh.md)

The Files panel now plays a video. Choosing an `.mp4` in the tree opens a player in the pane, with its own controls, and seeking fetches only the span it seeks to rather than the file from the start. A video past 50MB is not previewed — that is the server's own read ceiling — and the pane says so instead of mounting a player that could not load.

## Details

- `packages/server/src/services/workspace-files-service.ts`: `.mp4` is served as `video/mp4`. It had no entry in the content-type table and went out as `application/octet-stream`, which a `<video>` refuses under `nosniff`.
- `packages/server/src/services/byte-range.ts`: new pure `parseByteRange` over the single-range grammar, so the header is decided by one function with its own tests. A multi-range request, a malformed one and a backwards one are all ignored in favour of the whole file, which RFC 9110 allows; only a range whose first byte is at or past the end is unsatisfiable.
- `packages/server/src/http/routes/workspace-files.ts`: `GET …/files/content` answers a usable range with `206` and a `Content-Range`, an unsatisfiable one with `416` naming the size, and everything else with the whole file as before. Every answer, including the ones that ignore the header, now carries `Accept-Ranges: bytes`. The file is still read whole to be served, so the 50MB read ceiling and the `413` past it are unchanged.
- `packages/ui/src/components/files/preview-pane/preview-pane.tsx`: `PreviewView` gained `{ kind: "video"; src; title; reloadKey? }`, drawn as a `<video controls preload="metadata" playsInline>` in the same bordered box an image or a PDF gets. `reloadKey` remounts it when the file is re-read under the same URL.
- `packages/web/src/lib/workspace-tree.ts`: `previewKindFor` gives an mp4 the `video` kind, and `VIDEO_PREVIEW_LIMIT` mirrors the server's read ceiling. New `listingSize` reads a file's byte count out of the loaded listings. The read-only FileBrowser maps the video kind to `unsupported` as before — it has no player and no listing to judge a size against.
- `packages/web/src/features/chat/workspace-browser.tsx`: the size check against the limit happens where the view is built, not when the file is opened: an `@path` reference opens its directories in the background, so the listing that holds the size may not have arrived yet, while the view is rebuilt on every render. Over the limit the pane shows the reason instead of a player.
- Copy lives in `files.previewVideoTooLarge` in `packages/web/src/lib/strings.ts` / `strings-en.ts`. The prose is in `packages/docs/content/files.zh.md` / `files.en.md` — the file-type table, the preview section and the limits table.

## Tests

- `packages/server/test/byte-range.test.ts` (8): a closed range, an open-ended one, a suffix count-back, a range clamped at the end, the unsatisfiable cases, and the malformed, backwards, multi-range and absurd values that all fall back to the whole file.
- `packages/server/test/workspace-files.test.ts`: `files/content` on an mp4 — the real type on the whole read, a `206` slice with `Content-Range` for `bytes=0-3` and `bytes=6-`, a `416` for a range starting past the end, and a junk range ignored into a `200`.
- `packages/web/test/workspace-tree.test.ts`: `clip.mp4` resolving to the video kind and to `unsupported` in the read-only browser, and `listingSize` reading a size from the listing that holds it while saying nothing for a path no listing covers.
- `packages/ui/test/files-panes.test.ts`: the video view rendering a `controls` element with `preload="metadata"` and its title.

## Compatibility

Purely additive: a new preview kind, a new content type, and range support on a route that answered whole files before. No new dependency, no database change, no Project config change. A client that sends no `Range` gets exactly what it got before, byte for byte.
