# A cleanup that moves what a person approved, and only that

- **Date:** 2026-10-10
- **Type:** feature
- **Scope:** `core`, `server`, `cli`, `web`, `docs`
- **Issue:** [#17](https://github.com/lmliheng/Adelie/issues/17)

[中文版](2026-10-10-storage-cleanup.zh.md)

The [storage ledger](2026-10-10-storage-ledger.md) could say what the data root held. This is the step that acts on it, in the order the design fixed: scan → a person reviews → a person approves. `scan` writes a **bill**; entries are ticked on that bill; `apply` moves exactly those entries into the data root's own trash, where they can be put back. Nothing runs on a timer, no threshold acts by itself, and nothing is ever unlinked except by a purge a person asked for.

## Details

- **Every write is gated by the cleanup mode, which is off until somebody turns it on.** `GET|PUT /api/admin/storage/settings` holds it (`{enabled, trashTtlDays, pins}`); `penguin storage mode on|off` and a switch on the Settings page's Storage tab are the two ways to move it. While it is off, scanning, pinning, applying, restoring and purging all answer `409 storage_mode_off` and the ledger stays readable, so an install that never turns it on behaves exactly as the previous release did. One write runs at a time; a second answers `409 storage_busy`.
- **A bill is a file, and it is what gets approved.** `POST /api/admin/storage/plans` writes `<root>/storage/plans/<planId>.json` and moves nothing; the id begins with the local time it was written. Each entry carries its class, bytes, file count, last change, the rules it matched, a size-and-mtime `fingerprint`, and whether this version may move it. The bill's own fingerprint covers all of them, and its life is 24 hours.
- **Only temporary Workspaces are executable in this release.** `executableClasses` is the bill's own answer, so the classes that may be cleaned later are already visible on it: Session drafts, Traces, tool environments and the database stay on the bill marked *report only*, and naming one is refused with `409 class_not_executable` rather than quietly skipped. Database maintenance is not in this release (see below).
- **`apply` needs the bill's id, its fingerprint, and the paths.** There is no "all" and no class to name, which is why neither the route nor `penguin storage apply` has a `--yes` and why a run that selects nothing is refused before it reaches the server. A path that is not on that bill (`400 unknown_path`), a pinned one (`409 pinned_path`), a bill already used (`409 plan_used`), one past its day (`409 plan_expired`) and one whose fingerprint does not match (`409 plan_stale`) each stop the run and say so.
- **The disk is re-checked, as a batch, an instant before anything moves.** Every selected entry is re-resolved inside the root and re-measured: a tree whose size or modification time moved is `409 plan_stale`, one a Session has started using again is `409 entry_still_live`, one that is no longer a real directory inside the root is `409 path_not_allowed`. The check is all-or-nothing, so a refusal names every path that caused it, and a person answers it by scanning again.
- **A move is a rename into `<root>/.trash/<timestamp>/items/<original path>`, never a delete.** The trash entry gets a `manifest.json` beside its items, and every move is written to `<root>/logs/storage-gc.jsonl` *before* it happens. `penguin storage trash` lists the batches, `trash restore <id>` renames the items back and skips whatever is in the way (`target_exists`, `not_in_trash`) instead of overwriting it, and `trash purge [<id>]` is the only deletion — one batch by id, or the batches past `trashTtlDays` (14 by default) when no id is given, and it can only reach inside `.trash`.
- **A pin keeps an entry out of the bill entirely.** `POST /api/admin/storage/plans/:planId/pin`, or the pin toggle on the Storage page. A pinned path stays off every later bill and `apply` refuses it even when it is named by hand; turning the mode on or off and every pin and unpin land in the same audit log.
- **The Settings page gains the review loop.** The Storage page keeps its report and adds the mode switch and trash retention, a Scan button, the bill's entries with the executable ones ticked and a checkbox that stays under the person's control, a per-entry pin, the move step, and the trash with its restore and purge, so the whole sequence can be walked without a terminal.
- **Docs.** `/docs/cli § penguin storage` and the [server API reference](/server-api) document the subcommands, every route, the error codes and the review loop; both language files were updated.

## What comes later

Reclaiming the space a purge frees at the filesystem level (the database's own `VACUUM`, and the classes that are report-only today) is a separate change: it is a maintenance window rather than a reviewed move, and it is not needed while the database is not what fills the root.
