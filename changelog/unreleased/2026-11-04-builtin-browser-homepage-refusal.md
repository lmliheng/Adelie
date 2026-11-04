# A homepage that could not be saved says why under the address field, not in a six-second toast

- **Date:** 2026-11-04
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-04-builtin-browser-homepage-refusal.zh.md)

The built-in browser's "set homepage" dialog asks one question — the address new tabs and the Home
button open — and its Save sends the entry in the field. A save that fails leaves the dialog open on
exactly that entry, because the entry is what the reader is about to correct and the button beside it
is what retries. What the dialog lost was the reason: it arrived as a notification, sat over the
dialog, dismissed itself after six seconds, and left a dialog that read exactly as it did before the
press — the field unchanged, the Save button unchanged, and the address the sentence named right
there, unmarked.

That sentence is now drawn in the dialog, directly under the address field (`role="alert"`, danger
colour, two lines at most with the whole text on hover), and it stays while the dialog is open on
that entry. It belongs to the attempt that produced it, so any change of the entry — typing, "Use
current page", "Clear" — drops it, and the next press clears it before it is sent so a refusal that
repeats reads as this press's answer rather than as a sentence that never went away. The field's own
hint ("opens https://example.com/") stays visible under the box: the reason is added, not swapped in
for the one thing that tells the reader what the entry will do.

## Details

- `packages/web/src/features/builtin-browser/homepage-dialog.tsx`: one `refusal` state beside the
  entry — `edit()` (typing, "Use current page", "Clear") clears it, `save()` clears it before the
  request and sets it on failure. The failed save no longer raises `toastError`; the sentence is
  `S.builtinBrowser.homepageFailed(refusalText(err))`, the app-wide refusal slot rule (7.19) — a
  request that never reached the route reads its error code's localized sentence rather than the
  generic one.

## Tests

- `packages/web/e2e/builtin-browser-homepage-refusal.spec.mjs` (new, one case on a real server with
  the shell's `<webview>` stubbed and the browser routes inside the page): the settings write is
  stubbed at `page.route` — it is the one thing this dialog sends. A refused save keeps the dialog,
  the entry and the hint, draws the refusal under the field, and puts nothing in the notification
  region; seven seconds later (past the six an error notification lives) the sentence is still there.
  Typing one character drops it; the next press that fails brings it back. Once allowed, the dialog
  closes and the write carried the entry as it stood, read the way the address bar reads it.

## Compatibility

No interface change, no new dependency, no Project config change, no new strings — `homepageFailed`
already existed and keeps its exact wording.
