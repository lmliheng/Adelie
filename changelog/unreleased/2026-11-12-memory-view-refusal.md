# A memory that did not open says so in its own row

- **Date:** 2026-11-12
- **Type:** fix
- **Scope:** `web`, `ui`
- **Breaking:** no

[中文版](2026-11-12-memory-view-refusal.zh.md)

The Agent settings page's Memory tab answers a refused read where it was asked. Pressing a memory's
eye button fetches one file and opens the view panel; when that read fails the panel simply never
appears, nothing is written, and the row keeps its eye button as the retry — but the only account of
why was a notification above the page that dismissed itself after six seconds. A reader who asked
for a memory and got no panel was left with the memory still listed and nothing saying whether the
attempt had touched it.

Now the reason is drawn inside that row, under the memory it is about and above the rule that closes
the row: `记忆「<title>」没有打开，打开只是读取，记忆一条都没有被改动：<reason>`. It stays until the next
attempt (whichever memory that attempt is for), and the row's eye button is the retry. Nothing is
toasted for it any more.

This closes the family the previous rounds worked through: a refusal with a surface of its own stays
there, and only writes that landed (and reads with no surface at all) still raise a notification.

## Details

- `packages/web/src/features/agents/memory-file-refusal.ts` (new): `memoryViewRefused(title, error)`
  builds the sentence through `refusalText` — the same rule as every other refusal — and
  `memoryFileRefusalFor(refusal, scopeKey, fileName)` says which row draws it. It claims by the
  scope's key and the memory's file name, never their titles: a memory's title is a label it may
  share with a memory in another group.
- `packages/web/src/features/agents/memory-tab.tsx`: `openView` fills that slot instead of calling
  `toastError` (the tab no longer imports it), and `fileRow` hands the sentence to the row's new
  `notice` line.
- `packages/ui/src/components/data/list-row/list-row.tsx`: `ListRow` takes an optional `notice`, a
  full-width line drawn inside the row above its rule — so the reason belongs to the row that holds
  the action to retry, and the column beside it keeps its width.
- `packages/web/src/lib/strings{,-en}.ts`: one sentence per language.

## Tests

- `packages/web/test/memory-file-refusal.test.ts`: the sentence follows `refusalText` rather than the
  wire message, keeps a failure that never reached the route, falls back when there is nothing to
  say, names the memory, says the read changed nothing, and speaks the active language; the row
  lookup hands the sentence to one row only.
- `packages/ui/test/list-row.test.ts`: the notice is a child of the row tag (inside its rule), after
  the actions, and absent when nothing was refused.
- `packages/web/e2e/memory-view-refusal.spec.mjs`: against a real server and a real browser — a
  refused read leaves the sentence in that row, no notification, no panel, and both sides unchanged
  seven seconds later; the same button then opens the panel. A second case shows a later attempt on
  another memory clearing the reason.

## Compatibility

No interface change on the wire, no new dependency, no Project config change. The sentences of every
other refusal, the success notifications, the delete / import / export surfaces and the tab's
initial-load error are unchanged.
