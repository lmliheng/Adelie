# A refused plugin export leaves its reason on the card that asked

- **Date:** 2026-11-11
- **Type:** Fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-11-plugin-export-refusal.zh.md)

"Export plugin" on a library card fetches one zip of that plugin's directory and hands it to the
browser through a temporary object URL. When the server refuses the download, the plugin is still
there, the card is still there, and even the button that was pressed is still there — but the only
words explaining why were a notification that dismisses itself after six seconds, floating above
the list while the reader's eyes were on a card below.

That is the shape 7.19 forbids, and it is the same one the Skills tab (7.101) and the Hooks tab
(7.103) already fixed: all three export through the shared download
(`agents/archive-download.ts`), so all three fail the same way — the plugin card was the one left
raising a toast.

The reason is now drawn inside the card that asked (`role="alert"`, danger ink, at most two lines,
the whole sentence on hover) and stays until the next attempt starts; the same button is the retry.
The sentence says the export only reads, so nothing in the plugin was changed, rather than that the
plugin is still in the directory: an export really is a read, and "still there" would be false in
the very refusal that means it is gone (`unknown_plugin`).

## Details

- New `packages/web/src/features/plugins/plugin-export-refusal.ts`: `pluginExportRefused(plugin,
  error)` writes the sentence (the reason goes through `refusalText`, the rule every refusal in the
  app follows).
- `packages/web/src/features/plugins/plugins-page.tsx`: the card's `onExport` went from "returns
  void, toasts on failure" to returning a `WriteOutcome` — the same channel this card's update,
  uninstall and delete refusals already use — and the sentence lives on the **card** rather than on
  the page. Unlike the install refusal (`installRefusal`), an export moves the card to no other
  section and remounts nothing, so the instance that asked is the one that draws it.
- `packages/web/src/lib/strings{,-en}.ts`: one new `plugins.exportRefused(plugin, reason)`.

## Tests

- `packages/web/test/plugin-export-refusal.test.ts` (new, 6 cases): an answer the server gave is
  read through its code's own sentence (never the wire message), a failure this codebase raised
  keeps its own words, a value with nothing to say falls back to the generic text, the plugin that
  was not exported is named, the sentence says the export only read, and the English sentence.

## Compatibility

No interface change, no new dependency, no Project config change. The rest of the plugins library
— both import dialogs, install / update / uninstall onto an Agent, the admin's delete with its
confirmation and refusal line, the detail modal — is unchanged.
