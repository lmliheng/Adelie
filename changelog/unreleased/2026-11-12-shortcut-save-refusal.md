# A refused shortcut save keeps its reason on the page

- **Date:** 2026-11-12
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-12-shortcut-save-refusal.zh.md)

Shortcut edits apply at once: the browser mirror is written first, so the chord in the input box and
every tooltip follow the edit before any request leaves. The account's copy is a second write, and a
refusal used to live only in a notification that dismissed itself after six seconds — while the row
kept showing the chord the account never heard, and the next load silently hydrated the account's
copy over the mirror, which was that change disappearing with nothing left to explain it.

The sentence now sits at the top of the Shortcuts page: `快捷键没能保存到账号；这一改动只在这个浏览器里
生效，重新加载后会退回账号上原来的快捷键：<reason>`. It stays until the next edit replaces it — any edit
is the retry, since one PUT carries the whole document — and nothing is toasted for it any more.

## Details

- `packages/web/src/lib/shortcuts/store.ts`: the persister's answer is watched. A write that throws,
  or a promise that rejects, is remembered (`shortcutSaveFailure()`), and cleared by the next attempt,
  by a hydrate (the screen is the account's copy again) and at an account boundary. Kept as the raw
  value, so a language switch re-words the sentence.
- `packages/web/src/lib/shortcuts/use-keymap.ts`: `useShortcutSaveFailure()` — the page that holds the
  edits reads it.
- `packages/web/src/features/settings/shortcut-runtime.tsx`: installs `PUT /api/me/prefs` itself and no
  longer toasts the refusal.
- `packages/web/src/features/settings/shortcuts-section.tsx`: draws it above the rows (`role="alert"`,
  `data-testid="shortcut-save-refusal"`, danger colour, two lines, the whole sentence on hover). Not on
  a row: a row cannot say it — it shows the new chord either way — and the write is the whole document,
  "Reset all" included.
- `packages/web/src/lib/strings{,-en}.ts`: `saveFailed` (the toast's line, now unused) becomes
  `saveRefused(reason)`; the reason ends the sentence, the app-wide shape.

## Tests

- `packages/web/test/shortcut-save-failure.test.ts`: a rejected write and a throwing writer are both
  remembered, subscribers hear about it once, a landed edit / a hydrate / Reset all / the next account
  clear it, a writer that answers with nothing invents nothing, and both dictionaries carry the cause
  and the "reverts on the next load" promise.
- `packages/web/e2e/shortcut-save-refusal.spec.mjs`: a real server and a real browser — a refused
  rebind leaves the sentence above the rows with the reason the interface translates (never the wire's
  English), nothing in the notification region, still there after seven seconds, the row showing the
  new chord, and the account's copy exactly as it was; the next edit lands, the sentence goes and the
  account follows.

## Compatibility

No wire change, no new dependency, no Project config change. Successful writes, every other
notification and the rows' hints are untouched.
