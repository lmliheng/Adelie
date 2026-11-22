# Retrying a directory that could not be listed also lists what is still open under it again

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-22-files-retry-descendants.zh.md)

When a directory's listing in the file tree could not be read, the reason was drawn under its row and that
listing was dropped — so the directories still open beneath it were no longer drawn, but each kept the listing
it had. Once the reader clicked that row and the read succeeded, the subtree came back on screen carrying what
had been read before the failure: files deleted in between were still there and newly written ones were
missing, until every folder was collapsed and opened again by hand.

A retry that lands now lists every open directory under it again. If one of those re-reads fails in its turn,
the reason goes under its own row as usual instead of showing the old rows first. The root is unaffected: its
failure stands in place of the whole tree, and Refresh already re-reads every open directory by itself.

## Details

- `packages/web/src/lib/workspace-tree.ts`: new `openDirsUnder(expanded, dir)` — the open directories strictly
  inside one. A sibling that merely shares the prefix is not in it, and the root has no descendants by this
  spelling because the root's failure uses the other slot (the whole tree).
- `packages/web/src/features/chat/workspace-browser.tsx`: `loadDir` remembers up front whether this attempt is
  a retry, and its success branch queues every level `openDirsUnder` names (through `loadDirRef`, since a
  callback cannot list itself as a dependency). The comment records why this is the only place for it: a click
  on the row is the one retry that names a single directory, and Refresh re-reads every open one anyway.

## Tests

- `packages/web/test/workspace-tree.test.ts` (+1): strictly inside, not the directory itself, not a
  prefix-sharing sibling, nothing through the root.
- `packages/web/e2e/files-retry-descendants.spec.mjs` (new, 2 cases, real server + real browser): ① docs'
  listing is refused → Refresh → the tree on disk has been rewritten at both levels → clicking docs to retry
  brings the new rows and drops the old ones; ② the descendant api is refused as well → its row carries the
  reason instead of the old rows, and once released a click on it is the retry in its turn.

## Compatibility

The API, the stored state and the wire format are unchanged; no new dependencies.
