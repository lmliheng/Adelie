# Model library groups all start closed

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-24-model-groups-start-collapsed.zh.md)

The Models page used to open the first group of the catalog on a first visit, and importing a
group opened the group it had just created. Both were expansion preferences nobody chose: the
leading group stood in for "the one you probably want" until the catalog grew past a handful of
groups, and the import's preference outlived that import in the Project's stored set. Every group
now starts closed, and the only thing that opens one is the user's own click.

## Details

- `packages/web/src/features/models/model-group-expansion.ts`: `defaultExpandedProviders()`
  answers the empty set, so "nothing stored for this Project", "no Project yet" and "corrupted
  storage" all mean the same as a stored empty array — nothing expanded. The stored set keeps
  its shape (a JSON array of expanded provider ids, per Project); search still force-opens the
  groups that hold matches without writing anything.
- `packages/web/src/features/models/models-page.tsx`: the import landing no longer writes an
  expansion preference for the new group (and `importGroup` therefore no longer takes its name —
  the group's connection is written by the dialog that collected it), so a group created by
  import arrives closed like every other group and stays a group the user decides about.
- Unit tests `packages/web/test/model-group-expansion.test.ts` follow the new default; new e2e
  `packages/web/e2e/models-group-expansion.spec.mjs` (2 tests) drives a first visit, a keyboard
  toggle across a reload, search and an import against a throwaway provider on a random port.

## Compatibility

No interface, stored-data or catalog change. A Project that had opened groups keeps them open —
its stored set is read exactly as before; only Projects that never opened one now stay closed.
