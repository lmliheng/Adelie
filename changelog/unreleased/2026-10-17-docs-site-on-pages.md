# The Pages site is the repository's own docs, not a snapshot of upstream's site

- **Date:** 2026-10-17
- **Type:** process
- **Scope:** `docs`, `ci`

[中文版](2026-10-17-docs-site-on-pages.zh.md)

`https://lmliheng.github.io/Adelie/docs/` now serves the documentation site this repository builds
from `packages/docs`. The upstream official-site snapshot that used to sit there is gone.

## What the site is now

The workflow builds `@adelie/docs` with `BASE_PATH=/Adelie/docs/` — the same base-path switch the
docs package has always had — and uploads an artifact whose root is a redirect to `./docs/`, with
the built site beside it. A deep link such as `/Adelie/docs/omni-message/` still loads directly:
the docs build writes one shell per route, so no 404 fallback is involved. A miss now gets a small
404 page pointing back at the docs.

## What was removed

`site/` — the built snapshot of the upstream PenguinHarness site (home, download page, 33 blog
posts, the docs site and the component gallery, 674 files) — is no longer in the repository, and
the Pages workflow no longer serves it. It existed only to be deployed, and its download page
handed out upstream's own installer: following it installed a different product than the one this
repository releases. Everything it contained was upstream's artifact rather than this repository's
source, so nothing here needs it to build.
