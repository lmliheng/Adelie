# Files the pick never handed over keep their names above the listing

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

The Files panel measures a pick before it reads anything: files over the upload ceiling are skipped,
and a dropped folder is not a file the write route takes. Neither branch reads a byte or sends a
request, so there is no server sentence to draw — the tree still holds the directory it held, the
reader is looking at the same panel as before the pick, and those files are still only on their own
disk. That used to be reported in a notification that dismissed itself after six seconds, which left
the pick looking like it never happened. The names are now drawn above the listing, in the same slot
a refused upload uses: that is where the retry is (pick them again), and where the explanation
belongs.

## Details

- `packages/web/src/features/chat/pick-skip-refusal.ts` (new): `pickSkipLine` turns one pick's
  skips — files over the ceiling (with the ceiling), folders the drop could not carry — into one
  sentence, both halves when a single pick hit both. `withPickSkips` appends that sentence after the
  server's own when the write was refused too, so a batch that landed halfway does not lose the names
  it had already skipped.
- `packages/web/src/features/chat/workspace-browser.tsx`: `stageUpload` takes the dropped folders,
  writes that sentence into the panel's existing refusal slot (`uploadRefusal`, above the listing),
  and carries it through the overwrite confirmation into the write that starts afterwards;
  `doUpload` still answers the previous refusal on a fresh pick, now handing back what this very
  pick skipped instead of clearing it.
- One new dictionary entry in each language, `files.pickSkipSeparator`: the break between those two
  sentences (and between a refusal and them) — one slot, one paragraph.
- `packages/web/e2e/files-pick-skip.spec.mjs` (new, 2 tests, real server + real browser, nothing
  stubbed): ① picking a 15MB file over the 14MB ceiling → the name is above the listing, the
  notification area does not carry it, the write route sees no request at all, the directory stays
  empty, and the sentence is still there nine seconds later; ② a batch with one oversize and one
  legal file → the legal one really lands (the notification says so), the oversize name stays above
  the listing and is still there nine seconds later; the next normal pick clears it.

## Compatibility

Only where these two kinds of skip are drawn changed. The interface, the data root, the ceiling
itself (14MB) and the success path are unchanged.
