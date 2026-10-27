# The cost center's error table can copy a whole record

- **Date:** 2026-10-27
- **Type:** feat
- **Scope:** `web`, `docs`
- **Breaking:** no

[中文](2026-10-27-errors-panel-copy.zh.md)

Every row of the **Errors** panel at the bottom of the cost center now ends with a copy button. It
puts the whole record on the clipboard as one paste-able block: the latest time, the
**Source · code**, the type, and — for a row that folds several of a day's records — how many and
when the first one was; then the message in full, line breaks and all.

What a copy here is for is getting an error *out* of the panel: into a chat, an issue, or to
another agent. So the block has to stand on its own. The reader on the other end sees none of the
panel's filters, gets no tooltip, cannot hover a `×4` — and the part of a provider error that
explains it (a 402's body, a stack's first frames) is usually below the first line, which the row
truncates. Hand-copying it by dragging across a truncated cell was the only way before this.

## Details

- `packages/web/src/features/usage/errors-panel.tsx`: `errorCopyText(item)` builds the block and is
  exported for the same reason `errorsClearScopeText` is — this package's vitest runs in `node`, so
  the text is observable where a click and a clipboard are not. The row draws
  `CopyButton` (the ui package's existing action, `size="sm"`) with the message cell's own
  affordances in mind: it is on every row rather than revealed on hover, because a phone has no
  hover (Tailwind v4 scopes `hover:` to `@media (hover: hover)`) and a hover-only action would
  simply not exist there. The header cell above it stays empty: the glyph names itself through
  `aria-label`, and repeating that name per row's column would read it out twice.
- The table's `min-w` went 720 → 752, the copy column's own width, so the new column costs the
  message column nothing at the narrowest viewport (the box scrolls sideways there).
- `packages/web/src/lib/strings.ts` / `strings-en.ts`: one key, `errorsCopy`.
- Docs: the errors panel in `packages/docs/content/usage.zh.md` / `usage.en.md`.

## Compatibility

- No dependency, on-disk format or API change: the block is built entirely on the client from a row
  the panel already has. The server is untouched.
