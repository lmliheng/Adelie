# A refused trash write says so under the row that asked, past the toast it used to be

- **Date:** 2026-11-03
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-03-storage-trash-refusal.zh.md)

Settings → Storage ledger's trash offers three writes: restore an entry, delete one for good, and
delete everything past the retention. All three reported a failure in a six-second notification
only, while the entry stayed listed exactly as it was — same id, same size, same state. Six seconds
later the trash looked as if the button had never been pressed, on the one page whose "delete for
good" is the app's only deletion.

The reason now stays where the button is: under the two buttons of the row that asked, or under the
batch button that asked for the entries past retention. It is `role="alert"` (it is the only
account of what the row's unchanged state means), it names the action in the button's own words and
the entry where there is one, and it carries the server's reason as given. It stays until another
trash write is started; the same button is the retry.

## Details

- `packages/web/src/features/settings/storage-trash-refusal.ts` (new): `storageTrashKey(action,
  id)` — the key a write is known by while it is in flight, and the place its refusal is drawn —
  and `storageTrashRefused(key, reason)`, which turns that key plus a reason into the sentence. The
  batch's key is a word of its own (`purge:expired`), because an entry id is a compact timestamp
  and the batch names no entry at all.
- `packages/web/src/lib/strings{,-en}.ts`: three sentences — restore, delete for good, and delete
  what is past retention — next to the trash's existing ones. Each says which action it was.
- `packages/web/src/features/settings/storage-section.tsx`: one `trashRefusal` state, cleared when
  a trash write starts and set when one is refused; the line is drawn under the row's buttons or
  under the batch button. The failure notification stays, as it already does beside the apply
  refusal on this page — this change adds the account that outlives it, it does not take one away.

## Tests

- `packages/web/test/storage-trash-refusal.test.ts` (new, 8 cases): the two per-entry keys and the
  batch's; the key a refusal keeps; each of the three sentences; the reason travelling verbatim;
  the active language.
- `packages/web/e2e/storage-trash-refusal.spec.mjs` (new, one case on a real server): the trash
  listing and both writes are stubbed at `page.route` (the mode is turned on through the real
  setting). A refused restore puts one sentence under that row and nothing about the row changes;
  seven seconds later it is still there; pressing "delete for good" switches the line to that
  action's words; with the refusal lifted the same button goes through and the sentence goes.

## Compatibility

- No interface, request or storage change: the same `GET …/trash`, `POST …/trash/restore` and
  `POST …/trash/purge`. Only where a refused one is drawn has moved — from a notification alone to
  a line beside the button, which the notification no longer has to carry on its own.
