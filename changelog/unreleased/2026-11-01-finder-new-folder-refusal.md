# A refused folder name says why under the New folder box, instead of in a toast that expires

- **Date:** 2026-11-01
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-01-finder-new-folder-refusal.zh.md)

In the Workspace finder, "New folder" opens a name box at the head of the list. A refused name —
one the folder already holds, or one that is a path rather than a name — leaves that box open with
what was typed and puts the caret back in it, because the name is the thing to change and Enter
again is the retry. The reason, though, arrived as a toast that dismissed after six seconds, so the
box was left looking untouched and unexplained.

The sentence now stays with the box: under the field, in the danger ink, as a `role="alert"`
clamped to two lines with the whole of it on hover, until the name changes or another attempt
starts. It goes when the box goes (Enter on a free name, Escape, or focus moving elsewhere) —
nothing was written, and nothing on screen is left claiming it was.

The name itself is now checked before the request, with the server's own rule: a separator (either
spelling), `.` or `..`, or a NUL is a path rather than a name, and would either escape the folder
on screen or name nothing. Asking it in the browser lets the box say so without a round trip; what
the filesystem dislikes on its own (`*` on Windows, a name that is too long) still comes back from
the server as a refusal, since only it can know. No new copy was written: both sentences come from
the app's existing error table for `dir_exists` and `dir_name_invalid`, through the shared
`refusalText()`.

## Details

- `packages/web/src/features/chat/workspace-finder.tsx`: a `newFolderRefusal` state, filled by both
  failure paths instead of `toastError` and cleared at the first keystroke, when the box opens, and
  when an attempt starts. The box and the sentence share one column inside the row, so the sentence
  wraps where the name does rather than under the folder glyph.
- `canMakeFolder(name)` in `workspace-finder-model.ts` — whether a name is one segment, mirroring
  the route's `dirNameError` — is a function of its own, so the rule is tested without a DOM.

## Tests

- `packages/web/test/workspace-finder.test.ts` (three unit cases added): a plain name, one with a
  dot or a space, a leading dot and a non-ASCII name are all taken; `a/b`, `a\b`, `.`, `..` and a
  name holding a NUL are refused; nothing at all is refused.
- `packages/web/e2e/finder-new-folder-refusal.spec.mjs` (new, two browser cases against the real
  server): a name the folder already holds leaves the route's own 409 under the box — the typed
  name still there, nothing in the notification area, still there seven seconds later — and the next
  name clears it and lands the folder on disk; a name with a separator is refused in place with no
  create request sent at all, and Escape takes the sentence away with the box.

## Compatibility

- No API or request change: the box sends the same `{parent, name}` to the same route and reads the
  same answers. A name that would not have worked now fails without a round trip; everything the
  filesystem alone can judge still goes to the server as before.
