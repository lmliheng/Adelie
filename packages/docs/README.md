# @adelie/docs

The Adelie documentation site (React + Vite + Tailwind CSS 4). Its own package, keeping the visual language the landing page introduced: bilingual pages (zh/en), light/dark themes, a sidebar + per-page table of contents, and a "Copy Markdown" button on every page.

Live at <https://lmliheng.github.io/Adelie/docs/>.

## Content model

Pages are local Markdown files — `content/<slug>.<zh|en>.md`, one file per page per language (missing languages fall back to the other). Frontmatter:

```markdown
---
title: Page title
description: One-line summary rendered under the title
---
```

Navigation (sections, order, prev/next) is defined once in `src/lib/nav.ts`; a vitest check (`test/content.test.ts`) keeps nav and content in sync — every navigated slug must have both language files with a title, and no orphan files may exist. Internal links are written as absolute doc paths (`[Core Interfaces](/interfaces)`).

## Development

```bash
pnpm dev:docs                                      # http://127.0.0.1:7367 (repo root script)
pnpm --filter @adelie/docs build      # dist/ + per-route shells for deep links
pnpm --filter @adelie/docs typecheck
pnpm --filter @adelie/docs test
```

## Deployment

Deployed to GitHub Pages together with the landing page as one artifact: `scripts/build-site.mjs` (repo root) builds landing with `BASE_PATH=<base>` and docs with `BASE_PATH=<base>docs/`, then copies this package's `dist/` into the landing dist under `docs/`. `.github/workflows/pages.yml` runs it on pushes to main touching either package.

```bash
BASE_PATH=/ pnpm build:site                        # assemble locally
pnpm --filter @adelie/landing preview # serve the assembled site
```

Deep links work without a 404 fallback: the post-build step copies the SPA shell to `dist/<slug>/index.html` for every content slug.

Part of [Adelie](https://github.com/lmliheng/Adelie) · Apache-2.0
