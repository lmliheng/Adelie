# A layout change keeps the Memory panel on the memory the reader had open

- **Date:** 2026-11-19
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-19-memory-place-across-layout.zh.md)

The Memory panel is a dock body, and crossing the breakpoint (the wide window's right dock ↔ the
narrow merged surface) redraws the same tab as a fresh body on the other mount. The previous change
in this line stopped the page's one-shot commands from replaying there — a reader who had pressed
"back to the list" is not pulled back into the memory. **Where the reader had put themselves** did
not survive: a memory being read came back to the list, and a list scrolled halfway down came back to
its top. Measured in a browser: a 41-paragraph memory scrolled to 600 px was the list at 390, and a
list scrolled to 400 px came back at 0.

Now the panel's own place travels with it, under the same rule as the Files panel's: **only a layout
change brings it back.** A tab closed and reopened, or a conversation switched away from and back to,
still starts the panel over at the top of the list.

## Details

- `packages/web/src/features/chat/memory-place.ts` (new): one place per conversation — the dock
  surface it was left on, the level the reader was at (the list, or one memory), and the two offsets.
  The same rules as `workspace-view-memory.ts`: handed back only to a body that arrived on **another**
  surface (a move lands elsewhere; a conversation switch and a reopened tab land back where they
  were); a place exactly at the panel's start (the list, at its top) is dropped rather than kept; and
  the record is a snapshot, copied in and out.
- `packages/web/src/features/dock/panel-context.tsx`: `DockSurface` moves to the dock's own module
  (it is that module's way of saying where a body is drawn); the Files panel's record imports it and
  re-exports it, so its readers are untouched.
- `packages/web/src/features/chat/memory-view.tsx`:
  - The record seeds the level on mount; `goTo()` takes every navigation (a row, back, and the page's
    locate command) and writes the record each time. An offset belongs to the memory it was read in,
    so moving to another level or memory drops it (that memory starts at its top, as before).
  - Both offsets are read off their own boxes on `scroll` and written straight into the record, not
    through React state.
  - They are applied by two layout effects that each wait for their own content: the list's once its
    rows (or its empty note / error) are drawn, the memory's once that read has landed — scrolling
    earlier would only be clamped to 0.
- `packages/web/src/features/chat/builtin-dock-panels.tsx`: the Memory tab's body reads the surface it
  is drawn on from `useDockPanel()` (`merged ? "merged" : position`), the same way the Files tab does.

## Tests

- `packages/web/test/memory-place.test.ts` (new, 9 cases): nothing for a conversation never visited;
  handed back to another surface; not to the same one; two conversations stay apart; a place at the
  panel's start is dropped; a scrolled list alone is a place; a workspace scope keeps its key; copies
  both ways; the level's key is `memoryRowKey`'s.
- `packages/web/e2e/memory-place-across-layout.spec.mjs` (new, 3 cases): ① a long memory opened and
  scrolled to 600, crossed 1280 → 390 → 1280 — the same memory, still at 600; ② a list scrolled to 400,
  crossed both ways — still the list, still at 400; ③ a memory opened and then walked back to the list,
  crossed — still the list (not pulled back into the memory).
- Counter-proof with the same spec against the pre-change sources and build: 2 failed — ① `detail: 0,
  scroll: null` at 390 and after coming back (fallen back to the list); ② the list's 400 became 0. The
  third case passes before the change too (it is about "back to the list stays the list").
- Two-state probe (one script, each leg on its own build): after — `{"detail":1,"scroll":600}` at all
  three moments, list `400 → 400`; before — `{"detail":1,"scroll":600} → {"detail":0,"scroll":null}`,
  list `400 → 0`.

## Compatibility

Frontend state only: no interface, wire format or stored data changes. The place lives in memory only,
so a reload starts at the top of the list (same as before this change).
