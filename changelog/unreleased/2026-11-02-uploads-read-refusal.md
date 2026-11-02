# Upload limits that fail to load say why above their two fields

- **Date:** 2026-11-02
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-02-uploads-read-refusal.zh.md)

The two numbers on Settings → Server → Upload limits (max attachment size, max total per message) are
filled from what the server stores. A read that fails leaves both fields disabled and empty; the page
said so in a toast, which was gone six seconds later while the fields stayed dead and the page offered
no reason at all.

That reason is drawn above the two fields now — read first, because neither field below it represents
the server in that state. It uses the line a refused write already uses: danger-toned, `role="alert"`,
clamped to two lines with the whole sentence on hover, and it stays until the page is left and opened
again — a remount re-reads, and that is the retry. The page has no retry button of its own.

## Details

- `packages/web/src/features/settings/settings-read.ts` (renamed from last round's
  `server-switch-read.ts`): a third page now asks the same question, so the module is no longer about
  one switch — `readServerSettings(pick)` reads `GET /api/admin/settings` once and hands back whatever
  the pick took out of it (one boolean, or the pair this page is about), and a failure still comes back
  as `{ status: "unread", reason }` rather than a throw. `settingsReadRefusal(read)` turns the latter
  into the localized sentence (shared `refusalText()` behind the shared "refused" lead-in), or `null`.
- `packages/web/src/features/settings/uploads-section.tsx`: the whole-`settings` state narrows to
  `stored` — the pair this page is actually about — so `adopt()` takes just those two numbers; the read
  path no longer uses `toastError` and instead keeps a `loadRefusal` drawn above the two fields. The
  write path is untouched.
- `agent-api-section.tsx` and `company-section.tsx` only follow the rename (same function, same
  meaning).

## Tests

- `packages/web/test/settings-read.test.ts` (renamed from `server-switch-read.test.ts`, 8 cases): on top
  of last round's 6, two new ones — a pick that takes a pair of numbers out of the settings, and the same
  refusal sentence when a pair was asked for. What the pick returns and what a failed read says are each
  pinned by a case.
- `packages/web/e2e/uploads-read-refusal.spec.mjs` (new, one case on a real server): with the read
  refused — one sentence in the section, both fields disabled, no toast at all, still there after seven
  seconds; leaving the page and coming back (a remount is the retry) clears it, enables both fields and
  shows the server's 100 and 120.

## Compatibility

- No interface, request or storage change: the same `GET /api/admin/settings`. Only where the sentence
  is drawn on failure has moved.
