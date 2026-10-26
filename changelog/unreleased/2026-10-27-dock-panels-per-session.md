# Dock panels stay with their own Session

- **Date:** 2026-10-27
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-27-dock-panels-per-session.zh.md)

Every dock panel now belongs only to the Session on screen. A few automatic paths ran one render
after a switch with data that still belonged to the previous Session, so they acted on the
conversation switched to: the agents panel could open on a subagent it never spawned, the next
conversation's panel bodies could carry out the previous one's file link or memory row, a tab
close answered late could close the same panel elsewhere, and a first send that finished after the
user had moved on pulled them back to the new Session.

## Details

- Browser: whether the browser panel is on screen for the keep-a-tab rule is now asked of the
  docks as they stand when the effect runs, not of the render's slot. A conversation switch moves
  the docks first, while the outgoing conversation's panel still holds a visible slot for a
  render — the rule used to open a new-tab page for the conversation switched to.
- Agents panel: `useSessionStream` now reports which Session its state describes
  (`SessionStreamState.sessionId`), so the tracker ignores the render after a switch that still
  carries the previous Session's model and task state; the panel opens only when the docks on
  screen are that Session's own.
- First send and self-healed ids: `adoptDockScope(from, sessionId, stillOpen)` moves only `from`'s
  own arrangement, never the one on screen, and returns whether the user is still on `from` — the
  draft view and the self-heal path navigate only then. Whoever moved on stays where they are, the
  new Session appears in the sidebar, and its arrangement still moves across unless a new draft
  page of the same Project reuses the scope.
- The draft names its dock scope when the send starts, and tracks whether its page is still
  mounted (`openRef`), so a send that outlasts the page hands the arrangement over without
  navigating.
- Requests handed to panels (file links, memory rows, subagent chips) are now dropped while
  rendering the route that names another conversation, instead of in an effect after it, so the
  next conversation's panel bodies never mount with the previous one's request.
- A tab close that waits for a close guard (the Files panel's unsaved text) closes only if the
  conversation it was asked in is still the one on screen.
- `dock-state.ts`: the scope-map write is now a `writeScopes()` helper, shared by `persist()`,
  the scope switch and the handoff, because a handoff moves the map itself.
- Ported from upstream `ce9b3e69` (#1335), applied as its own change rather than merged. Not
  taken, because this tree does not have what they need: the browser half that compares against
  the conversation's own tabs (`wantsNewTabPage`'s `{ conversation, browserShown }` shape and the
  `state.scope` / per-Session tabs of upstream #1105 — this tree's browser state keeps one tab
  list for the window), the terminal panel's live `dockSessionId()` re-check
  (`features/terminal/terminal-panel.tsx` does not exist here), the `adoptBrowserSession` /
  `reownTerminals` calls in the self-heal path (neither exists here), and its jsdom case
  (`test/builtin-browser-sessions.test.ts`; this tree installs no jsdom — the behaviour is
  checked in a real browser instead).

## Compatibility

- No dependency, stored-data, package-name or config change. `penguin.dock.layout` keeps its
  shape and existing layouts load as before.
