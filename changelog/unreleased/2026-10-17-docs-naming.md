# The documentation says Adelie, and matches what the code actually reads

- **Date:** 2026-10-17
- **Type:** process
- **Scope:** `docs`

[中文版](2026-10-17-docs-naming.zh.md)

The documentation site described this product by upstream's name and pointed at paths and variables
that Adelie stopped using. Every page now names Adelie, and every path, data root and environment
variable it prints is one the code on this branch actually reads.

## Renamed

- The product name: `PenguinHarness` → `Adelie`, in 30 page pairs (English and Chinese) plus the
  docs site's own title, `og:` tags, description and sidebar name.
- Desktop paths: the macOS, Windows and Linux log and data directories now read `Adelie`, which is
  what `productName` in the desktop build produces, and the dev profile is `Adelie-Dev`.
- The data root and its variable: `~/.penguin/data` → `~/.adelie/data`,
  `%USERPROFILE%\.penguin\data` → `%USERPROFILE%\.adelie\data`, and `PENGUIN_HOME` → `ADELIE_HOME`
  (the old spelling is still read — the configuration page says so where it matters).
- The install directory in the quickstart tables: `~/.penguin` → `~/.adelie`, which is the default
  `install.sh` and `penguin update` use.
- Control-plane variables: `ADELIE_AGENT_ID`, `ADELIE_SESSION_ID`, `ADELIE_PROJECT_ID`,
  `ADELIE_API_URL`, `ADELIE_API_TOKEN`, `ADELIE_AGENT_KEY`, `ADELIE_ORG_ID`, `ADELIE_LANG`,
  `ADELIE_PASSWORD`, `ADELIE_SHELL`, `ADELIE_UPDATE_CHECK`, `ADELIE_TRUST_PROXY`,
  `ADELIE_PREVIEW_ORIGIN`, `ADELIE_SEED_ADMIN_PASSWORD`, `ADELIE_SERVE_CHILD`, `ADELIE_SUPERVISED`,
  and the deployment names `ADELIE_WEB_DIST`, `ADELIE_WEB_DB`, `ADELIE_CLI_ENTRY`,
  `ADELIE_PORT_FILE`, `ADELIE_DESKTOP_TOKEN`.
- The promotional name for the message format: `Penguin Message` → `Adelie Message`.

## What deliberately keeps the old spelling

The installer and release protocol (`PENGUIN_INSTALL_DIR`, `PENGUIN_VERSION`, `PENGUIN_ARCHIVE`,
`PENGUIN_DOWNLOAD_*`): a running CLI downloads `install.sh` from a release, so both ends move with
the release chain, not with a rename. The upstream gateway (`PENGUIN_GO_ORIGIN`,
`PENGUIN_GO_API_KEY`, `token.penguin.ooo`, `go.penguin.ooo/modelscope`): their service, and the
values have to match what the code sends. `PENGUIN_NO_LOGIN_SHELL_ENV`, which belongs to the
desktop shell. The dev data root `~/.penguin/dev-data`, which the dev scripts really do use.

## Corrected, not renamed

The quickstart and CLI pages described the installer's download sources as upstream's: an OSS
release directory, a speed probe, `PENGUIN_DOWNLOAD_SOURCE=auto|oss|github`. Adelie's installer
downloads from this repository's GitHub Releases, accepts `auto` and `github` (which mean the same
thing here) and rejects anything else, and takes a mirror through `PENGUIN_DOWNLOAD_BASE_URL` with
one optional fallback. The pages now say that.
