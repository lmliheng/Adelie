# A refused write keeps its reason in the confirmation that asked for it

- **Date:** 2026-10-21
- **Type:** fix
- **Scope:** `web`, `ui`
- **Breaking:** no

[中文版](2026-10-21-models-refusal-in-card.zh.md)

Every confirmation in the model library that writes the Project's config — save a model's config, make it
the default, make it the vision proxy, delete the model, delete the group, sync the presets — now draws the
server's reason for a refused write inside the card, under its sentence, right above the button that retries
it.

That sentence used to appear in a toast only: the same words, but gone after six seconds and floating over
the card rather than in it. So the one moment it was needed — after reading it, deciding whether to retry —
it had usually already left. This is the last loose end of the previous round's rule that a confirmation
closes on its write's outcome rather than on the click.

## Details

- `ConfirmModal` gained a `refusal` slot: when it has words, a danger-toned strip is drawn under the
  sentence; when it does not, the slot is not drawn at all. Every confirmation in the app is this one card,
  so another page adopts it by passing a string.
- The model library's writes (`persist`) no longer raise the toast themselves: they hand the server's own
  words back to the card that asked for the write (`WriteOutcome` / `refusalOf` in
  `features/models/write-outcome.ts`). The strip leads with the app's own "操作被拒绝：" ("Refused:") and
  then carries that sentence verbatim.
- Two writes keep the toast because they have no card to keep it in: a group's API key (its dialog closes on
  submit) and the toolbar's "sync presets" (which never had a confirmation). The six that do have a card
  show the reason in it.
- One attempt, one strip: opening a confirmation again, or pressing its confirm again, drops the previous
  reason first — that sentence was about the previous write.

## Compatibility

- No API, wire-format or dependency change: this is only where the refusal's words are drawn.
