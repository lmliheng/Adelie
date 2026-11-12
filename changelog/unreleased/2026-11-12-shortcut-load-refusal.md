# A refused shortcut read keeps its reason on the page

- **Date:** 2026-11-12
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-12-shortcut-load-refusal.zh.md)

The keymap has to exist before any request answers — the shortcut dispatcher installs at module
evaluation — so the rows read the browser mirror until `GET /api/me/prefs` arrives, and the account's
copy replaces it then. A refused read left the mirror standing with nothing said about it: rows that
were the previous account's document, or just the defaults, looking exactly like the account's
shortcuts. Worse, one edit is one PUT of the whole document (the server replaces `keybindings` rather
than merging), so a rebind under a refused read could take away overrides the account still held.

The Shortcuts page now says so at its top, above the rows it explains: `没能从账号读取快捷键；下面这一份
来自这个浏览器（可能属于上一个账号，也可能只是默认值），改动会整份写回账号、盖掉账号上原来的按键。重新加载
这一页会再读一次：<reason>`. It goes away as soon as the question is settled — a hydrate, or a write
that lands (the account then holds what is on screen) — and is never toasted.

## Details

- `packages/web/src/lib/shortcuts/store.ts`: `noteHydrateFailure(error)` records the raw value (a
  sentence is built at render time, so a language switch re-words it) and
  `shortcutLoadFailure()` / `subscribeShortcutLoadFailure()` / `shortcutLoadFailureVersion()` read it.
  Cleared by `hydrateFromServer` (the account answered, even with "nothing stored"), by a write that
  lands, at an account boundary, and by the test configuration reset.
- `packages/web/src/lib/shortcuts/use-keymap.ts`: `useShortcutLoadFailure()`.
- `packages/web/src/features/settings/shortcut-runtime.tsx`: the prefs read's rejection is handed to
  the store instead of being swallowed by an empty `catch`.
- `packages/web/src/features/settings/shortcuts-section.tsx`: draws it first, above the refused-write
  line (`role="alert"`, `data-testid="shortcut-load-failure"`, attention tone — nothing failed, but
  the page cannot vouch for what it shows), two lines, the whole sentence on hover.
- `packages/web/src/lib/strings{,-en}.ts`: `loadRefused(reason)`, reason last, the app-wide shape.

## Tests

- `packages/web/test/shortcut-load-failure.test.ts`: the refused read is remembered once with its raw
  value, the mirror keeps the keyboard working, it is not confused with a refused write (and survives
  one), a hydrate with or without a stored copy drops it, a landed write drops it, a refused or
  in-flight write does not, another account does not inherit it, and both dictionaries carry where the
  rows came from, what an edit does to the account, the reload, and the reason.
- `packages/web/e2e/shortcut-load-refusal.spec.mjs`: a real server and a real browser — with the read
  stubbed to a 500 the page shows the sentence with the reason the interface translates (never the
  wire's English), one row reads the mirror's `未设置`, nothing is in the notification region, the
  account's copy is untouched, it is still there after seven seconds; after a reload with the read
  restored the sentence and the mirror's row are both gone.

## Compatibility

No wire change, no new dependency, no Project config change. A successful read and every other prefs
consumer behave as before.
