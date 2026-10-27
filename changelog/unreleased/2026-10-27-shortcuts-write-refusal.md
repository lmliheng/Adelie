# A refused shortcut save keeps the editor, and a refused delete keeps its card

- **Date:** 2026-10-27
- **Type:** fix
- **Scope:** `web`, `docs`
- **Breaking:** no

[中文](2026-10-27-shortcuts-write-refusal.zh.md)

The draft screen's **My shortcuts** folder puts two questions in front of a write — the shortcut
editor and the delete confirmation — and both answered the click instead of the write. Saving
closed the editor the moment **Save** was pressed, so a server that refused the write (an older
server, a read-only prefs row, a rejected value) rolled the folder back and took the name and the
prompt with it: a prompt the user had just typed, gone, with a toast saying why. Deleting closed
its card the same way, so the refusal arrived as a toast that dismissed itself while the row it
failed to remove was still in the folder.

Both now close only once the write lands. The editor keeps every field exactly as it was — the
name, the prompt, the caret — and draws the server's words above them; the delete card carries the
same words inside `ConfirmModal`'s `refusal` slot. In both, the button that asked is the button
that retries.

## Details

- `packages/web/src/features/chat/shortcuts-folder.tsx`: `persist()` (fire-and-forget, rollback +
  toast) became `write()`, which resolves to the reason or `null` and still rolls the list back on
  a refusal. `saveDraft` and the new `removeDeleting` await it, keep a `busy` flag while it is in
  flight, and only then decide whether to close. `draftRefusal` / `deleteRefusal` are cleared when
  a dialog opens and when it closes, so a reopened dialog never shows the previous attempt's
  reason. The editor's refusal is a `NoticeStrip` (`tone="danger"`, `role="alert"`) at the top of
  the body; the card's is the ui package's own `refusal` slot, with `S.common.refused` as the
  lead-in every other confirmation in the app uses.
- `packages/web/e2e/shortcuts-write-refusal.spec.mjs`: one browser test that refuses the prefs
  write with a 500 (`prefs_readonly`, a code nothing translates, so the sentence on screen can only
  be the probe's), checks that the editor stays open with the rename still in the field and the
  card stays open with the row still listed, then lets the same clicks through and checks both
  land — including the stored list afterwards.
- Docs: the shortcuts section of `packages/docs/content/chat.{zh,en}.md`.

## Compatibility

- No dependency, API, on-disk or protocol change: the same `PUT /api/me/prefs` call, made from the
  dialog instead of beside it. The server is untouched.
