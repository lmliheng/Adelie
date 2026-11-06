# A published plugin the library could not take says why in its own row, not in a six-second toast

- **Date:** 2026-11-06
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-06-plugin-library-add-refusal.zh.md)

The plugin shelf's one verb on a published package — "add to the library" — is the npm import the
header dialog performs, without typing the address. When that fetch did not land (the registry did
not answer, the package could not be downloaded, the request never arrived) nothing changed: the
plugin was still nowhere, the same row still stood on the shelf with the same button, and the
reason went to a notification that dismissed itself after six seconds. Afterwards the row read
exactly as it had before the press, with nothing said about why.

That sentence now renders under the row it belongs to (`role="alert"`, danger colour, two lines,
the whole sentence on hover), outside the row's link so a click on it does not navigate away, and
stays until the next attempt on the shelf or the page goes. The row and its button are what the
reader retries from, so the reason has to outlive the press — which is the whole difference between
this and a toast. A name already taken is not a refusal and keeps its own place: the overwrite
confirmation, which the row raises with the plugin named in it.

## Details

- `packages/web/src/features/plugins/library-add-refusal.ts` (new): `libraryAddRefused(error)` —
  the pure decision of which words appear, so it is testable without the page. Plugin codes read
  through `pluginImportErrorText` (their own copy, never the English wire message), anything the
  client raised itself through `refusalText` (7.19's rule).
- `packages/web/src/features/plugins/plugins-page.tsx`: the page keeps `libraryRefusal`
  (specifier + sentence). `addPublishedToLibrary()` no longer toasts a failure: it clears the
  sentence when an attempt starts and writes it when the attempt fails; the published row reads it
  through `ModuleRow`'s new `refusal` slot. The row is now a column — the existing flex row plus
  the sentence underneath — so the reason sits inside the card rather than inside the link.
- `packages/web/src/lib/strings{,-en}.ts`: one new sentence,
  `plugins.libraryAddRefused(reason)`.

## Tests

- `packages/web/test/library-add-refusal.test.ts` (new, 5 cases): a plugin code reads its own
  localized copy and never the wire message; a code the plugin routes do not own falls back to the
  shared table; a value the client raised is shown as it wrote it; nothing to say falls back to the
  generic sentence; the active language is the one used.
- `packages/web/e2e/plugin-library-add-refusal.spec.mjs` (new, real server + real browser, 2
  cases): the fetch is stubbed to a 502 and the shelf's own verb is pressed — the sentence appears
  in that row, the notification region never carries it, the row and its enabled retry are still
  there, **seven seconds later** (past the six an error notification lives) it is still there, and
  the next attempt clears it. The second case: a 409 `plugin_exists` still opens the overwrite
  question (which names the plugin) and draws no refusal line; answering it re-sends the same
  request with `overwrite: true`.

## Compatibility

No interface change, no new dependency, no Project config change. The success path, the overwrite
question and the header dialog's own imports are untouched.
