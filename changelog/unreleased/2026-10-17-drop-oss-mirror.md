# The Alibaba Cloud mirror is gone: one release address, always current

- **Date:** 2026-10-17
- **Type:** process
- **Scope:** `desktop`, `ci`, `docs`

[中文版](2026-10-17-drop-oss-mirror.zh.md)

Every release is published to `lmliheng/Adelie`'s GitHub Releases and nowhere else. The desktop app
checks for updates there directly, and the release pipeline no longer has a step that copies
anything to Alibaba Cloud OSS.

## Why

That mirror was Adelie's own bucket, and its account was disabled upstream of this repository
(`UserDisable` on every request since v0.3.5). A mount pointed at a bucket nobody can write is worse
than no mount: the release chain had a step that could only fail, and the desktop app's default
update feed answered 403 before every check fell back to GitHub. The user retired it outright
(2026-10-17), so the code follows the decision.

## What changed

- `packages/desktop/src/update-support.ts`: `MIRROR_FEED_URL` and `fallsBackToGithub` are gone. A
  check starts from GitHub Releases, or from `PENGUIN_UPDATE_FEED_URL` when one is set — a
  deployment running a mirror of its own still points that at itself. What changed for a user of the
  packaged app is one round-trip that no longer happens first.
- `packages/desktop/src/updater.ts`: the fallback path in `handleCheckError` is gone with it, and so
  is the feed kind it keyed on; a failed check is reported where it was asked for.
- `.github/workflows/release.yml`: the `mirror-oss` job is removed, along with the OSS sentences in
  its header.
- Removed: `.github/workflows/oss-staging.yml`, `scripts/publish-release-to-oss.sh`,
  `scripts/install-ossutil.sh`, `scripts/test-oss-staging.sh`.
- `README.md` / `README.zh.md` no longer promise a China mirror.

The installers were already GitHub-only (`PENGUIN_DOWNLOAD_SOURCE=auto|github`, with `oss` rejected
outright), so nothing about downloading or installing changes.
