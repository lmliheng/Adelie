# A hook package that failed to export says why under the row that asked

- **Date:** 2026-11-08
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-08-hook-export-refusal.zh.md)

Every row of Agent settings → Hooks has an "Export": it fetches the installed hook package as a zip
and hands it to the browser through a temporary object URL. When the server refused that download,
the package was still installed, the row was still on screen, and even the button that was pressed
was still there — but the only account of why was a notification that dismissed itself after six
seconds, floating above the list while the reader's eyes were on a row below it.

That is the shape 7.19 bans, and the Skills tab's rows were fixed the same way one round earlier
(7.101). A failed export is the one moment a reader wonders whether the installed copy was touched,
so the sentence says the package is still installed on the agent as well as why the export did not
land.

The reason now renders under the row that asked (`role="alert"`, the danger tone, two lines at most,
the whole sentence on hover) until the next attempt begins; pressing the same export button is the
retry. Which row draws it is decided by the package's name, one at a time, and no other row changes
by a character.

## Details

- `packages/web/src/features/agents/hook-export-refusal.ts` (new): `hookExportRefused(hook, error)`
  builds the sentence (the reason goes through `refusalText`, the one rule every refusal in the app
  follows), and `hookExportRefusalFor(refusal, hook)` decides which row this refusal belongs to.
- `packages/web/src/features/agents/hooks-tab.tsx`: `exportHook` no longer posts a toast on failure;
  it keeps `{ hook, text }` and hands it to that row, and the start of every attempt clears the
  previous sentence (it belonged to the attempt before). The list row goes from a single flex line to
  "row + optional reason line"; the hover background and the divider stay on the outer element, and
  nothing else about the layout moves.
- `packages/web/src/lib/strings{,-en}.ts`: one new sentence, `hooks.exportRefused(hook, reason)`.

## Tests

- `packages/web/test/hook-export-refusal.test.ts` (new, 9 cases): the server's reason read through
  its code (never the wire message), a sentence this codebase raised itself kept as written, the
  generic text when nothing was said, the package named, the installed copy called out, and the
  English sentence; plus three on "a refusal belongs only to its own row".
- `packages/web/e2e/hook-export-refusal.spec.mjs` (new, real server + real browser): the export
  button of a hook package that really is installed, with the archive route refused at `page.route`
  with a 500. The sentence appears exactly once, under that row, word for word in the interface's
  own language; the notification region does not carry it; the row's own line reads exactly as it
  did before the attempt; it is **still there seven seconds later**; and the server's installed list
  is unchanged. Allowed, the same button pressed again makes the sentence go and really hands the
  zip to the browser as a download.

## Compatibility

No interface change, no new dependency, no Project config change. The rest of the Hooks tab — the
Agent-level enable switch, the import modal (chat import and zip upload, overwrite confirmation),
the uninstall confirmation and its own refusal line — is unchanged.
