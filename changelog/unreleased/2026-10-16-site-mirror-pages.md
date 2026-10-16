# The official-site snapshot is served from this repository's Pages

- **Date:** 2026-10-16
- **Type:** chore
- **Scope:** `site`, `ci`

[中文版](2026-10-16-site-mirror-pages.zh.md)

`https://lmliheng.github.io/Adelie/` now serves the upstream site snapshot — home, download page,
blog, the docs site under `/docs/` and the component gallery under `/gallery/`. It replaces a stale
deployment of the Web app shell that nothing in the repository could reproduce: the workflow and
the site source had been removed in `1219f204`, so the page stayed up with no way to update it.

The snapshot was rebuilt from upstream source with `BASE_PATH=/Adelie/` rather than moved from the
copy that was hosted at the user-site root. A scraped snapshot carries root-absolute asset URLs and
a router basename of `/` baked into its bundles, so mounting it one level down broke both: assets
were requested from the origin root (404) and in-site links navigated out of the subpath. Building
with the base path is how upstream itself targets a project page, and its own build step fails on
any asset URL that escapes the site's base.
