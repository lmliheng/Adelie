# The Network panel keeps the reader's place across a layout move

- **Date:** 2026-11-27
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-27-network-panel-place.zh.md)

The conversation's 网络 panel is one of the dock's tabs, and a tab's body is remounted when the panel moves between the side dock and the bottom one. The Files, Memory, Trace and messaging panels already keep the reader's place across that move; the Network panel — added later — kept all of it in component state, so a move threw it away.

Measured in the browser: a reader who had searched `stream`, narrowed the type to streams, set the scope to "last 5 turns" and opened one record's detail came back on the untouched list — word cleared, both filters back at their defaults, the detail shut.

Now a body that arrives on the other surface is handed the search word, the scope and type, the open record and its tab back, and stamps the record with the surface it is on so the crossing back the other way works too. A tab closed and reopened, or a conversation switched away from and back to, still starts the panel over — those arrive on the surface the place was left on.

Deliberately not carried: whether raw values were revealed (the confirmation promises it applies to the current request only, so a move asks again rather than carrying unmasked keys to another surface), the open "more" menu and the reveal confirmation, and the fetched model bodies (the server's answer, read again when the row opens).

One more thing had to change for the place to survive: a jump from the reply's inline request line ("show me this turn") stayed in its store forever, so the body that arrived on the other dock replayed it and cleared the scope and the open record the place had just restored. A jump is now consumed by the body that applies it — it asked to show a turn then, not to be remembered as a place — while a second click still stamps a new one.

## Details

- `packages/web/src/features/network/network-place.ts`: `recallNetworkPlace` / `rememberNetworkPlace` over a per-Session record — the same rule as `trace-place.ts` / `memory-place.ts` (restore only from a different surface; drop a place that is exactly where the panel opens by itself; hand out copies).
- `packages/web/src/features/network/network-panel.tsx`: the reading controls and the open record start from the arriving place; every change (and arrival) writes the record; the jump is marked applied after it is taken.
- `packages/web/src/features/network/net-focus.ts`: `markNetworkFocusApplied`, and a monotonic stamp (two clicks in the same millisecond are two requests).
- `packages/web/src/features/chat/builtin-dock-panels.tsx`: `NetworkPanelBody` computes the surface from the dock handle and passes it down, like the Trace and Memory bodies do.
- `packages/web/test/network-place.test.ts` (seven cases) and `packages/web/test/net-focus.test.ts` (four): restore only across surfaces, copies, the newest write winning, the fresh-start drop, a search word on its own, one place per conversation; and the jump applied once, a later click still counted, out-of-order application ignored, subscribers told.
- `packages/web/e2e/network-panel.spec.mjs`: a sixth case drives the walk, the move and the close-and-reopen in a real browser.

## Compatibility

No API, data or copy changes; no new dependency. Nothing is persisted: a place lives for the move it describes, not across a reload.
