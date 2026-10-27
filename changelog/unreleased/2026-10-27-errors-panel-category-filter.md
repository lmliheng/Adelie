# The cost center's error table can narrow to one category, and Clear follows it

- **Date:** 2026-10-27
- **Type:** feat
- **Scope:** `web`, `server`, `docs`
- **Breaking:** no

[中文](2026-10-27-errors-panel-category-filter.zh.md)

The **Errors** panel at the bottom of the cost center now carries a category filter above the table
on the right: **All**, **Unexpected**, **Expected**. Choosing one narrows the table, its paging and
**Clear** to that category, while the summary figures above keep counting both — they are the
range's summary. Until now, looking at unexpected errors alone meant picking them out of a dozen
rows by hand.

The clear follows the filter: the confirmation names the category and says the other one is kept
("Deletes this Project's 1 unexpected error record in the last 7 days. The other category and
records outside that range are kept."), and the button really does take only that one — a **Clear**
that also swept up a category the reader could not see is exactly what a confirmation exists to
prevent.

## Details

- `packages/web/src/features/usage/errors-panel.tsx`: the panel keeps its own `kindFilter` state and
  merges it with the page's date/agent filter into `activeFilters`, which the reads, the row count,
  the pager and the clear all go by. The dashboard snapshot has no category-narrowed page 0, so once
  a category is chosen even page 0 is read from the server; switching category goes back to page 1
  (page 2's offset counts the previous category's rows). The empty state has two sentences now: "no
  errors" for All, "no errors of this type" for one category.
- `packages/server/src/http/routes/usage.ts`: `DELETE /usage/errors` takes `kind`, validated against
  the same `ERROR_KINDS` set the reads use (an unrecognized value is a 400 — a category that matches
  no rows would report "cleared" while the rows are still there).
- `packages/server/src/services/usage-service.ts`: `UsageErrorsClearQuery` gains `kind` and passes it
  into `ErrorsRepo.deleteFiltered`'s own `conds`, so the delete and the reads share one WHERE.
- `packages/web/src/api/endpoints.ts`, `packages/web/src/lib/strings.ts` / `strings-en.ts`: the
  `kind` parameter and four confirmation sentences (by category, and by category plus agent), plus
  two new copy keys.
- `packages/ui-gallery/src/app/mock/routes.ts`: the demo clear narrows by `kind` like the real route.
  The sample data holds 2 expected and 1 unexpected record, enough to show the difference.
- Docs: the error panel and the clear steps in `packages/docs/content/usage.zh.md` / `usage.en.md`.

## Compatibility

- No dependency, on-disk format or package-name change. `kind` is optional: a request without it
  behaves exactly as before, so an older client is unaffected.
