# Links to the project itself now point at Adelie, not at upstream's site

- **Date:** 2026-10-17
- **Type:** process
- **Scope:** `docs`, `tooling`, `cli`

[中文版](2026-10-17-own-entry-links.zh.md)

Every place that sent a reader to `penguin.ooo` or to the upstream repository now sends them to
Adelie's own entry points, so following a link from a README, the docs, an installer header or an
npm package page lands on a page that describes the release actually installed.

## Details

The mapping applied across the repository:

| Was | Now |
| --- | --- |
| `https://penguin.ooo/install.sh`, `install.ps1` | `https://github.com/lmliheng/Adelie/releases/latest/download/install.sh`, `install.ps1` |
| `https://penguin.ooo/download` | `https://github.com/lmliheng/Adelie/releases/latest` |
| `https://penguin.ooo/docs/…` | `https://lmliheng.github.io/Adelie/docs/…` |
| `https://github.com/Prism-Shadow/penguin-harness` | `https://github.com/lmliheng/Adelie` |

- The installers' header comment, `docker/compose.yaml`, the `.github` files (CONTRIBUTING,
  SECURITY, the issue-template config, the bug report's security link, the pull request template's
  changelog link) and the READMEs of `amsp`, `cli`, `core`, `docs`, `server` and `web` carry the new
  targets.
- `quickstart-cli` installs from source with `git clone https://github.com/lmliheng/Adelie.git`
  and `cd Adelie`; its THIRD-PARTY-NOTICES link is now this repository's own file.
- `packages/docs/src/lib/links.ts` — the docs site's repository, API and license URLs — and
  `packages/ui-gallery`'s release link point at this repository, so the docs site's "Edit this page"
  and the gallery's link demo no longer leave the project.
- `packages/{amsp,cli,core,hmr,server}/package.json` name this repository under `repository`, which
  is what an npm package page shows as the source.
- The language pairing link in `CODE_OF_CONDUCT.md` is relative again, so the two versions link to
  each other inside the checkout instead of out to upstream.
- On the requirements-box page served at `:3003`, the release-pipeline diagram's npm-registry node
  lists `@adelie/*` instead of the retired `@lmliheng/penguin-*` names.
- The `penguin-sdk` reference vendored into the `agent-development` plugin carries the same new
  URLs, and that plugin's `plugin.json` moved to `2026.10.17.2` so an installed copy learns of it.

## What deliberately still points upstream

- `token.penguin.ooo` and `go.penguin.ooo/modelscope`: the ModelScope bridge and platform sign-in
  run on upstream's servers, so the URLs and their `penguin-harness` client id stay as they are.
- The attribution and warning sections of both READMEs, and `docs/FORK.md`'s "upstream" row: these
  name upstream on purpose.
- The Dockerfile's OCI source label: the image is published under upstream's Docker Hub namespace.
- Release asset names (`penguin-linux-x64.tar.gz` and friends), the `penguin` command and the
  `PENGUIN_*` environment variables.
