# A refused proxy save, and settings that fail to load, say why in the section now

- **Date:** 2026-11-02
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-02-proxy-settings-refusal.zh.md)

Settings → Server → proxy options had two failures that handed their reason to a toast that dismisses
itself after six seconds:

- **A save refused for anything but the address** (a lost session, a dead server, a 500). Nothing was
  written — both switches and the address come back exactly as they were, and Save again is the retry —
  but all a toast left on screen was a form that looked untouched. The address's own rejection
  (`invalid_proxy_url`) already draws under the input, and stays there; this change does not touch it.
- **Settings that fail to load.** Every control stays disabled and shows the form's own defaults rather
  than the server's, and the page said nothing about it that outlived six seconds — what remained was a
  pane of greyed controls with no explanation.

Both sentences are drawn in the section now: the refused save's under the address and above the Save
row (which is its retry), the failed read's above the controls (read first, because the switches and
the address below it do not represent the server while it stands). Both are danger-toned,
`role="alert"`, clamped to two lines with the whole sentence on hover, and both stay — the save's until
the next save replaces it, the read's until the section is left and opened again (a remount re-fetches,
and that is the retry). Neither carries a button of its own.

## Details

- `packages/web/src/features/settings/proxy-save-refusal.ts` (new): `proxySaveRefusal(error)` returns
  `{ field: "address" | "section", text }` — which refusal goes in which slot is one function with a
  test rather than an `if` inside a render. `invalid_proxy_url` takes `address` (the server names the
  one field it validates); everything else takes `section`. The sentence comes from the shared
  `refusalText()`, so a server's answer is still localized.
- `packages/web/src/features/settings/proxy-section.tsx`: two states beside the existing `addressError`
  (which draws under the input) — `saveRefusal` (cleared when the next save starts) and `loadRefusal`
  (cleared only by a remount). Neither failure path uses `toastError` any more. The reachability test
  (7.66) is untouched.

## Tests

- `packages/web/test/proxy-save-refusal.test.ts` (new, 5 cases): `invalid_proxy_url` lands in the
  address slot with the localized sentence (not the English original); any other server code lands in
  the section slot; a sentence the client raised itself is used as it is; a value with nothing to say
  falls back to the generic text; the sentence follows the active language.
- `packages/web/e2e/proxy-settings-refusal.spec.mjs` (new, two cases on a real server): a refused save —
  one sentence in the section, no clickable toast, still there after seven seconds, the server still
  without that address, the input still holding what was typed; once the write is let through, the
  sentence goes and the address really lands. A failed read — the sentence above the controls, both
  switches, the address, Save and the probe all disabled, still there after seven seconds; leaving the
  section and opening it again (a remount is the retry) clears it and opens the controls.

## Compatibility

- No interface, request or storage change: a save is the same `PUT /api/admin/settings`, a read the same
  `GET /api/admin/settings`. Only where the sentence is drawn on failure has moved.
