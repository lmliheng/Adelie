# The document's language tag follows the interface language

- **Date:** 2026-11-16
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-16-html-lang-follows-ui.zh.md)

The document root's `lang` attribute now mirrors the interface language, so an English screen
reads as English. It used to say `zh-CN` no matter which of English, Chinese or "follow the
system" was on screen: it is a static literal in `index.html` and nothing in the app ever rewrote
it, so screen readers announce the wrong language and translation and word-breaking heuristics
treat every page as Chinese.

## Details

- The effective locale — `en` or `zh`, with "system" resolved through the device language first —
  is stamped on the root in the same render pass that switches the active dictionary, so the tag
  never disagrees with the text on screen: on a switch, after a reload, and on the device's
  language changing while in system mode alike.
- `zh` is announced as `zh-CN` (the Simplified-Chinese dictionary), `en` as plain `en`.
- The write goes through `applyDocumentLang(document, locale)`, a small exported function
  parameterized by its document — the shape `applyWorkflowTheme(doc, …)` already takes — so the
  node-environment unit suite covers the tag mapping and the write without a DOM.
- The static `zh-CN` in `index.html` stays as the pre-hydration default: it is what the first
  paint and a browser without scripts show, and the running app replaces it in its first render.
