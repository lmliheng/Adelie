# A refused platform sync keeps its reason under the group header

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-24-platform-sync-refusal.zh.md)

Pressing **Sync** on the model library's Penguin Go group and being refused used to leave only a
notification that dismissed itself after six seconds: the header, the model cards, the default and
vision pointers were exactly as before, and once the notification was gone the screen said nothing
about whether the press had done anything. The reason now stays under that group's own header — a
refusal wrote nothing, and the header's Sync button is the retry.

## Details

- `packages/web/src/features/models/platform-sync-refusal.ts` (new): `platformSyncFailure(error)`
  answers `{ kind: "authorize" }` or `{ kind: "refused", text }`. The first is
  `platform_reauthorization_required` — the stored key was revoked, the page opens the
  authorization flow, and that is the fix, so no sentence is left behind. Everything else goes
  through `refusalText` (7.19's rule) and keeps its words where the press was made.
- `packages/web/src/features/models/models-page.tsx`: `syncPlatformModels` takes the id of the
  group whose button was pressed, clears the previous sentence at every attempt, and records
  `{ providerId, text }` on a refusal. The sentence is the library's `NoticeStrip` (`role="alert"`,
  danger tone, the shared `S.common.refused(...)` lead-in) drawn between that group's header and
  its model cards, visible whether the group is folded or open (the action lives on the header).
  When a search filters the group out, the sentence goes with it — neither the place it was drawn
  nor the retry is on screen any more.
- New e2e `packages/web/e2e/models-platform-sync-refusal.spec.mjs` (2 tests): on a refusal the
  sentence is under the header, the notification area holds no entries, it is still there seven
  seconds later, and the button can be pressed again; with the stub lifted, the next press clears
  the sentence and reports "the presets are already up to date".

## Compatibility

Only where the failure is drawn changed. The interface, the data root, the model catalog and the
success path's notices are unchanged.
