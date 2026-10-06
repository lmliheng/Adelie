# Web: every Workspace group can be taken off the sidebar, and nothing is deleted

- **Date:** 2026-10-06
- **Type:** feature
- **Scope:** `web`

[中文版](2026-10-06-sidebar-remove-workspace.zh.md)

A Workspace group's ⋯ menu offered 删除工作区 only for a Workspace the user had added by hand. For a
group the server derives from Sessions — which is most of them — the click wrote the registry entry
and the group stayed exactly where it was, because the merge only ever drops an empty registry
entry: the Workspaces a user was done with kept piling up in the sidebar with no way to take them
off it.

The removal now works for every Workspace group. It hides the group — and the chat rows inside it,
which were the reason the group was still there — from the sidebar alone: the directory on disk and
every Session in it are untouched, the confirmation says so, and picking the same folder again under
新建工作区 puts the group back. A chat created in that directory after the removal brings it back on
its own, so a live conversation can never end up invisible.

## Web

- `lib/workspace-registry.ts`: a registry entry gained `hiddenAt` (the instant of the removal), and
  `dropHiddenWorkspaces` reads it — the group goes while every chat in it predates that instant, and
  comes back the moment one was created after it. `unregisterWorkspace` became `hideWorkspace`;
  registering a hidden pair clears the stamp and keeps its alias.
- `components/layout/sidebar.tsx`: 删除工作区 is offered by every Workspace group that is one
  directory (the merged temporary group has no path to act on), not only the registry-backed ones;
  the confirmation copy states the scope — the list only, nothing deleted, restorable.
- `test/workspace-registry.test.ts` (31 tests) covers the stamp and its way back, per machine, the
  hidden-but-revived rule, and the stamp that cannot be read.
