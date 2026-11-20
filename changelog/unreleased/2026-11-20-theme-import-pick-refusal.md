# A theme file the browser would not read says why beside the picker, not in a leaving toast

- **Date:** 2026-11-20
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-20-theme-import-pick-refusal.zh.md)

A theme file past the 256 KB cap is refused before the browser reads a byte of it — and the reason
arrived as a notification over the open import dialog. The dialog then had nothing: no file name
beside the picker, a greyed-out confirm, and six seconds later no sentence at all to say why the
pick had taken nothing. A read that failed handed the same shape of sentence to the same toast.

Both now draw in the dialog's own body, under the picker that chose the file (7.19's rule: the
sentence belongs where the attempt was made), and they stay until the next pick. Which sentence is
which stayed a pure function with a test.

## Details

- `packages/web/src/features/settings/theme-import.ts`: `pickedFileRefusal(cause)` (new) — the two
  ways a pick fails before anything is sent (`too_large`, `unreadable`) each get their own sentence;
  neither is a server answer, so neither goes through the codes a failed import maps.
- `packages/web/src/features/settings/theme-import-dialog.tsx`: `onPickFile` puts the size refusal
  and the reader's failure into the dialog's `refusal` slot instead of `toastError`; picking is a new
  attempt, so each pick clears the sentence first, and a file within the cap is taken with nothing
  left behind.

## Tests

- `packages/web/test/theme-import.test.ts` (+2 cases, 11 in the file): the two causes speak two
  different sentences, both are non-empty, and both follow the interface's dictionary.
- `packages/web/e2e/theme-import-refusal.spec.mjs` (+1 case, 4 in the file, real server + real
  browser): a 300 KB pick draws the sentence in the dialog, once, with nothing in the notification
  stack, the dialog still up, no file name, the confirm disabled — and it is still there after seven
  seconds; picking a small file then clears it, shows the name and enables the confirm.
- **Reverse test**: the same spec against the pre-change build fails that case (no sentence in the
  dialog at all), and the three cases it did not touch stay green.

## Compatibility

Front-end rendering only: no API, wire format or stored data changed, and the server was not
touched. The 256 KB cap is unchanged and still core's `MAX_THEME_FILE_BYTES`.
