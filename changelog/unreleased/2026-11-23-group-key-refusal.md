# A group's key dialog keeps the key and the reason when the write is refused

- **Date:** 2026-11-23
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-23-group-key-refusal.zh.md)

Every group header on the model page carries an "Enter key" action that writes one key across all of
that group's models. It used to close on the click, before the write even started: a refusal left its
reason in a notification that dismissed itself after six seconds, the key that had just been typed
went away with the dialog, and the group header carried no sign anything had been attempted.

Now only a written key closes it. A refusal keeps the dialog standing with the key still in the
field, the server's own sentence (「操作被拒绝：…」) drawn above that field, and the confirm button as
the retry. While the write is in flight both footer buttons are disabled and the dialog cannot be
dismissed from outside.

## Details

- `packages/web/src/features/models/models-page.tsx`: `GroupKeyDialog` holds its own `busy` and
  `refusal`, and `onSubmit` answers with the refusal to keep (or `null` once the key landed); each
  attempt clears the previous sentence first, and the page closes the dialog only on success. The
  sentence goes through the library's `NoticeStrip` (`role="alert"`, danger ink, body in
  `data-slot="body"`), the same shape the ticket dialogs use.
- No new wording, no new dependency, no API changes: the write is still the whole-table PUT; only
  when the dialog closes moved.

## Tests

- `packages/web/e2e/models-group-key-refusal.spec.mjs` (new, 2 cases, real server + the repo's own
  mock model): ① the table PUT is answered with a 500 → the sentence is in the dialog, the dialog is
  still open, the field still holds the typed key, the notification area does not carry it, it is
  still there seven seconds later, and one PUT went out carrying that key; ② with the stub removed
  the same confirm button closes the dialog, the notification reports "已为 1 个模型配置 API key", and
  the server's row really holds the key.
- `@adelie/web`'s `tsc --noEmit`, its existing tests, `prettier --check` and `oxlint` all pass.

## Compatibility

No route, storage format or wire type changed: this is only about when the dialog closes and where
the reason is drawn.
