# A layout change no longer puts the agents panel back on a conversation you did not pick

- **Date:** 2026-11-19
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-19-subagent-panel-selection-across-layout.zh.md)

The Agents panel is a dock body: crossing the breakpoint (the wide window's right dock ↔ the narrow
merged surface) moves the panel from one mount to the other, so React unmounts it and mounts a
fresh one — and the state that said **which conversation it was showing** went with it. Rounds 268
and 269 gave the child composer's text, the panel's refusal lines and the staged chips a record to
live in across that mount; the pick itself was not in it, so after a resize the panel fell back to
its auto-focus (the displayed Task's first child). A reader who had just picked another subagent —
or the main session — from the call graph above landed in a different conversation.

Now the pick is kept the same way: every click on a graph node writes it to a module-level record
keyed by the **parent** conversation (a session id plus its `ctx.origin` chain — short strings, one
per conversation the panel was opened in), and the next mount starts from it. A record whose
conversation is no longer in the displayed Task's graph (a chip pinned the scope elsewhere, the
stream resynced into a fresh model) falls back to the auto-focus as before, rather than resurrecting
a panel nothing can render.

The same path also replayed an older command: the page holds a one-shot "focus this subagent" jump
per chip click, and every remount obeyed it again — undoing the pick made in between. It is obeyed
once now (remembered by the command object the page hands over; clicking the same chip again is a
fresh object, so it still lands).

## Details

- `packages/web/src/features/chat/subagent-panel-selection.ts` (new): `restoreSubagentSelection`
  (pure: only while the picked conversation is in the displayed Task's graph, and the origin chain
  comes from **today's node**, never from the record), `readSubagentSelection` /
  `writeSubagentSelection` (per parent conversation; a cleared pick drops the entry).
- `packages/web/src/features/chat/subagents-view.tsx`: every write to `selected` goes through one
  `pick()` (state and record at the same moment, not in a later effect); the render is
  `selected ?? the recorded pick ?? the auto-focused first child`; the `focusRequest` effect keeps a
  `WeakSet` of commands already applied, so a remount does not replay one.
- Docs `chat.zh.md` / `chat.en.md`: one sentence each on the subagents bullet.

## Tests

- `packages/web/test/subagent-panel-selection.test.ts` (new, 6 cases): records are per parent
  conversation, the main session (empty `origin`) is a pick too, clearing drops the entry, a pick is
  restored only while its node is present, and the origin chain is read from the graph.
- `packages/web/e2e/subagent-panel-selection-across-layout.spec.mjs` (new, 2 cases, real server +
  the repo's mock model + the system chromium): the root node picked in the graph stays the pressed
  node and keeps the main-session note at 1280 → 390 → back; then picking the child again is what
  the next mount shows (the record follows the last pick).
- Counter-proof with the same spec against the pre-change sources and build: the first case
  **failed** at 390 (back on the child: `pressed` `[false, true]`, the note gone). Restoring the
  sources and rebuilding produced a dist byte-identical to the kept one (`diff -rq`).

## Compatibility

Frontend state only: no interface, wire format or stored data changes. The record dies with the tab,
so a reload starts from the auto-focus exactly as before.
