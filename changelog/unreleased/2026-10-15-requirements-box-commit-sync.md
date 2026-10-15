# The requirements box shows what is not released or not on the live server yet

- **Date:** 2026-10-15
- **Type:** feat
- **Scope:** `plugins`

[中文版](2026-10-15-requirements-box-commit-sync.zh.md)

The requirements box page carries a **commit sync** card. It answers, without leaving the page, the
question that used to need a terminal: what has been committed but not released, and whether the
server is running what has been released.

It keeps three things apart, because one sentence for all three is what nobody can read:

- **Unreleased** — the commits on the repo's `main` after the last release tag.
- **The live server has not caught up** — commits that are already shipped but that the running
  service has not picked up. Only commits that change what gets built are counted: a release-note or
  ledger commit touches nothing but markdown, so counting it would have the page crying "1 behind"
  after every release until nobody reads it any more.
- **Installed but not restarted** — the version on disk is newer than the version running, which is
  its own state and used to be invisible: the update is installed, the process still holds the old
  code, and the page said nothing about it.

Which version the live server runs is asked of the server itself (`/api/version`), never read off
disk — reading the disk is exactly what hides the installed-but-not-restarted case. That endpoint
wants the machine's own token; the file is read inside the box's process and never reaches the
browser. Every source comes from `box.config.json` (`repoDir`, `serverUrl`, `serverTokenFile`,
`installDir`), and `install.mjs` works them out — the repo defaults to the workspace the patrol edits,
and the server URL is read from the port in the data root's `server.lock`. What cannot be worked out
is reported as "not configured" rather than guessed; an unconfigured repo hides the card entirely,
while a configured one that cannot be read says why.

## API

`GET /api/requirements/sync` returns the whole picture (keyed like every other endpoint, cached for
30 seconds, `?fresh=1` to skip the cache).
