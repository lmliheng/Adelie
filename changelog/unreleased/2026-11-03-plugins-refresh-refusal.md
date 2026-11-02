# A read that fails right after an install says so on the page, past the toast it used to be

- **Date:** 2026-11-03
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-03-plugins-refresh-refusal.zh.md)

Settings → Plugins' Sandbox card asks whether to install this OS's backends when its switch is
turned on and the machine reports none — the install itself is the Plugins page's own, and once it
lands the cards' **live parts** (notices, actions, the backend report) are read again so what
installed shows. Each package reports itself in a notification, but that read failing used to add
one more six-second notification: the card still read "no backend for this OS", and six seconds
later nothing on screen explained why it never changed.

That failure now stays on the page, above the cards: `role="alert"` (it is the only account of the
state there, so it is read out), the words naming this server or the machine and the reason the
read failed, ending in what is on screen — **the state on the cards may still be from before the
install**. It stays until another machine is picked, the page is opened again (a fresh read), or
another read lands — the install already landed, so reopening the page is the retry.

## Details

- `packages/web/src/features/settings/plugin-config-read.ts`: a new `pluginConfigStale(machineName,
  reason)` beside the existing `pluginConfigUnreadable` — the latter says nothing could be read and
  the page is empty under it, the former says the cards are still there with what the machine said
  before the install. The two are not interchangeable.
- `packages/web/src/lib/strings{,-en}.ts`: `plugins.machineStale` / `plugins.thisServerStale`, next
  to the "could not read" pair; this server keeps its own phrasing (the picker's bare "This server"
  does not fit the machine phrasing).
- `packages/web/src/features/settings/plugins-section.tsx`: `loadError` became `readError` (two
  sources: the read on mount, and the read after an install), drawn in the same place;
  `installOffered`'s `catch` writes that sentence instead of `toastError`, and a landing read clears
  it. The per-package install notifications are unchanged.

## Tests

- `packages/web/test/plugin-config-read.test.ts` (+5 cases): the machine is named; this server
  keeps its own phrasing; the reason travels as given; not the same sentence as "nothing could be
  read"; the active language.
- `packages/web/e2e/plugins-backend-refresh-refusal.spec.mjs` (new, one case on a real server):
  both the configuration read and the install write are stubbed at `page.route` — turn the Sandbox
  switch on, confirm the install, watch it land (with its own notification) and watch the read
  right after it fail with a 500 `internal`: one sentence on the page, no notification carrying that
  reason, and still there seven seconds later; with the refusal lifted and the page reopened, the
  sentence is gone and the cards are read again.

## Compatibility

- No interface, request or storage change: the same `GET /api/admin/plugin-config`. Only where a
  read that fails after an install is drawn has moved — from a notification to above the cards.
