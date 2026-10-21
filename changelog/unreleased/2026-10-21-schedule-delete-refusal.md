# A refused schedule delete keeps its confirmation and the reason in it

- **Date:** 2026-10-21
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-21-schedule-delete-refusal.zh.md)

Deleting a scheduled task asks first, and the three surfaces that list tasks — the Project's schedule page,
the chat dock's scheduled-tasks panel, the Agent settings tab — used to close that card from a `finally`:
success or refusal alike. A refused delete therefore left the row where it was (nothing was deleted) but
took the reason with it, and that reason arrived as a toast that dismissed itself after six seconds and
floated over the card instead of in it.

The card now closes only once the delete landed. When the server refuses one, the card stays with its
sentence — the task's name, unchanged — and the server's own words drawn under it, so the retry is the same
button rather than a hunt through a list whose row is still there.

## Details

- The rule is the previous round's (`ConfirmModal`'s `refusal` slot, landed for the model library): the
  reason is drawn inside the card that asked for the write, and an attempt clears the previous one first —
  that sentence was about the previous attempt.
- All three surfaces follow it: `features/schedules/schedules-page.tsx`, `features/schedules/schedule-panel.tsx`
  and `features/agents/schedules-tab.tsx`. They list the same rows and share the confirmation, so a surface
  left out would read differently from its neighbours.
- The enable switch is untouched: it has no card, so its refusal stays a toast.
- New browser spec `e2e/schedule-delete-refusal.spec.mjs` (four tests, one per surface plus the retry): a
  refused delete keeps the card, its sentence and the row, and raises no toast; the retry writes it and only
  a written one closes the card.

## Compatibility

- No API, wire-format or dependency change: this is only when the card closes and where its refusal is drawn.
