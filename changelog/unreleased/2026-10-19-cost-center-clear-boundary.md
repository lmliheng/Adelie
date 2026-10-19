# Clearing error records takes exactly the number the confirmation names

- **Date:** 2026-10-19
- **Type:** fix
- **Scope:** `server`, `web`, `docs`
- **Breaking:** no — `until` is an optional new query parameter on `DELETE /usage/errors`

[中文版](2026-10-19-cost-center-clear-boundary.zh.md)

The cost center's error panel offers its owner a **清空** action, and the confirmation above it
says which records will go and how many: that sentence is the only warning before an
irreversible delete. The number in it was the dashboard's snapshot, taken when the page loaded
— and loading the cost center records one error of its own (a member's shell asks for the
machine list and the endpoint answers 403, an expected error). By the time anyone clicked, the
table held one more record than the sentence knew about, so a confirmation that said "1 条"
deleted 2.

Now the panel reads the count when the action is clicked, and the delete stops at the newest
record that read could see.

## Details

- Opening the confirmation issues one page read (`limit: 1`) over the filter already on
  screen; its `total` is the number in the sentence and its newest row's `ts` is the boundary.
- `DELETE /usage/errors` takes an optional `until` (an ISO-8601 instant) and removes only rows
  with `ts <= until`. The panel always sends it, so a record that lands between the count read
  and the delete is kept instead of being deleted unannounced — and the count stays true.
- Without `until` the route behaves exactly as before (everything the filter matches), so an
  older client keeps working. A malformed `until` is a 400, not a silently ignored bound.
- If the range turns out to be empty by the time the action is clicked (someone else cleared
  it), no confirmation opens; the panel simply refreshes.
- A refused delete still keeps the dialog, its sentence and the rows, and reports what the
  server said; only a successful one closes the dialog, toasts the server's own count and
  refreshes the table and the notice above it.
- `server-api` (both languages) documents the new parameter.

## Compatibility

- No wire changes for readers or for a clear without `until`. The dashboard, the paged read and
  the badge probe are untouched.
