# A directory in the file tree that fails to list keeps its row, with the reason under it

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `web`, `ui`

[中文](2026-11-22-files-dir-error.zh.md)

The Files panel lists each directory the first time it is opened. When that read failed for a
directory below the root, the panel raised a toast and dropped the row — six seconds later nothing on
screen said the directory existed, and nothing said what had gone wrong. The reader's place in the
tree was taken by a failure, and the only way back was to guess that Refresh would help.

The nested row now stays where it was, still open, with the reason drawn under it in the danger ink;
a click on that row is the retry. The root's failure is unchanged: it has no row to sit under, so it
still stands in place of the tree (7.19's rule: the sentence stays where the attempt was made).

## Details

- `packages/ui/src/components/files/file-tree/tree-rows.ts`: `FileTreeRow` gains an optional
  `error` — why a directory's listing could not be read. The row, its place and its open state
  belong to the reader; the failure only adds the sentence.
- `packages/ui/src/components/files/file-tree/file-tree.tsx`: an open directory carrying `error`
  draws the reason where its children would be (same indent and size as the empty-directory line,
  danger ink), and mounts no group. It is not a row, so the tree's keyboard walk never lands on it.
- `packages/web/src/lib/workspace-tree.ts`: `flattenTree` takes the failed listings and puts the
  reason on the directory's row (a listing always wins, so the two cannot both show);
  `movedFailures` carries the reasons through a rename and `droppedFailures` drops those of a removed
  entry.
- `packages/web/src/features/chat/workspace-browser.tsx`: the nested branch of `loadDir` records the
  reason instead of toasting and un-expanding (and still drops the stale listing, so rows the earlier
  read found cannot outlive the directory); `refreshAll` retries failed directories that are still
  open; `toggleDir` reads a failed directory again instead of closing it; a rename moves its reason
  and a delete takes it along.
- `packages/web/src/lib/strings.ts` / `strings-en.ts`: new `files.dirListFailed` — the reason plus
  the fact that the row is the retry.

## Tests

- `packages/ui/test/file-tree.test.ts` (+1): a directory row with an `error` keeps its row and
  `aria-expanded="true"`, draws the reason in the danger ink, and mounts no group.
- `packages/web/test/workspace-tree.test.ts` (+1): a failed directory keeps its row carrying the
  reason and is marked unloaded; a listed directory never carries one.
- `packages/web/test/workspace-tree-moves.test.ts` (+1): failures follow a rename (a
  prefix-sharing sibling stays), and removing an entry drops its failure and its descendants'.
- `packages/web/e2e/files-dir-error.spec.mjs` (new, 2 cases, real server + real browser): ① a
  directory deleted before it is ever opened → clicking it draws the reason under a row that is
  still there and still open, **still there after seven seconds**, and with the directory restored a
  second click lists it and the reason goes; ② a directory already open with rows on screen, deleted
  and then refreshed → the reason appears and its stale rows are gone.

## Compatibility

The stored state, the file API and the wire format are unchanged; the server is untouched.
