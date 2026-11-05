# A refused handbook save says why above the draft, not in a six-second toast

- **Date:** 2026-11-05
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-05-handbook-save-refusal.zh.md)

The organization handbook's editor (`/org/<project>/<org>/handbook`) is a textarea with Save and
Cancel in the document's header. A save the server refused changed nothing on screen — the editor
stayed open with the draft in it and Save stayed where it was — and the reason arrived as one
notification that dismissed itself after six seconds. Afterwards the page looked exactly as it had
before the press: same text, same button, no word about why the file was untouched. Save is the
retry, and it was the only thing on screen that could say so.

The reason now stays above the draft (`role="alert"`, danger colour, two lines with the whole text
on hover) until the text is edited, Save is pressed again, the edit is cancelled or another
document is selected — so it always describes the last attempt. While the editor holds text the
file does not, the sentence says so too: nothing typed was lost, and nothing typed was written.

Whose words: `refusalText`, the rule every refusal slot in the app follows (7.19) — a request the
server answered is read through its code's own localized sentence, and a value this codebase raised
itself is shown as it wrote it.

## Details

- `packages/web/src/features/company/handbook-save-refusal.ts` (new): `handbookSaveRefusal(error,
  draft, stored)` — the line, and the decision whether it also says the edits stayed in the editor
  (the two texts differ) or is just the reason (Save pressed on a document nobody edited).
- `packages/web/src/features/company/handbook-page.tsx`: `saveRefusal` state, written in `save`'s
  catch (where `toastError` used to be), cleared by `startEdit`, `cancelEdit`, the draft's
  `onChange`, another document's load and the next Save; the line is drawn between the document's
  header and the textarea. The success toast is unchanged.
- `packages/web/src/lib/strings.ts`, `strings-en.ts`: `saveRefused` and `saveRefusedDraftKept`.

## Tests

- `packages/web/test/handbook-save-refusal.test.ts` (new, 5): a refused write reads its code's
  localized sentence rather than the server's English; a client-raised error keeps its own message;
  the line says the edits were not written only when the draft differs from the file; the interface
  language is respected.
- `packages/web/e2e/handbook-save-refusal.spec.mjs` (new, real server + real browser, 1 test over
  the whole flow): a refused save draws the sentence above the draft, the notification region never
  carries the server's words, the file still holds the old text and the editor still holds the
  draft; the line is still there after 7 seconds; editing clears it; the retry closes the editor and
  the file has the new text; cancelling after a refusal drops the draft and the line together.

## Compatibility

No interface change, no new dependency, no Project configuration change. The route, the payload and
the document's other writes (create, delete) are untouched.
