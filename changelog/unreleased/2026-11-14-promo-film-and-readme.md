# A promo film on the front page, and a README that leads with Chinese

- **Date:** 2026-11-14
- **Type:** process
- **Scope:** `docs`

[中文版](2026-11-14-promo-film-and-readme.zh.md)

The repository now carries a 57-second promo film of the desktop app — `assets/promo/adelie-promo.mp4`,
1920×1080, H.264, silent — beside its poster frame, and both root READMEs open on it: the poster links
to the film, with one subtitle line saying how long it runs. Chinese became the root `README.md` and
English moved to `README.en.md`, so the page GitHub shows by default is the Chinese one; the language
switcher in both files points at the new pair.

## Install, down to one way in

The install section keeps the desktop app from GitHub Releases, its platform table, the SmartScreen
note and the first-login step. Removed: the command-line and Web App section (the `install.sh`
one-liner, `npm install -g @adelie/cli`, `penguin web` / `penguin chat`, the data-root paragraph and
the `penguin update` commands), the warning listing upstream install channels, and the paragraph on the
`penguin` command name. The System requirements table no longer asks for Node — the installers bundle
it.

## Contributor wall removed

The "Upstream contributors" section and its contrib.rocks image were removed from both READMEs.

## Guards and references follow the rename

`packages/core/test/plugins.test.ts`'s README-table guard points its English, optional entry at
`README.en.md` and its Chinese, mandatory entry at `README.md`; `docs/README.md` and the two
`penguin-harness-dev` references name the new pair.
