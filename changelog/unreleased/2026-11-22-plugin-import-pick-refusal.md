# A zip the plugin upload dialog refuses keeps its reason beside the picker

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-22-plugin-import-pick-refusal.zh.md)

The plugin library's local upload dialog refuses two kinds of pick before anything is sent: a zip past
the 14 MB decoded-archive cap (so the server's own 413 never has to be earned) and a file the browser
cannot read at all. Neither produced a file name beside the picker, the confirm button stayed held
back — and the only account of what had just happened was a notification over the open dialog, which
dismissed itself after six seconds. Afterwards the dialog looked exactly as it had before the pick,
with nothing saying the file had been refused or why.

Both now land in the dialog's own refusal line, directly under the picker — the same line a refused
import already uses. A file the browser could not read also gets its own sentence instead of the
blanket "request failed" the notification carried.

## Details

- `packages/web/src/features/plugins/plugin-import.ts`: `pluginPickRefusal(cause)` — the two
  sentences for a pick that never became a request (`too_large` quotes the ceiling the guard
  applies, `unreadable` says the file could not be read), beside `pluginZipTooLarge` which decides
  the first.
- `packages/web/src/features/plugins/plugin-import-dialog.tsx`: `refusePick` drops the pick with the
  sentence (the picker then names no file and the confirm cannot offer the previous archive) and
  writes it into the dialog's `refusal` slot; `onPickFile` clears that slot as a pick starts, and both
  the size guard and `FileReader`'s error go through it instead of `toastError`.
- `packages/web/src/lib/strings.ts`, `strings-en.ts`: `plugins.importUnreadable`.

## Tests

- `packages/web/test/plugin-import.test.ts` (+2): the size sentence quotes the ceiling the guard
  applies; the read failure has its own sentence, not `S.common.unknownError`.
- `packages/web/e2e/plugin-import-pick-refusal.spec.mjs` (new, 2 cases, real server + real browser):
  a 14 MB + 1 zip → the line under the picker, absent from the notification region, still there after
  seven seconds, no file named and the confirm disabled, and a file that fits answers it; a read
  failure (the reader stubbed, since a healthy temporary file cannot fail) → the other sentence in the
  same place. Against the previous build both cases fail: the size one is a six-second notification,
  the read failure one the blanket "request failed".

## Compatibility

No route, stored format or wire type changed; both refusals stay on the client, and the upload itself
is untouched.
