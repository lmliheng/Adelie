# A layout change keeps the Trace panel on the rounds the reader had open, where they were scrolled

- **Date:** 2026-11-20
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-20-trace-place-across-layout.zh.md)

The Trace panel is a dock body, and crossing the breakpoint (the wide window's right dock ↔ the
narrow merged surface) redraws the same tab as a fresh body on the other mount. The Files and Memory
panels already come back to their own place across that move; the Trace panel did not: a reader who
had closed the file's newest round and opened the first one, then scrolled down, came back with the
newest round open again, the first one closed, and the panel back at the round it opens on. Measured
in a browser: rounds `[true,false,false]` at 320 px became `[false,false,true]` at 846 px at 390, and
still `[false,false,true]` at 488 px after crossing back.

Now the panel's place travels with it, under the same rule as the other two panels': **only a layout
change brings it back.** A tab closed and reopened, or a conversation switched away from and back to,
still starts the panel over on the file's newest round.

## Details

- `packages/web/src/features/traces/trace-place.ts` (new): one place per conversation — the dock
  surface it was left on, the rounds the reader had open (taskIndex), and the panel's offset. The same
  rules as `memory-place.ts` / `workspace-view-memory.ts`: handed back only to a body that arrived on
  **another** surface; a place exactly at the panel's start (no round open, at the top) is dropped
  rather than kept; and the record is a snapshot, copied in and out. The arriving body writes the
  record once on mount, stamped with the surface it is on now — that is what makes the crossing back
  the other way find a place instead of "same surface, start over".
- `packages/web/src/features/traces/trace-panel.tsx`: the record seeds the place on mount, the box
  that scrolls the panel reads its own offset on `scroll` and writes it straight into the record (not
  through React state), and the offset is applied once the file view reports that everything the place
  names is drawn.
- `packages/web/src/features/traces/trace-file-view.tsx`: `fileAtArrival()` seeds the view with the
  reader's rounds and no round to scroll to; `fileAfterAnalysis()` keeps those rounds instead of
  re-deciding them from the newest round, and sets no `reveal` — the place's own offset is what puts
  the panel back. The view reports the open rounds up (the panel keeps them in the record) and reports
  when the analysis and every open round's events are in.
- `packages/web/src/features/chat/builtin-dock-panels.tsx`: the Trace tab's body reads the surface it
  is drawn on from `useDockPanel()` (`merged ? "merged" : position`), like the Files and Memory bodies.

## Tests

- `packages/web/test/trace-place.test.ts` (new, 6 cases): handed back to another surface, not to the
  same one; nothing for a conversation that never left a place; a copy both ways; the newest write
  wins, surface included (the arrival stamps it); a place at the panel's start is dropped; a place that
  only scrolled, and one that only opened a round, are both kept.
- `packages/web/test/trace-file-view.test.ts` (+2 cases): a view that arrived with rounds keeps them and
  scrolls nowhere (the open card is the first round's, not the newest one's); a refresh after that
  arrival still follows the run's ordinary rule and never scrolls.
- `packages/web/e2e/trace-place-across-layout.spec.mjs` (new, 3 cases): ① newest round closed and the
  first opened, crossed 1280 → 390 → 1280 — the same rounds, both sides; ② the panel scrolled to 320,
  crossed both ways — still at 320; ③ after a crossing that restored the place, the tab closed and
  reopened — the panel starts over on the newest round.
- Counter-proof with the same spec against the pre-change build: 2 failed — ① the rounds came back
  `[false,false,true]`; ② the 320 became 715. The third case passes before the change too (it is the
  guard for "a closed tab still starts over").
- Two-state probe (one script, both legs sending three turns): after — rounds `[true,false,false]` and
  320 px at all three moments; before — `[false,false,true]` at 846 px at 390 and 488 px coming back.

## Compatibility

Frontend state only: no interface, wire format or stored data changes. The place lives in memory only,
so a reload opens the panel on the file's newest round (same as before this change).
