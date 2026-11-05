# A refused plugin import says why inside the dialog that asked, not in a six-second toast

- **Date:** 2026-11-05
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-05-plugin-import-refusal.zh.md)

The plugin library's two import dialogs (the header's "Upload plugin" and "Download from an
address or npm") each ask for a source plus an optional name. A refused import writes nothing:
the dialog stays open with the archive picked or the address typed exactly as it was, and the
confirm button is the retry. The reason arrived as one notification that dismissed itself after
six seconds — afterwards the dialog looked precisely as it had before the press, with the thing
that has to be fixed (the address, the file) sitting there and nothing said about it.

The reason now stays under the source field of the dialog that asked (`role="alert"`, danger
colour, two lines with the whole text on hover) until the source is edited, the next import is
started, the dialog is closed or the import lands — so it always describes the last attempt. Two
cases keep the homes they already had: a 409 `plugin_exists` is a question, and it is asked in the
overwrite confirmation (which names the plugin); and an answer that lands after Cancel was pressed
(both dialogs' Cancel stays live during a request) keeps the notification, because a sentence
drawn into a closed dialog is a sentence nobody reads.

Whose words: the plugin codes get their own copy, everything else follows `refusalText`, the rule
every refusal slot in the app uses (7.19) — a request the server answered is read through its
code's localized sentence, and a value this codebase raised itself is shown as it wrote it.

## Details

- `packages/web/src/features/plugins/plugin-import-refusal.ts` (new): `importFailure(error,
  fallbackName, dialogOpen)` — one of three outcomes (`ask` with the plugin name, `field` with the
  sentence, `toast` with the sentence when no dialog is left to keep it in), so the branch the
  dialogs used to spell inline is one testable decision.
- `packages/web/src/features/plugins/plugin-import-dialog.tsx`: a `refusal` state keyed by the
  dialog that asked, the ref mirrors of both open flags (the answer decides where it goes, not
  the press), `ImportRefusalLine` — the shared line — under the file picker in the upload dialog
  and under the URL field in the download dialog, cleared by every edit, every new attempt,
  closing either dialog and a landed import.

## Tests

- `packages/web/test/plugin-import-refusal.test.ts` (new, 7): the 409 reads the plugin name out of
  the server's message and falls back to the caller's name; a refusal keeps the dialog's slot
  while it is open; the plugin codes use their own copy rather than the server's English; an
  unmapped code falls back to the shared table; a closed dialog gets the notification instead; an
  error this codebase raised keeps its own message; the interface language is respected.
- `packages/web/e2e/plugin-import-refusal.spec.mjs` (new, real server + real browser, 2): a
  refused download draws the sentence under the address, the notification region never carries
  it, the dialog the address and the button all survive; still there after 7 seconds; editing the
  address clears it; the retry closes the dialog and reports the import. The second test cancels
  during the request and finds the sentence in the notification instead.

## Compatibility

No interface change, no new dependency, no Project configuration change. The routes, the payloads
and the 409 confirmation are untouched.
