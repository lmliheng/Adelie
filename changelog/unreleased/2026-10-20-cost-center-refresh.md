# Cost center: opening the clear confirmation refreshes the stats behind it

- **Date:** 2026-10-20
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-20-cost-center-refresh.zh.md)

The "clear errors" confirmation names, in words, how many records it will delete — a count read
at the moment of the click. But the panel behind it (total / unexpected / expected) still showed
the dashboard's snapshot from page load, and loading the cost center records an error of its own
(a member's shell reads the machine list and gets a 403). So the sentence could say 4 while the
stats right behind it said 2: two numbers on one screen, describing the same action.

Opening the confirmation now re-reads the dashboard, so the panel and the sentence agree.

## Details

- The re-read runs in the background and never delays the dialog: the confirmation always opens
  on the count it just read, even when the second request is slow or fails.
- The number in the sentence — and the `until` boundary — stays the one that click read; a
  snapshot arriving later does not rewrite it.
- A failed re-read leaves the confirmation fully usable and the delete goes through; the next
  successful read catches the stats up.
- Cancelling sends no further request and leaves the caught-up panel in place.
- Side effect worth knowing: the re-read also puts the error table back on its first page (the
  new snapshot invalidates the offsets the reader was paging through).

## Compatibility

- No API, wire-format or dependency change; the page simply issues one more dashboard read.
