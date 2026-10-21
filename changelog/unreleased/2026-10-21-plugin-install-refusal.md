# A refused module plugin install keeps its confirmation and the reason in it

- **Date:** 2026-10-21
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-21-plugin-install-refusal.zh.md)

Installing (or removing) a module plugin for a Project on the Plugins page asks first, and that card used to
close from a `finally`: success or refusal alike. A refused install therefore left the plugin exactly where it
was (the row still read "not installed") but took the reason with it, and that reason arrived as a toast that
dismissed itself after six seconds and floated over the page instead of in the card.

The card now closes only once the write landed. When the server refuses one, the card stays with its sentence
and the server's own words drawn under it, so the retry is the same button — a failed plugin install is the
most common refusal there is.

## Details

- The rule follows the model library, scheduled tasks and evaluation center rounds (`ConfirmModal`'s `refusal`
  slot): the reason is drawn inside the card that asked for the write, and opening the card clears the previous
  attempt's reason first — that sentence was about the previous attempt.
- `features/plugins/plugins-page.tsx`: `setPendingApply(null)` moved into the success path, the `catch` hands
  the server's words to a new `applyRefusal` state instead of a toast; the two ways of opening the card
  (install / remove) became `askApply`, which does open-first-then-clear.
- New browser spec `e2e/plugins-install-refusal.spec.mjs` (two tests): a refused install keeps the card, its
  sentence and the row, raises no toast and changes nothing; the retry writes it and only a written one closes
  the card.

## Compatibility

- No API, wire-format or dependency change: this is only when the card closes and where its refusal is drawn.
- The same page's "bulk update" and per-Agent "uninstall / update" cards still close on the request; the ledger
  records them under "what is left".
