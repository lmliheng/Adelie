# A layout change keeps the Files panel at the line the reader was on

- **Date:** 2026-11-19
- **Type:** fix
- **Scope:** `web`, `ui`

[中文](2026-11-19-files-reading-across-layout.zh.md)

The Files panel is a dock body, and crossing the breakpoint (the wide window's right dock ↔ the
narrow merged surface) redraws the same tab as a fresh body on the other mount. The file it had
open and the folders it had unfolded already came back (that part is the previous change); **how the
reader was looking at them** did not: the rendered/source choice for a Markdown or HTML file went
back to "rendered", and both boxes — the preview and the tree — went back to the top. Measured in a
browser: a long Markdown file switched to its source and scrolled halfway down came back to the
rendered top of it; a tree scrolled down to `row-06` came back to `row-01`.

Now those three travel with the place, under the same rule: **only a layout change brings them
back.** A tab closed and reopened, or a Session switched away from and back to, still starts the
panel over at the tree's root, rendered, at the top.

## Details

- `packages/web/src/features/chat/workspace-view-memory.ts`: the record gains `reading`
  (`"rendered" | "source"`), `previewScroll` and `treeScroll` (`{ top, left } | null`). A place that
  is exactly the panel's start now also has to be rendered with both boxes at the top before it is
  dropped; a **scrolled tree with nothing open is a place**, because those rows are as lost to a
  remount as an open file is. Scroll offsets are copied in and out like the unfolded list.
- `packages/web/src/features/chat/workspace-browser.tsx`:
  - The reading seeds the toggle's state and is handed to `previewPath` as `reading` when the file
    comes back, so the restored choice outranks the "oversized Markdown defaults to source" rule
    (which is a default, not the reader's informed choice). It stays with the file: a file opened
    afterwards starts rendered, as before.
  - The two offsets are read off their own boxes on `scroll` (not through React state — a scroll
    fires at the refresh rate and nothing on screen depends on it) and written straight into the
    record, which is why a move that lands before any state changes still has them. The preview's
    offset is held with the path it belongs to, so opening another file does not carry it over.
  - They are applied by two layout effects rather than with the restore: the preview's once the file
    it belongs to is on screen (the pane draws a skeleton until then), the tree's once every
    unfolded folder has been listed and the tree is actually drawn (on the narrow surface it is not,
    while a file is open) — scrolling earlier would just clamp.
- `packages/ui/src/components/files/file-tree/file-tree.tsx`: `bodyRef` and `onScroll` reach the
  tree's own box (which the caller already owns through `className`), so the panel can name the
  scroller without reaching into the DOM. `workspace-tree-view.tsx` passes both through.

## Tests

- `packages/web/test/workspace-view-memory.test.ts` (9 cases, +2): a scrolled tree with nothing open
  is a place; the reading and both offsets come back with the file; the copies now cover the offset
  objects too.
- `packages/web/e2e/files-reading-across-layout.spec.mjs` (new, 3 cases): ① a long Markdown file
  switched to 源码, crossed to 390 and back — 源码 still pressed, and a file opened afterwards
  starts rendered; ② the preview scrolled to 240 and crossed both ways — still scrolled; ③ the tree
  scrolled with nothing open and crossed both ways — still scrolled.
- Counter-proof with the same spec against the pre-change sources + build: 3 failed — the choice
  back to `预览: true`, the preview at 0, the tree at 0. With the sources restored the rebuild is
  byte-identical to the kept build.
- Two-state probe: after — `source true / previewTop 240 / treeTop 160` at all three moments;
  before — `source false / previewTop 0 / treeTop 0` after the crossing.

## Compatibility

Frontend state only: no interface, wire format or stored data changes. The place lives in memory
only, so a reload starts at the tree's root, rendered, at the top (same as before this change).
