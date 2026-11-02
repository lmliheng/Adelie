# A server-wide switch whose settings fail to load says why under the switch

- **Date:** 2026-11-02
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-02-server-switch-read-refusal.zh.md)

Two settings pages are one server-wide switch each — Settings → Server → Agent API and Settings → Server
→ company mode. Both keep their switch disabled until a stored value arrives, so a read that fails
leaves a dead knob under a value nobody read; the page said so in a toast, which was gone six seconds
later while the knob stayed dead and the page offered no reason at all.

The reason is drawn under the switch now, on the line a refused write already uses: danger-toned,
`role="alert"`, clamped to two lines with the whole sentence on hover, and it stays until the page is
left and opened again — a remount re-reads, and that is the retry. Neither switch carries a button of
its own.

## Details

- `packages/web/src/features/settings/server-switch-read.ts` (new): `readServerSwitch(pick)` reads
  `GET /api/admin/settings` once and answers `{ status: "read", value }` or `{ status: "unread",
  reason }` — the failure never throws, because these sections have nothing to retry on their own.
  `serverSwitchRefusal(read)` turns the latter into the localized sentence (shared `refusalText()`
  behind the shared "refused" lead-in) or `null`. What a failed read becomes is one function with a
  test, used by both pages.
- `packages/web/src/features/settings/agent-api-section.tsx` and `company-section.tsx`: a `loadRefusal`
  state beside the write-failure one, drawn under the switch; neither read path uses `toastError` any
  more. The write paths are untouched.

## Tests

- `packages/web/test/server-switch-read.test.ts` (new, 6 cases): the pick decides which switch comes
  back; a refused read answers with the app's own sentence for the code (not the English original),
  behind the lead-in; the sentence follows the active language; a read that never reached the server
  names the client's network failure; a sentence handed in as-is is kept; a landed read draws nothing.
- `packages/web/e2e/server-switch-read-refusal.spec.mjs` (new, two cases on a real server): with the
  read refused — one sentence in the section, the switch disabled, no toast at all, still there after
  seven seconds; leaving the page and coming back (a remount is the retry) clears it, opens the switch
  and shows what the server holds.

## Compatibility

- No interface, request or storage change: the same `GET /api/admin/settings`. Only where the sentence
  is drawn on failure has moved.
