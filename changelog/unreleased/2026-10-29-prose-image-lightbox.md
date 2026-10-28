# A reply's picture opens whole when you click it

- **Date:** 2026-10-29
- **Type:** feature
- **Scope:** `web`, `ui`
- **Breaking:** no

[中文](2026-10-29-prose-image-lightbox.zh.md)

Since a reply's picture started rendering at all (last round), it rendered fitted to the reading
column: a 2000px screenshot came out a few hundred pixels wide, and the only way to read it was to
find the file in the Files panel. Inside a conversation a picture is now a click away from its own
size — the click opens it in the lightbox the file previewer and attachments already use, and
Escape (or a click on the backdrop) closes it.

Nothing else changes. Every other Markdown surface — a README, the handbook, the Memory view, a
file preview — still renders a still picture, and so does a conversation's picture that the author
wrapped in a link: there the click belongs to the link.

## Details

- `packages/ui/src/components/content/prose/prose.tsx`: `ProseImagesProvider` gained `zoomable`
  (default off), and the `img` adapter renders a `ZoomableImage` when it is on. Two cases stay a
  plain `<img>`: an empty src (nothing to enlarge) and a picture inside a link — a button nested in
  an anchor fires both handlers, so a click would open a tab and an overlay at once. `MdLink` now
  tells its children they sit inside a link (`ProseInLinkContext`), so the adapter knows without a
  DOM query.
- `packages/ui/src/components/overlays/lightbox/lightbox.tsx`: `ZoomableImage` forwards the rest of
  the `<img>` attributes it is given (a Markdown picture's `title`, `width`, `height`) to the
  thumbnail; the lightbox itself still shows the file at its own size, so it takes only src and alt.
- `packages/web/src/features/chat/workspace-refs.tsx`: the conversation turns `zoomable` on for its
  whole transcript, whatever a src resolved to — the resolver decides where a picture is fetched
  from, not whether the reader may enlarge it.
- Tests: `packages/ui/test/prose.test.ts` (the adapter: on, off, empty src, inside a link),
  `packages/ui/test/lightbox.test.ts` (the thumbnail keeps the caller's attributes),
  `packages/web/test/md.test.ts` (through the real pipeline: a conversation's picture is a button,
  any other surface's is not).

## Compatibility

- No API, on-disk or protocol change. A picture outside a conversation is the same `<img>` it was;
  inside one it gains a wrapper button, and the markup a Markdown picture renders in a link is
  unchanged.
