# A refused settings action keeps its confirmation and the reason in it

- **Date:** 2026-10-22
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-22-plugin-action-refusal.zh.md)

A settings card's action (what the deployment must do once on the machine — the Windows sandbox's
"initialize", say) asks before it runs, and that card used to close the moment Run was pressed. When the
machine refused the request, or when the group answered that it did not run the action at all ("another task
is still running on this card"), the machine was exactly as it was, yet the reason arrived as a toast: six
seconds, floating above the card, and the only thing to do next was find the action's button again.

The card now closes on the answer, not on the request: a refused request, or a group answering `ok: false`,
leaves it open with those words under its sentence, so the retry is the same button. Only a run the group
reports as started closes it. While the action is running both buttons are disabled, since the card outlives
the click now.

## Details

- The rule follows the model library, scheduled tasks, evaluation center, plugin market and conversation
  rounds (`ConfirmModal`'s `refusal` slot): the reason is drawn inside the card that asked.
- `features/settings/plugins-section.tsx`: `runAction` closes the confirmation only when the result reports
  `ok`; otherwise the server's words (or the group's own message) go to a new `actionRefusal` state the
  confirmation draws. Opening the card from an action button clears the previous reason first.
- New browser spec `e2e/plugin-action-refusal.spec.mjs` (two tests): a refused action keeps the card, its
  sentence and its one write, raises no toast, and reopening it does not carry the old reason over; an
  `ok: false` answer keeps the card too, and a run that answers `ok` closes it.

## Compatibility

- No API, wire-format or dependency change: this is only when the card closes and where the reason is drawn.
- A group's notices and the card's live half are re-read as before; nothing else about actions changed.
