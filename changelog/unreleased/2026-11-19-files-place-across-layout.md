# A layout change keeps the Files panel on the row it had picked

- **Date:** 2026-11-19
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-19-files-place-across-layout.zh.md)

The Files panel is a dock body: crossing the breakpoint (the wide window's right dock ↔ the narrow
merged surface) moves the same tab to the other mount, so React unmounts the old body with its
state. The place the panel had picked — **which file is open, which folders are unfolded, which
directory the breadcrumbs name** — lived in that state and went with it: measured, the narrow
surface came back to the tree's root with nothing open, and the folders the reader had unfolded
were shut again.

Now the place survives a move. The tree's listings and the file itself are not kept (they are the
server's answers, read again on the way back), nor is the editor draft (it already writes through on
every keystroke), and the search box stays out of it on purpose — a search is a thing you are doing,
not a setting.

**Only a layout change brings it back.** A tab closed and reopened, or a Session switched away from
and back to, still starts the panel over at the tree's root, as it always has (files-switch.spec
pins the Session half). What tells the two apart is the surface the fresh body lands on: a move
lands it somewhere else, everything else comes back where it was — so only the former is handed
the place.

## Details

- `packages/web/src/features/chat/workspace-view-memory.ts` (new): one place per scope —
  `{ surface, selectedPath, currentDir, expanded }`. `recallWorkspaceView(scope, surface)` hands it
  back only to a body on another surface; `rememberWorkspaceView` writes on every change and drops a
  place that is exactly the panel's start (no file, the root, nothing unfolded), because remembering
  "nothing" would make the panel come back as if the reader had been somewhere. Arrays are copied in
  and out. It is written through per change rather than on unmount: a move mounts the arriving body
  before tearing the leaving one down, so an unmount-time write would land after the new mount read
  the record (the same ordering the child composer's record deals with).
- `packages/web/src/features/chat/workspace-browser.tsx`: the three states are seeded from the
  record; one mount-only effect reads back what a place cannot hold — the open file's preview, and a
  listing for every unfolded folder (unlisted, a folder would come back open with nothing under it,
  and its first click is a collapse, so nothing would ever fetch it). `previewPath` gained a
  `restored` option: a draft still reopens, but the "draft restored" toast is not raised for it —
  that is the text the reader was typing a moment ago, and announcing it on every move is noise.
- `packages/web/src/features/chat/builtin-dock-panels.tsx`: the Files tab's body reads the surface it
  is drawn on from `useDockPanel()` (`merged ? "merged" : position`) and hands it down — the one fact
  that separates a move from a Session switch or a reopened tab.

## Tests

- `packages/web/test/workspace-view-memory.test.ts` (new, 7 cases): nothing for a scope never
  visited, handed back to another surface, nothing to the same surface, one place per scope, a place
  equal to the panel's start dropped, a place holding only one of the three still a place, and copies
  both ways.
- `packages/web/e2e/files-place-across-layout.spec.mjs` (new, 3 cases): ① `util/helper.txt` open,
  1280 → 390 → 1280, the preview on screen at all three (and the row back in the tree on the wide
  surface); ② only `util` unfolded with nothing selected, the `util/helper.txt` row there at all
  three; ③ after the reader took the narrow surface's own way back to the tree, coming back wide does
  **not** reopen the file they had closed.
- Counter-proof with the same spec against the pre-change sources + build: 3 failed — ① preview 0 at
  390 (expected 1); ② the row 0 at 390 (expected 1); ③ no "back to tree" button on the narrow
  surface at all (nothing selected to go back from), 90 s timeout. With the sources restored the
  rebuild is byte-identical to the kept build.
- Two-state probe: after — `preview 1 / 1 / 1` and `helperRow 1 / 1 / 1` across the three moments;
  before — 0 at 390 and 0 after coming back.

## Compatibility

Frontend state only: no interface, wire format or stored data changes. The place lives in memory
only, so a reload starts at the tree's root (same as before this change).
