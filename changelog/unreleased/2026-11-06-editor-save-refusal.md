# A save the Files panel could not write says why above the editor, not in a six-second toast

- **Date:** 2026-11-06
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-06-editor-save-refusal.zh.md)

The Files panel edits a text file in place: the preview becomes an editor, and Save writes the draft
back to the Workspace. When that write did not land — the server refused it, the path had no
permission, the request never arrived — nothing on the panel changed: the editor stayed open with
the draft in it, the header's Save was the retry, and the reason went to a notification that
dismissed itself after six seconds. Afterwards the panel looked exactly as it had before the press,
the file on disk still held the old text, and what the reader had typed was nowhere but the editor,
with no word about why.

That sentence now renders between the header and the editor (`role="alert"`, danger colour, two
lines, the whole sentence on hover), and stays until the draft is edited, the save is pressed again
or the edit is left. When the draft differs from the file it also says that what was edited is still
only in the editor — which is the state the reader is left in; when the two are equal (Save pressed
on an untouched file) it is just the reason.

## Details

- `packages/web/src/features/chat/editor-save-refusal.ts` (new): `editorSaveRefusal(error, sent,
  baseline)` — the pure decision, so which sentence appears is in one place and testable without the
  panel.
- `packages/web/src/features/chat/workspace-browser.tsx`: the editor gains a `saveRefusal` state
  (carrying the file's path, so it only ever draws over the draft it is about). `save()`'s failure
  branch no longer calls `toastError` but writes that sentence; opening the editor, editing the
  draft, the next save and a scope switch each clear it. A `file_changed` (409) still goes to its own
  overwrite confirmation: that is a question, not a failure.
- `packages/web/src/lib/strings{,-en}.ts`: one new pair, `files.saveRefused(reason)` /
  `files.saveRefusedDraftKept(reason)`.

## Tests

- `packages/web/test/editor-save-refusal.test.ts` (new, 6 cases): a server answer is read through its
  code's own localized sentence, never the wire message; a draft that differs from the file gets the
  "still only in the editor" half and an unchanged one does not; a value this codebase raised is
  shown as it wrote it; nothing to say falls back to the generic sentence; the active language is the
  one used.
- `packages/web/e2e/editor-save-refusal.spec.mjs` (new, real server, real browser): the write is
  stubbed to 403, the draft is typed and Save pressed and confirmed. The line appears under the
  header, the notification region never carries it, the file keeps its old text while the editor
  keeps the draft and a working Save; **seven seconds later** (past the six an error notification
  lives) it is still there; one keystroke clears it; with the route allowed through the retry writes
  the file and the line does not come back. A second case: leaving the editor after a refusal (and
  confirming the discard) takes the line with the draft.

## Compatibility

No interface change, no new dependency, no Project config change. The editor's own "over the write
limit" check keeps its notification: it sends nothing and rewrites nothing — what has to change
there is the content itself.
