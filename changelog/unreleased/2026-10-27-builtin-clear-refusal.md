# A refused clear of browsing data keeps its reason in the card

- **Date:** 2026-10-27
- **Type:** fix
- **Scope:** `web`, `docs`
- **Breaking:** no

[中文](2026-10-27-builtin-clear-refusal.zh.md)

The built-in browser's toolbar has a **Clear browsing data…** card: tick cookies, cache, site
storage and history, then press **Clear**. The card always stayed open on a failure — it closes
only once the clearing lands — but the reason never stayed with it: a toast dropped in, dismissed
itself seconds later, and the card went on saying only what it was asking, never why the last
attempt did nothing. That button is the one way back to the same selection, and nothing beside it
said what happened.

The refusal now renders inside the card, under the card's own sentence, next to the button that
retries it; the ticked kinds (and the unticked one) stay exactly as they were, so the retry asks
for the same thing.

## Details

- `packages/web/src/features/builtin-browser/clear-data-dialog.tsx`: a new `refusal` state feeds
  `ConfirmModal`'s `refusal` slot (the ui package's own slot, shared by every confirmation in the
  app); the `catch` no longer calls `toastError` and hands
  `S.builtinBrowser.clearFailed(apiErrorText(err))` to the card instead. Each press clears the
  previous reason first (an in-flight attempt owns the card), and opening the card clears it too,
  so a reopened card never shows the last attempt's words. The success path is unchanged: the same
  `toastSuccess`, and the card closes as before.
- `packages/web/e2e/builtin-browser-clear-refusal.spec.mjs` (new, one test): the browser only runs
  inside the desktop shell, so the spec stubs the one thing the app asks the shell for (a
  `webview` in the custom-element registry) and three browser routes inside the page; the server,
  the sign-in and the Project are real. A 500 (`clear_data_refused`, a code nothing translates, so
  the sentence on screen can only be the probe's) is refused once: the card stays, the reason is
  inside it, the unticked "history" is still unticked, the other three are still ticked — and the
  request body that went out carries no `history`. Allowed afterwards, the same button closes the
  card, and the retry asked for the same kinds the refused attempt did.
- Docs: the "Clear browsing data" section of `packages/docs/content/builtin-browser.{zh,en}.md`.

## Compatibility

- No dependency, API, on-disk or protocol change: the same `POST /api/builtin-browser/clear-data`
  (and `DELETE …/history`), with the server untouched; the copy reuses the existing `clearFailed`,
  so there is no new string.
