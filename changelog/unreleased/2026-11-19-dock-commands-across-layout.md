# A layout change no longer replays the Files and Memory panels' commands

- **Date:** 2026-11-19
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-19-dock-commands-across-layout.zh.md)

Each command the chat page hands a dock panel is a press, not a state: a fresh object per click ("locate
this file in the tree", "land on this memory", "focus this child conversation"), held by the page until
the next click, a Session switch or the panel's tab closing. The panel bodies that obey them, though, are
remounted whenever the layout moves the panel between the desktop side column and the narrow merged
surface — so the guard that said "already applied" went with the old mount, the page was still holding the
command, and the new mount ran it a second time: the Files panel reopened the file the reader had closed
and moved away from, and the Memory panel went back to the memory (or the list) they had walked out of.

The claim now lives at module scope (`dock-command-once.ts`), so it outlives the remount while still dying
with the tab. The child-conversation pick — the third command of the family, fixed one round earlier — uses
the same record instead of a private `WeakSet` of its own, so all three commands are remembered one way.

## Details

- `packages/web/src/features/chat/dock-command-once.ts` (new): `claimOnce(command)` — true the first time a
  given command object is seen, false afterwards; the page creates a fresh object per click, so clicking the
  same file again is a new command.
- `packages/web/src/features/chat/workspace-browser.tsx`: the `openRequest` effect keeps its
  "once per command" behaviour but claims at module scope instead of through a per-instance ref.
- `packages/web/src/features/chat/memory-view.tsx`: the `request` effect claims once (it used to re-apply on
  every mount, which is what pulled the reader back).
- `packages/web/src/features/chat/subagents-view.tsx`: the pick's `WeakSet` becomes the shared claim.

## Tests

- `packages/web/test/dock-command-once.test.ts` (new, 4 cases): one object runs once however many mounts see
  it, every click is its own claim, the claim works for all three command shapes, and a reload starts over.
- `packages/web/e2e/dock-command-across-layout.spec.mjs` (new, 2 cases, real server + the repo's mock model
  + the system chromium): ① the Files panel opens `demo.html` from the reply's card, the reader then opens
  `note.txt`, and crossing 1280 → 390 → back shows no stale preview of `demo.html`; ② the Memory panel lands
  on a note from the Task's summary card, the reader presses Back, and crossing keeps the list — no jump back
  into the note. The note is written through the ordinary file tool by a new mock branch
  (`memory write test <abs path>`), so the summary card is real.
- Counter-proof with the same spec against the pre-change sources and build: both cases **failed** at 390
  (Files: a stale `demo.html` iframe; Memory: back inside the note it had left). Restoring the sources and
  rebuilding produced a dist byte-identical to the kept one (`diff -rq`).
- Neighbours re-run green: `subagent-panel-selection-across-layout.spec.mjs` (2) and `files-switch.spec.mjs` (1).

## Compatibility

Frontend state only: no interface, wire format or stored data changes. The record dies with the tab, so a
reload starts from no command exactly as before.
