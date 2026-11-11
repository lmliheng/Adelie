# A memory group keeps the reason a picked file was not imported

- **Date:** 2026-11-11
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-11-memory-import-refusal.zh.md)

Each group on the Memory tab carries "Import" on its head strip for the owner: a file input wrapped
in that strip's label, which reads the picked export document and opens the import dialog. A file
that is not a memory export never reached that dialog — and the only thing that said why was a
notification that dismissed itself after six seconds, floating above the list while the reader was
looking at the group they had just picked the file for. Nothing had happened, no dialog was open,
and a moment later nothing explained it.

That is the shape 7.19 forbids, and the one thing the Memory tab still answered with a toast after
its export (7.109) and the Skills (7.101), Hooks (7.103) and plugin card (7.107) refusals moved into
the surface that asked. The reason is now drawn in that group, in the same slot the export refusal
uses — `role="alert"`, danger ink, at most two lines, the whole sentence on hover — and stays until
the next attempt. The group is the host because the file picker **is** this group's own control, so
the reason sits right under the strip that opened it, and stays readable when the group is folded.
Picking a real document clears the sentence and opens the dialog as before, so the retry is the same
control rather than a search for something else.

The sentence says the file was never read and no memory was changed, which is exactly true: the
parse runs in the page, so not a single request left it.

## Details

- `packages/web/src/features/agents/memory-group-refusal.ts` (was `memory-export-refusal.ts`): one
  module for both directions of a group's whole-group transfer, since both hang off the same head
  strip and draw in the same slot. `MemoryGroupRefusal` / `memoryGroupRefusalFor` decide which group
  claims the sentence (by **key**, not title: two Workspaces' folders can share a last segment), and
  `memoryImportRefused(scope, error)` words the new one — a document error keeps its own localized
  message ("this file carries no memories" stays that, rather than collapsing into "not an export"),
  anything else raised while reading the file falls back to "this file is not a memory export",
  because a File API failure's message is the browser's own and never localized.
- `packages/web/src/features/agents/memory-tab.tsx`: one `groupRefusal` state for the group's
  `notice` slot (a later attempt supersedes the earlier one, whichever direction it went) instead of
  the export-only one; `pickImport`'s failure writes into it instead of calling `toastError`, and
  clears it when a pick starts. The slot's test id is now `memory-refusal`.
- `packages/web/src/lib/strings{,-en}.ts`: one new `memory.importRefused(scope, reason)`.

## Tests

- `packages/web/test/memory-group-refusal.test.ts` (renamed from `memory-export-refusal.test.ts`,
  now 14 cases): the nine export cases unchanged, plus five for the import sentence — the document's
  own words are kept, a File API failure becomes "not a memory export" rather than the browser's
  English, the group is named, the sentence says the file was never read, and the English copy.
- `packages/web/e2e/memory-group-refusal.spec.mjs` (renamed from `memory-export-refusal.spec.mjs`,
  now 4 cases, real server + real browser): the two export cases unchanged, plus a picked `.txt`
  that leaves one sentence verbatim in that group with no dialog open, no notification, no request
  to any memory route, still there seven seconds later and still readable folded, and goes away —
  opening the dialog — as soon as a real document is picked; and one case that a group shows a
  single sentence, the later attempt's, after an export refusal followed by a bad pick.

## Compatibility

No interface change on the wire, no new dependency, no Project config change. The export sentence,
the group's other actions, and the import dialog's own refusal (a server-refused import, which is
drawn in the dialog or the confirmation that asked) are unchanged.
