# An upload the Files panel could not land says why above the listing, not in a six-second toast

- **Date:** 2026-11-06
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-06-upload-refusal.zh.md)

The Files panel takes picked or dropped files and writes them into the current Workspace directory.
When that write did not land — the server refused it, the directory had no permission, the request
never arrived — nothing on the panel changed: the file never appeared in the tree, the listing still
held what it held, the picker was ready for the same files again, and the reason went to a
notification that dismissed itself after six seconds. Afterwards the panel looked exactly as it had
before the pick, and the files were still only on the reader's own disk, with no word about why.

That sentence now renders between the header and the listing (`role="alert"`, danger colour, two
lines, the whole sentence on hover), and stays until the next upload starts or the Session switches.
When nothing landed it says "could not upload to <dir>: <reason>"; when the batch stopped halfway it
names the files that did not go up instead — the only way to know what to pick again. The sentence
carries the directory's name, because an upload can go to a folder other than the one in view (the
row menu's upload).

## Details

- `packages/web/src/features/chat/upload-refusal.ts` (new): `uploadRefusalLine(error, target, sent,
  unsent)` — the pure decision, so which sentence appears is in one place and testable without the
  panel.
- `packages/web/src/features/chat/workspace-browser.tsx`: the Files panel gains an `uploadRefusal`
  state. `doUpload()`'s failure branch no longer calls `toastError` but writes that sentence; the
  next upload and a scope switch each clear it.
- `packages/web/src/lib/strings{,-en}.ts`: one new pair, `files.uploadRefused(dir, reason)` /
  `files.uploadRefusedPartial(dir, names, reason)`.

## Tests

- `packages/web/test/upload-refusal.test.ts` (new, 7 cases): a server answer is read through its
  code's own localized sentence, never the wire message; a whole-batch refusal names no files; a
  half-landed batch names the rest and never counts what landed as a failure; the directory is named
  as the panel names it (the root is "."); a value this codebase raised is shown as it wrote it;
  nothing to say falls back to the generic sentence; the active language is the one used.
- `packages/web/e2e/upload-refusal.spec.mjs` (new, real server, real browser): the write is stubbed
  to 403 and a file is picked through the panel's own picker. The line appears under the header, the
  notification region never carries it, the directory stays empty and the tree has no row for the
  file; **seven seconds later** (past the six an error notification lives) it is still there; with
  the route allowed through, picking the same files again writes the file, the row appears and the
  line does not come back. A second case: of three files the first really lands and the second is
  refused — the line names only `b.md, c.md`, and `a.md` is really on disk and not counted as a
  failure.

## Compatibility

No interface change, no new dependency, no Project config change. The checks made while picking keep
their notification: oversize files and dropped folders are named and skipped before anything is sent
— what has to change there is what was picked, not a server's reason.
