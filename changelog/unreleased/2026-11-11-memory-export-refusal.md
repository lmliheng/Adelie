# A memory group that was not exported keeps its reason in the group

- **Date:** 2026-11-11
- **Type:** fix
- **Scope:** `web` (one slot added in `ui`)
- **Breaking:** no

[中文版](2026-11-11-memory-export-refusal.zh.md)

Every group on the Memory tab carries "Export" on its head strip: it fetches that group's transfer
document and hands it to the browser through an object URL. When the server refused the download,
the group was still there, every memory in it was still there, and the button that asked was still
under the pointer — while the only thing saying why was a notification that dismissed itself after
six seconds, floating above the list while the reader was looking at one group below it.

That is the shape 7.19 forbids, and the same one the Skills tab (7.101), the Hooks tab (7.103) and
the plugin card (7.107) each already fixed: the Memory tab was the last one still answering with a
toast. The reason is now drawn in the group that asked (`role="alert"`, danger ink, at most two
lines, the whole sentence on hover) and stays until the next attempt; pressing "Export" again is the
retry. The sentence says the export only reads and no memory was changed — an export really is a
read, and a failed one is the moment a reader wonders whether the attempt went through the files.

This host has a wrinkle the others do not: the export button sits on a **collapsible section's** head
strip, and the body it folds away is where the rows live. So `CollapsibleSection` in `ui` gained a
`notice` slot — between the head strip and the fold, inside the card and outside the folded part:
with the group folded, the head strip is all of it that shows, and the sentence has to stay with it.

## Details

- `packages/ui/src/components/layout/collapsible-section/collapsible-section.tsx`: a `notice` slot
  after the head strip and before the fold (`border-line-muted` separator). Omit it and the card
  reads exactly as before; existing callers are untouched.
- New `packages/web/src/features/agents/memory-export-refusal.ts`: `memoryExportRefused(scope,
  error)` builds the sentence (`refusalText`, the rule every refusal in the app follows), and
  `memoryExportRefusalFor(refusal, scopeKey)` decides which group draws it — by **key**, not title:
  two Workspaces' folders can share a last segment, and the key is the group the attempt asked.
- `packages/web/src/features/agents/memory-tab.tsx`: `exportScope` records a failure in
  `exportRefusal` for its group's `notice` instead of calling `toastError`, and clears the previous
  sentence when an attempt starts. `scopeTitle` moved to module level: the refusal is built at the
  moment of failure, on a render path that may have returned early.
- `packages/web/src/lib/strings{,-en}.ts`: one new `memory.exportRefused(scope, reason)`.

## Tests

- `packages/ui/test/collapsible-section.test.ts`: the notice sits after the head strip and before the
  body (folded too), and without the prop the slot does not exist at all.
- `packages/web/test/memory-export-refusal.test.ts` (new, 9 cases): a server answer is read through
  its code's own sentence (never the wire message), a value raised in the interface keeps its words,
  nothing said falls back to the generic text, the group is named, the sentence says the export only
  read, the English copy, and three cases for "only the group that asked, by key and not by title".
- `packages/web/e2e/memory-export-refusal.spec.mjs` (new, 2 cases, real server + real browser): a
  refused export leaves one sentence in that group, verbatim, with no toast, still there seven
  seconds later and still readable once the group is folded; after the download is allowed, the same
  button makes the sentence go and the browser really receives the document, with the server's
  memories exactly as they were.

## Compatibility

No interface change on the wire, no new dependency, no Project config change. Existing
`CollapsibleSection` callers (model library, plugin library, gallery) are unchanged, and the Memory
tab's other actions — view / edit / add through a chat, the delete and import confirmations with
their own refusals, the two prompt fields and their placeholders — are not touched.
