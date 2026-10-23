# Files panel: a refused New, rename or delete keeps its question — and the reason — instead of toasting

- **Date:** 2026-10-23
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-23-files-action-refusal.zh.md)

The Files panel's three entry actions — New (file or folder), rename/move, and delete — all ask
first. A refusal used to arrive as a toast only: the card did stay open (nothing had been written),
but the reason landed in a notification that dismissed itself after six seconds and sat above the
card, while the entry it was about was still on the page and on disk. Rename and delete were a step
worse — the sentence still said "Refresh and try again", while the card's confirm button carried the
version marker the refused attempt had just proved stale, so pressing it again could only earn the
same refusal.

Now all three draw the reason inside the card that asked (`ConfirmModal`'s `refusal` slot, same
"Refused:" lead-in), and a `file_changed` refusal re-reads that entry's version: the confirm button
is disabled while it lands and then retries against the file as it is now. A New that lands on a
taken name behaves the same — the name stays in the field to be changed.

## Details

- `features/chat/workspace-browser.tsx`: `reportFileActionError` (a toast and nothing else) becomes
  two things — `fileActionReason` turns the failure into the one sentence the card shows, and
  `readActionVersion` reads the marker, with a re-read path. A re-read clears the version and sets
  `reading` first (the confirm goes grey and the card says the version is being read), then settles
  on the new marker. `beginFileAction` drops the previous reason as it opens the card — that
  sentence belonged to the entry the last attempt named.
- The New path judged `target_exists` itself; it now reports through `createRefusal`, which
  `beginCreate` clears when it opens.
- `S.files.changedBeforeAction` ends with "its version has been read again — retrying works right
  away" instead of "Refresh and try again": the behaviour changed, so the sentence follows (Chinese
  alongside).
- New browser test `e2e/files-action-refusal.spec.mjs` (three): a taken name keeps the card, the
  name and the reason (nothing to dismiss in the notification region), and the same button creates
  once the name is free — reopening without the old reason; a refused rename (`page.route` 500)
  keeps the card, its sentence and the file where it was, and the same button moves it once
  permitted; a delete refused with `file_changed` (`page.route` 409) shows the sentence naming that
  file, re-enables its confirm after the re-read, and the retry removes it.
- The existing "a taken name changes nothing" assertion in `e2e/files-folders.spec.mjs` narrows from
  "the page has this sentence" to "the dialog has this line", which is where it is drawn now.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* the card closes, *where*
  the reason is drawn, and *which* marker the confirm carries after a `file_changed`. No new copy
  beyond the existing `S.common.refused` lead-in.
