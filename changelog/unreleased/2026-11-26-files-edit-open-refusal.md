# Files: an Edit that cannot open the editor keeps its reason above the preview

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-26-files-edit-open-refusal.zh.md)

Pressing Edit in the Files panel does not always open the editor. An isolated HTML preview carries
no text (its iframe serves the page), so the source is read on that click — and a file over the
preview ceiling cannot be taken in whole, while the read itself can fail outright (the Agent
rewrote or deleted the file a moment ago). Either way the panel looked exactly as it had a moment
before: no editor, the same preview, the same Edit button under the pointer. The only answer was a
notification that dismissed itself after six seconds, so a reader who looked back at the panel saw
a button that appeared never to have been pressed.

The reason now stays above the preview, next to the control that raised it, until the next attempt.
Over the ceiling the line says what to do instead (download the file — that is the retry); a failed
read says `Could not open the editor:` followed by the reason, the rule every refusal slot in the
app follows.

## Details

- `packages/web/src/features/chat/edit-open-refusal.ts` (new): `editOpenTooLargeRefusal` for the
  panel's own measurement, `editOpenFailedRefusal` for a read that threw — the latter goes through
  `refusalText`, so a server answer is shown through its code's localized sentence and a value the
  panel raised itself keeps its own words.
- `packages/web/src/features/chat/workspace-browser.tsx`: the two `toastError` calls in `startEdit`
  become one `editRefusal` state keyed by path (another file's preview can never show it), cleared
  when a new attempt starts and drawn above the preview only while no editor is open.
  `fetchTextPreview` now throws `HTTP <status>` rather than the bare number, because that message is
  what the panel puts in the sentence.
- `packages/web/src/lib/strings{,-en}.ts`: one new slot, `files.editOpenFailed(reason)`.
- `packages/web/test/edit-open-refusal.test.ts`: seven unit tests (both halves, both languages,
  server answer, self-raised value, nothing to say).
- `packages/web/e2e/files-edit-open-refusal.spec.mjs`: two cases — an oversize HTML file and a read
  answered with 500; each asserts the line is on the panel, the notification area is empty, the
  preview and Edit button are still there, and the line outlives a toast.

## Compatibility

No interface, data root or successful path changed; no new dependency. A successful Edit opens the
same editor it did before, and a save's refusals are untouched.
