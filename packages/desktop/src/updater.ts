/**
 * Auto-update.
 *
 * electron-updater against the GitHub Releases feed the build publishes
 * (`latest*.yml` + `.blockmap` ship as Release assets). Updates surface in two places:
 * the native app-menu item with its dialogs, and the account menu of the shell's own
 * window — fed over the utilityProcess port to the embedded server (main.ts pushes each
 * status fold, GET /api/desktop/update serves it). The window itself stays a plain
 * browser: the relay adds server HTTP surface, never a renderer IPC bridge.
 *
 * A check only looks: it ends in `available`, and nothing is fetched until the user says
 * so — from the Web App's update modal (the relayed `download` command) or from the native
 * dialog a menu-driven check ends in. Automatic checks are quiet: they run on a timer and
 * surface an offer only as the page's badge. A manual check reports every outcome (already
 * up to date / a release offered / failed), the same rule the Web App's update entry
 * follows — a manual action that answers with silence reads as broken. A web-initiated
 * check or download is manual too, but its outcomes render in the modal that asked, not
 * in dialogs: the native restart prompt follows only a download the native dialog started.
 *
 * Adelie fork note (2026-10-06): the assets are published to this fork's own GitHub Releases
 * (`lmliheng/Adelie`) and mirrored to Alibaba Cloud OSS, and the mirror is the feed a check
 * starts from — github.com is slow to unusable for the users this fork is built for. GitHub
 * Releases stays the source of truth: a check the mirror does not answer is retried there, so a
 * mirror that is stale, broken or simply gone costs one round-trip rather than the update.
 * `PENGUIN_UPDATE_FEED_URL` still outranks both — an end-to-end update test points it at the
 * local server it just stood up — and is answered as-is, never followed by a fallback.
 *
 * Release builds use Developer ID signing on macOS and Authenticode signing on Windows;
 * unsigned dry-run artifacts can still find updates, but platform trust and release
 * gates only apply to signed release builds. Linux AppImage continues without
 * code-signing for now.
 */
import { app, dialog, shell } from "electron";
import type { BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import type {
  DesktopUpdateStatus,
  DesktopUpdaterCommandMessage,
} from "@lmliheng/penguin-server/api";
import { resolveProfile } from "./app-identity.js";
import { logLine } from "./desktop-log.js";
import {
  GITHUB_FEED,
  MIRROR_FEED_URL,
  RELEASES_URL,
  fallsBackToGithub,
  feedUrlOverride,
  initialFeedKind,
  updateSupport,
} from "./update-support.js";
import type { UpdateFeedKind } from "./update-support.js";
import { initialUpdateStatus, nextUpdateStatus } from "./updater-status.js";
import type { UpdaterEvent } from "./updater-status.js";

const { autoUpdater } = electronUpdater;

/** First check runs after this delay: booting the server and the window comes first. */
const FIRST_CHECK_DELAY_MS = 20_000;
/** Subsequent automatic checks. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function log(line: string): void {
  logLine(`[updater] ${line}`);
}

// Pure over argv and isPackaged, so resolving it here again costs nothing and keeps the
// menu's enabled state (read before initUpdater) in step with the running instance.
const profile = resolveProfile({ argv: process.argv, isPackaged: app.isPackaged });
let manualCheckInFlight = false;
let downloadedVersion: string | null = null;
let downloadInFlight = false;
/** The running download was started from the native dialog: its outcomes get native dialogs too. */
let nativeDownload = false;

/**
 * The feeds this build can update from, and the one a check is pointed at right now: the OSS
 * mirror by default, an explicit PENGUIN_UPDATE_FEED_URL instead when one is set, and GitHub
 * Releases while a check the mirror did not answer is being retried (`handleCheckError`).
 */
let overrideFeedUrl: string | null = null;
let activeFeed: UpdateFeedKind = "mirror";

/** Points electron-updater at one of the three feeds; the kind is remembered for the fallback. */
function setFeed(kind: UpdateFeedKind): void {
  activeFeed = kind;
  if (kind === "github") {
    autoUpdater.setFeedURL(GITHUB_FEED);
    return;
  }
  autoUpdater.setFeedURL({
    provider: "generic",
    url: kind === "override" ? (overrideFeedUrl as string) : MIRROR_FEED_URL,
  });
}

function scheduleChecks(): void {
  setTimeout(() => void check(), FIRST_CHECK_DELAY_MS).unref();
  setInterval(() => void check(), CHECK_INTERVAL_MS).unref();
}

// --- status relay (the account-menu row's data source) -----------------------

let status: DesktopUpdateStatus = initialUpdateStatus(app.getVersion());
let statusSeq = 0;
const statusListeners = new Set<(status: DesktopUpdateStatus) => void>();

/** Folds one event into the snapshot, stamps the seq and pushes it to every subscriber. */
function emitStatus(ev: UpdaterEvent): void {
  status = { ...nextUpdateStatus(status, ev), seq: ++statusSeq };
  for (const listener of statusListeners) listener(status);
}

/**
 * Re-pushes the current snapshot with a fresh seq — the NACK for a relayed check that
 * changes nothing (already downloading, or a build already waiting): the row's armed
 * check settles on what is, instead of waiting out its timeout.
 */
function reannounceStatus(): void {
  status = { ...status, seq: ++statusSeq };
  for (const listener of statusListeners) listener(status);
}

/**
 * Records a failure and, when the native path asked for the step that failed, tells the
 * user in a dialog: a menu-driven check, or a download started from the offer dialog.
 * Web-driven steps report through the status the modal reads.
 */
function reportUpdaterError(err: Error, step: "check" | "download"): void {
  emitStatus({ kind: "error", message: err.message });
  const native = step === "check" ? manualCheckInFlight : nativeDownload;
  if (!native) return;
  manualCheckInFlight = false;
  nativeDownload = false;
  void dialog
    .showMessageBox({
      type: "error",
      message: step === "check" ? "Could not check for updates." : "Could not download the update.",
      detail: `${err.message}\n\nYou can always download the latest release manually.`,
      buttons: ["Open Releases", "OK"],
      defaultId: 1,
      cancelId: 1,
    })
    .then((r) => {
      if (r.response === 0) void shell.openExternal(RELEASES_URL);
    });
}

/**
 * A check that failed. The default feed is the OSS mirror, a convenience copy of the Release
 * assets — so a check it does not answer is retried against GitHub Releases, which is where those
 * assets are published and which every release leaves current. Only a failure of that second feed
 * is the user's failure. An explicit PENGUIN_UPDATE_FEED_URL never falls back: it names the feed
 * to use, and a check against some other one would answer a different question.
 */
function handleCheckError(err: Error): void {
  if (fallsBackToGithub(activeFeed)) {
    log(`mirror check failed (${err.message}); retrying against GitHub Releases`);
    void check("github");
    return;
  }
  reportUpdaterError(err, "check");
}

/** Current snapshot, for the initial push after a server (re)start. */
export function getUpdaterStatus(): DesktopUpdateStatus {
  return status;
}

/** Subscribes to every status fold; returns the unsubscribe (main.ts drops it when the server child exits). */
export function onUpdaterStatus(listener: (status: DesktopUpdateStatus) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/**
 * Server-relayed command from the page's update modal. `check` is a manual check whose
 * outcomes render in the modal (no dialogs); a check that cannot run answers with a
 * status push instead of silence, so the modal always settles. `download` fetches the
 * release on offer — the page confirmed it before sending. `install` restarts into a
 * downloaded build — the page confirmed the interruption before sending it, and it only
 * offers the step in the `downloaded` state, so a stale frame is dropped here.
 */
export function handleUpdaterCommand(action: DesktopUpdaterCommandMessage["action"]): void {
  if (action === "download") {
    void startDownload("web");
    return;
  }
  if (action === "check") {
    const support = updateSupport({
      isPackaged: app.isPackaged,
      profile,
      platform: process.platform,
      env: process.env,
    });
    if (!support.supported) {
      emitStatus({ kind: "unsupported", reason: support.reason });
      return;
    }
    if (
      downloadedVersion !== null ||
      status.state === "downloading" ||
      status.state === "available" ||
      status.state === "checking"
    ) {
      reannounceStatus();
      return;
    }
    void check();
    return;
  }
  if (downloadedVersion === null) {
    log("install requested with nothing downloaded (stale row); ignoring");
    return;
  }
  // Same path as the dialog's "Restart now": quitAndInstall goes through the normal
  // quit sequence, so the shell's before-quit hook still stops the embedded server
  // gracefully before the files are replaced.
  autoUpdater.quitAndInstall();
}

/** Whether the "Check for Updates…" menu item should be enabled at all. */
export function updatesAvailableInThisForm(): boolean {
  return updateSupport({
    isPackaged: app.isPackaged,
    profile,
    platform: process.platform,
    env: process.env,
  }).supported;
}

/**
 * Wires the updater and starts the automatic schedule. Safe to call in any form: an
 * unsupported one (dev run, deb install) only logs why it is standing down.
 */
export function initUpdater(getWindow: () => BrowserWindow | null): void {
  const support = updateSupport({
    isPackaged: app.isPackaged,
    profile,
    platform: process.platform,
    env: process.env,
  });
  if (!support.supported) {
    log(`disabled (${support.reason})`);
    emitStatus({ kind: "unsupported", reason: support.reason });
    return;
  }

  // Explicit download, explicit install: the user decides both when to fetch and when to
  // restart, and each step's failure is reported where that step was asked for.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;

  autoUpdater.on("checking-for-update", () => {
    log("checking");
    emitStatus({ kind: "checking" });
  });
  autoUpdater.on("update-not-available", (info: { version: string }) => {
    log(`up to date (${info.version})`);
    emitStatus({ kind: "not-available" });
    if (manualCheckInFlight) {
      manualCheckInFlight = false;
      void dialog.showMessageBox({
        type: "info",
        message: "Adelie is up to date.",
        detail: `Version ${app.getVersion()} is the latest release.`,
        buttons: ["OK"],
      });
    }
  });
  autoUpdater.on("update-available", (info: { version: string }) => {
    log(`update available: ${info.version} (offered)`);
    emitStatus({ kind: "available", version: info.version });
    if (manualCheckInFlight) {
      manualCheckInFlight = false;
      void promptDownload(info.version, getWindow());
    }
  });
  autoUpdater.on("download-progress", (p: { percent: number }) => {
    log(`downloading ${Math.round(p.percent)}%`);
    emitStatus({ kind: "progress", percent: Math.round(p.percent) });
  });
  autoUpdater.on("update-downloaded", (info: { version: string }) => {
    downloadedVersion = info.version;
    log(`downloaded: ${info.version}`);
    emitStatus({ kind: "downloaded", version: info.version });
    // Only the native path prompts: a download the page started ends in the modal's own
    // "restart to update" step, and a second prompt on top of it would be one too many.
    if (nativeDownload) {
      nativeDownload = false;
      void promptRestart(info.version, getWindow());
    }
  });
  autoUpdater.on("error", (err: Error) => {
    log(`error: ${err.message}`);
    if (downloadInFlight) {
      return;
    }
    handleCheckError(err);
  });

  overrideFeedUrl = feedUrlOverride(process.env);
  setFeed(initialFeedKind(process.env));
  // Which feed this run will read says where an update did (or did not) come from, which is the
  // first question when one fails.
  log(
    overrideFeedUrl !== null
      ? `feed override: ${overrideFeedUrl}`
      : `feed: mirror ${MIRROR_FEED_URL} (GitHub Releases as fallback)`,
  );
  scheduleChecks();
}

/** `startFeed` is what the GitHub fallback passes; an ordinary check starts from the default. */
async function check(startFeed?: UpdateFeedKind): Promise<void> {
  // A waiting build ends the checking: a re-check that finds a newer release would
  // start fetching it and invalidate the downloaded package on disk while the UI still
  // points its install action at it. The user installs what they were offered; the next
  // launch checks again. A running download likewise finishes undisturbed, and a standing
  // offer stays what it is — the user takes it or leaves it; the next launch checks again.
  if (
    downloadedVersion !== null ||
    status.state === "downloading" ||
    status.state === "available"
  ) {
    return;
  }
  // Every ordinary check starts from the configured default, so a mirror that failed last time
  // gets another chance instead of the session being pinned to the fallback.
  setFeed(startFeed ?? initialFeedKind(process.env));
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    // The error event already reported it; this catch only keeps the rejection from
    // reaching the process-level handler.
    log(`check failed: ${(err as Error).message}`);
  }
}

/**
 * The user's "download" — from the page's modal (`web`) or the native offer dialog
 * (`native`): fetches the release on offer. Anything else on offer is answered with a
 * status push (a build already waiting or downloading, or nothing offered at all — a
 * stale frame), so the asking side settles instead of waiting.
 */
async function startDownload(origin: "native" | "web"): Promise<void> {
  if (downloadedVersion !== null || downloadInFlight) {
    reannounceStatus();
    return;
  }
  if (status.state !== "available" || status.version === undefined) {
    log("download requested with nothing offered (stale frame); ignoring");
    reannounceStatus();
    return;
  }
  nativeDownload = origin === "native";
  emitStatus({ kind: "download-started", version: status.version });
  await downloadUpdate();
}

/**
 * One download of the offered release. There is no second feed to retry it on, so a failed
 * package fetch is reported like any other download failure — where the download was asked
 * for (the page's modal, or the native dialog a menu-driven check ended in).
 */
async function downloadUpdate(): Promise<void> {
  if (downloadedVersion !== null || downloadInFlight) return;
  downloadInFlight = true;
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    if (downloadedVersion !== null) return;
    reportUpdaterError(err as Error, "download");
  } finally {
    downloadInFlight = false;
  }
}

/** Menu action: same check, but every outcome is reported. */
export async function checkForUpdatesManually(): Promise<void> {
  if (!updatesAvailableInThisForm()) {
    const support = updateSupport({
      isPackaged: app.isPackaged,
      profile,
      platform: process.platform,
      env: process.env,
    });
    // `linux-not-appimage` covers every Linux form that is not an AppImage — a deb install,
    // but also an unpacked tree — so the wording names the rule rather than assuming dpkg.
    const detail =
      support.supported || support.reason === "dev"
        ? "This build does not update itself."
        : "Only the AppImage build updates itself on Linux. Update a package install with your package manager, or download the latest release manually.";
    await dialog.showMessageBox({ type: "info", message: "Updates are unavailable.", detail });
    return;
  }
  if (downloadedVersion !== null) {
    await promptRestart(downloadedVersion, null);
    return;
  }
  if (status.state === "downloading") {
    // check() would decline anyway; a manual action still answers (the silence rule).
    await dialog.showMessageBox({
      type: "info",
      message: "An update is downloading.",
      detail: "You will be asked to restart when it is ready.",
    });
    return;
  }
  if (status.state === "available" && status.version !== undefined) {
    // The offer stands (check() leaves it alone); a manual check re-presents it.
    await promptDownload(status.version, null);
    return;
  }
  manualCheckInFlight = true;
  await check();
}

/**
 * "A release is available" prompt for the native path. Downloading is the user's call
 * here exactly as it is in the Web App's modal; a "Later" leaves the offer standing.
 */
async function promptDownload(version: string, parent: BrowserWindow | null): Promise<void> {
  const options = {
    type: "info" as const,
    message: `Version ${version} is available.`,
    detail:
      "Download it now? Adelie keeps running while it downloads, and you will be asked to restart when it is ready.",
    buttons: ["Download", "Later"],
    defaultId: 0,
    cancelId: 1,
  };
  const result = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);
  if (result.response !== 0) return;
  await startDownload("native");
}

/** "Ready to install" prompt; restarting is the only path that swaps the app. */
async function promptRestart(version: string, parent: BrowserWindow | null): Promise<void> {
  const options = {
    type: "info" as const,
    message: `Version ${version} is ready to install.`,
    detail: "Adelie will restart to finish updating. Running tasks will be interrupted.",
    buttons: ["Restart now", "Later"],
    defaultId: 0,
    cancelId: 1,
  };
  const result = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);
  if (result.response !== 0) return;
  // quitAndInstall triggers the normal quit path first, so the shell's before-quit hook
  // still stops the embedded server gracefully before the files are replaced.
  autoUpdater.quitAndInstall();
}
