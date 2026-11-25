# A path the Workspace finder cannot reach keeps its field, and the reason stays under it

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-26-finder-address-refusal.zh.md)

The Workspace finder's address bar turns into a path field (⌘⇧G / Ctrl+Shift+G, or a click). A path
it could not reach closed the field whatever the answer was: the bar went back to the folder it had
shown, the typed text went with the field, and the reason was a notification that dismissed itself
after six seconds. A typo in a long path therefore cost the whole path — it had to be typed again
to fix one letter — and the reason expired while the reader was looking at a bar that showed
nothing wrong.

The field now comes back holding the path that was typed, selected as when it is opened, with the
server's own sentence for the code right under it. Fixing the path in the same field walks the
finder there; Escape or leaving the field puts the bar back and takes the sentence with it. A
folder that is there but refuses to be read is unchanged: the finder stands there and its own pane
says why it shows nothing.

## Details

- `packages/web/src/features/chat/workspace-finder.tsx`: `addressRefusal` (the sentence, drawn
  under the field it belongs to) and `addressAttempt` (an answer only puts the field back while it
  is still the attempt on record — the user may have taken the field back or left it meanwhile).
  `commitAddress`'s failure handler keeps `dir_permission_denied` as it was and, for anything else,
  shows `refusalText(err)` and reopens the field; `editAddress` / `cancelAddress` clear the
  sentence and close the attempt.
- The notification it used to raise (`S.chat.workspaceDirInvalid`, "the directory does not exist
  or is inaccessible; reverted") is gone from both dictionaries: the bar no longer reverts, and the
  per-code sentences say which of the two it is.
- `packages/web/e2e/finder-address-refusal.spec.mjs`: two cases — the field and the sentence
  survive seven seconds (a toast's life) and the same field walks the finder on once the path is
  fixed; Escape and Tab put the bar back and take the sentence.

## Compatibility

The Web App only. No route, no server change, no new dependency.
