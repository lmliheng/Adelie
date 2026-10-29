# A picture opens with the bar of things you can actually do to it

- **Date:** 2026-10-29
- **Type:** feature
- **Scope:** `ui`, `web`
- **Breaking:** no

[中文](2026-10-29-image-board-bar.zh.md)

Opening a picture in the lightbox used to leave one gesture: close it. The frame now carries,
under the image, a capsule bar with the actions the page can really perform — **save the file**
and, when the picture is one of several that arrived together, **step through the batch**. The
picture's own pixel size sits in the opposite corner of the frame, so a 2364 × 1773 screenshot
says so instead of looking like whatever the window made of it.

Nothing pretends. Editing, layer split, background removal and the rest of that family are a
generation service's job, and no endpoint here backs them; the bar holds no button that cannot
work.

## Details

- `packages/ui/src/components/overlays/lightbox/image-board.ts` (new): the arithmetic, apart from
  the markup — `stepIndex` (a batch is a carousel: the last picture's "next" is the first);
  `pixelSizeLabel` (the picture's own size, or nothing while an unloaded image still reports
  0 × 0); `downloadName` (the last segment of a URL or path, decoded; the name a route carries in
  `path=` when its own segment is only an id, as `…/files/content?path=shot.png` is; the media
  type's name for a `data:` URL; the caller's fallback for a `blob:`).
- `packages/ui/src/components/overlays/lightbox/lightbox.tsx`: `Lightbox` takes `images` — the
  batch a picture belongs to — opens on the one that was clicked, shows one thumbnail per picture
  (marked `aria-current`), a "2 / 3" counter and the two step buttons, and saves whatever is on
  screen under `downloadName(src)`. `ZoomableImage` forwards a caller's `group` into it. The
  close glyph and the Escape-layer behaviour are unchanged; a single picture therefore shows only
  the save action.
- `packages/ui/src/strings.ts`: three accessibility keys — `download`, `previousImage`,
  `nextImage` — with the web app mapping them per language (`common.previousImage` /
  `common.nextImage`, `files.download`).
- `packages/web/src/features/chat/chat-input.tsx`: the staged attachments are one batch, so
  opening one of five pictures steps through the other four instead of closing and hunting for the
  next thumbnail.
- Tests: `packages/ui/test/image-board.test.ts` (new: wrapping, unknown sizes, every naming
  source), `packages/ui/test/lightbox.test.ts` (the bar's labels, the download name, a batch
  opening on the clicked picture, thumbnails, the counter, an empty batch), and the key list in
  `packages/ui/test/strings.test.ts`.

## Compatibility

- No API, on-disk or protocol change. A lightbox opened without `images` is the picture and its
  close glyph as before, plus the save action; the markup of a thumbnail is unchanged.
