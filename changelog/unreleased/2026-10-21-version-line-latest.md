# The new-chat page's version line names the newest release

- **Date:** 2026-10-21
- **Type:** feature
- **Scope:** `web`, `docs`
- **Breaking:** no

[中文版](2026-10-21-version-line-latest.zh.md)

The version line under the brand on the new-chat page used to carry the running version alone
(`v0.5.1 · Last updated Oct 17`), with a superscript "New version available" beside it when a
release was offered — the version number itself hidden in that badge's tooltip. An install two
releases behind therefore could not see how far behind it was, on the one page a reader opens to
settle exactly that question. The line now names the newest release when the update check knows
one: `v0.5.1 · Last updated Oct 17 · Latest v0.5.2`. A build that is already the latest adds
nothing.

## Details

- The number comes from the update check the app already runs once per page load (the server caches
  its lookup for an hour and can be told not to dial out; with checks off there is no answer to
  show and the line stays as it was).
- The half is appended only when the newest release is newer than the running build: an up-to-date
  build already prints the latest version in the first half, so repeating it would say nothing.
- A failed lookup, a response that names no version, or disabled checks all leave the line exactly
  as it was.
- The superscript badge — the button into the update dialog — is unchanged: it reports where the
  update stands, and the version number is now the line's to state.
- The "Check the running version" section of the docs describes the new half, in both languages.

## Compatibility

- A Web App line only: no API, wire-format or dependency change.
