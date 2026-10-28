# "Check for updates" reads the feed again instead of re-showing the last answer

- **Date:** 2026-10-28
- **Type:** fix
- **Scope:** `desktop`
- **Breaking:** no

[中文](2026-10-28-check-updates-reads-feed.zh.md)

Check for updates in the desktop app could answer with a version that was already old. Once a check
found a release, the shell kept that offer as settled: pressing check again — from the app menu or from
the update modal — re-displayed the same version without asking the feed, and the six-hourly automatic
check skipped the feed for the same reason. Publish a new release an hour later and the offer stayed on
the previous one for the rest of the session, so the app reported a version the cloud had already
replaced.

Now any check that can run reads the feed: the app menu's item, the modal's row, and the periodic
check. A newer release replaces the standing offer (nothing is downloaded, and an offer is not a
promise); an up-to-date answer retires it. The one thing that still settles without a lookup is a check
asked for while a download is running, a build is waiting to install, or another check is already out —
there, the row simply gets the current state back, and the menu item says so in a dialog.

## Details

- `packages/desktop/src/updater.ts`: `check()` no longer declines when the status is `available` — it
  only declines on a download in flight or a downloaded build on disk (a re-check there could
  invalidate the package the install action points at). `handleUpdaterCommand("check")` and
  `checkForUpdatesManually()` gate on `manualCheckAsksFeed(status)` and then run that same check, so a
  standing offer is re-read rather than re-presented.
- `packages/desktop/src/updater-status.ts`: `manualCheckAsksFeed` — the one place that decides whether a
  user-asked check can run at all (not `downloading`, not `downloaded`, not `checking`). The fold is
  unchanged: while an offer stands, a check's `checking` frame and a same-version re-announce still do
  not replace it, so the offer does not blink out while it is being refreshed.
- `packages/desktop/test/updater-status.test.ts`: `manualCheckAsksFeed` pinned for every state —
  including `available`, the case this fix is about.

## Compatibility

- No wire or storage change: `DesktopUpdateStatus` and the updater command frames keep their shape.
- A periodic check now contacts the feed even while an offer stands, so a long-running session picks up
  releases published after the offer appeared.
