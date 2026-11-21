# A draft over the write limit now says why it was not saved under the editor's header, not in a six-second toast

- **Date:** 2026-11-21
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-21-editor-save-too-large.zh.md)

Pressing Save in the Files panel's editor when the draft is over the write limit (14MB) wrote
nothing — the panel measured the text itself — yet the only explanation was a notification over the
panel that dismissed itself after six seconds. Afterwards the panel looked exactly as it had before
the press: the file on disk still held the old text, the editor still held the draft, the header
still carried Save, and nothing said why the two never met (7.19's rule: the sentence belongs where
the attempt was made, and Save is the retry).

The reason is now drawn under the same header, in the slot a refused write already uses
(`role="alert"`, danger colour, two lines, the whole sentence on hover), and it stays until the draft
is edited, Save is pressed again, or the edit is left — never until a timer runs out.

## Details

- `packages/web/src/features/chat/editor-save-refusal.ts`: new `editorSaveTooLargeRefusal(mb)` — the
  panel's own refusal, composed from `saveRefusedDraftKept` and the size reason, so it reads like the
  neighbouring refused-write lines ("保存失败：…（编辑器里的改动没有写进文件）").
  `editorSaveRefusal` (the server's answer) is unchanged.
- `packages/web/src/lib/strings.ts` / `strings-en.ts`: `files.saveTooLarge` became the reason rather
  than a whole sentence — it is now only ever read through the refusal line above.
- `packages/web/src/features/chat/workspace-browser.tsx`: the over-limit branch of `save()` records
  that sentence in `saveRefusal` (keyed by the file's path, cleared when the draft changes) instead
  of calling `toastError`. Nothing else about the branch changed: no request is sent, and the
  editor, the draft and the header's Save all stay exactly as they were.

## Tests

- `packages/web/test/editor-save-refusal.test.ts` (+2 cases): the line names the limit and says the
  edits are still only in the editor; switching to English moves both halves.
- `packages/web/e2e/editor-save-too-large.spec.mjs` (new, 2 cases, real server + real browser):
  ① a 15MB draft in the editor → Save behind its confirmation → the sentence appears under the header,
  one `role=alert`, absent from the notifications region, **not one write left the browser** (the write
  route is watched, not stubbed); the file on disk still holds the old text, the editor still holds the
  draft, Save is still there; **still there after seven seconds**; typing a shorter text clears it and
  the next Save lands; ② leaving the editor (× and discarding) takes the sentence with it.

## Compatibility

Renderer only: no API, wire format or stored data changed, and the server is untouched. The write
limit itself (14MB) is unchanged.
