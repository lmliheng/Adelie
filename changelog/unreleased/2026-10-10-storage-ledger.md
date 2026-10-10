# A storage ledger for the data root, and nothing that acts on it

- **Date:** 2026-10-10
- **Type:** feature
- **Scope:** `core`, `server`, `cli`, `web`, `docs`

[中文版](2026-10-10-storage-ledger.zh.md)

Adelie can now say what its data root is made of. `penguin storage`, and a Storage page in the Web App's Settings, report one row per class of data — user data, temporary Workspaces, Session drafts, Traces, tool environments, the trash, the database, everything else — and then the entries a person could clean up, each with the rule it matched and what clearing it would cost.

**Nothing in this release removes anything.** There is no timer, no threshold that acts on its own, and no route that could delete: the whole feature is one read-only walk and a report. It is the first step of the cleanup design recorded in the fork's issue #17, whose two fixed points are that the default is to keep every byte, and that any later removal must be reviewed by a person against a specific candidate list.

## Details

- **The vocabulary lives in core, as pure functions.** `state/storage.ts` walks a data root once and answers with a ledger: every byte lands in exactly one class, so the classes sum to the root's own size and an unclassified file cannot hide. `protected` is user data — Agent State, Project config, the Workspaces the user chose, vaults, plugins, benchmarks, snapshots — and is never a candidate; the derived classes are the ones that can be: temporary Workspaces (`empty`, `unreferenced`, `idle`), Session drafts (`orphan` when the Session no longer exists, `idle`, `budget`), Traces (`idle`, `budget`), tool environments (`idle`, guarded by a text search of `agent_state`), the trash, and the database.
- **Liveness is an input, never a discovery.** `scanStorage(root, live)` takes the Session ids, real Workspace paths and last-activity stamps from its caller, and `emptyLiveSet()` is named rather than defaulted, because a scan that assumes nothing is referenced would call every temporary Workspace free. Only the server can answer that question, which is why the command and the page ask it rather than each walking the disk themselves.
- **Every threshold defaults to off except the temporary-Workspace idle rule (30 days).** On the install this was written against — ten days old, 6.0G — an age-based rule reported zero bytes of anything older than thirty days, so age is a slow lever; the ledger's value is that it names the fast ones. The numbers are apparent sizes (`st_size`), so a tree of many small files weighs less here than `du` reports, and the volume's own `df` numbers ride along with the report rather than being inferred.
- **`GET /api/admin/storage` is admin-only, GET-only and takes no parameter.** `StorageService` assembles the live set from `SessionIndex.listByProject` over `Projects.listAll` and maps the ledger onto the API DTO; a Session in the middle of being deleted counts as live, because that window is not reachable from a node and counting it live can only make an entry look referenced, never claim that something a deletion is about to take away is free.
- **The CLI says what it is.** `penguin storage [--top <n>] [--json]` prints the classes, then the candidates with their rules, then environments that share a name or a shape — reported, never proposed for removal, since two look-alike environments may be at different versions — and closes by stating that nothing is removed without an approval and that nothing runs on a timer. `--top` folds the tail instead of hiding it.
- **The Settings page carries the same sentence.** A Storage page joins the admin group and renders the class table, the candidates with a per-class note on what clearing them costs (older messages' attached images stop previewing; history replay and the Costs page lose their rebuild source; an environment is reinstalled the next time it is used), the duplicate-looking environments, and the paths the scan could not read, so the report is never more complete than it is.
- **Docs.** `/docs/cli § penguin storage` and the server API reference describe the route and the read-only rule; both language files were updated.
