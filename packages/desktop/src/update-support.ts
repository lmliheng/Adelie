/**
 * Whether this running form can update itself (pure; no Electron import, so it unit-tests
 * directly).
 *
 * electron-updater can only replace the forms it installed: the NSIS installer on
 * Windows, the app bundle on macOS, and an AppImage on Linux. A `.deb` belongs to the
 * system package manager — silently "updating" around dpkg would leave the two disagreeing
 * about what is installed — and a dev run has no installed artifact at all. A packaged
 * build on the dev profile (`--dev`) does have one, but it is the release instance's
 * installation, possibly running beside it; replacing it from here would pull the files
 * out from under that instance, so the dev profile stands down too.
 */
import type { Profile } from "./app-identity.js";

export type UpdateSupport =
  { supported: true } | { supported: false; reason: "dev" | "linux-not-appimage" };

export function updateSupport(opts: {
  isPackaged: boolean;
  profile: Profile;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
}): UpdateSupport {
  if (!opts.isPackaged || opts.profile !== "release") return { supported: false, reason: "dev" };
  // The AppImage runtime exports APPIMAGE with the path of the running image; a deb
  // install (or an extracted tree) has no such variable, and that is exactly the
  // distinction electron-updater's Linux path depends on.
  if (opts.platform === "linux" && !opts.env.APPIMAGE) {
    return { supported: false, reason: "linux-not-appimage" };
  }
  return { supported: true };
}

/**
 * Optional feed override (`PENGUIN_UPDATE_FEED_URL`), what makes an end-to-end update
 * test possible against a local server. Returns null when unset or unparseable — an
 * unusable override must not silently redirect updates, so the caller keeps the default
 * GitHub feed.
 */
export function feedUrlOverride(env: NodeJS.ProcessEnv): string | null {
  const raw = env.PENGUIN_UPDATE_FEED_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Adelie's own GitHub Releases, where the release assets are published: the source of truth, and
 * the feed a check falls back to when the mirror does not answer.
 */
export const GITHUB_FEED = {
  provider: "github" as const,
  owner: "lmliheng",
  repo: "Adelie",
};

/** The human-facing page the same feed belongs to (the error dialog's "Open Releases"). */
export const RELEASES_URL = "https://github.com/lmliheng/Adelie/releases";

/**
 * The Alibaba Cloud OSS mirror of those assets — the same bytes, served from `latest/` under
 * version-less names (see `scripts/publish-release-to-oss.sh`). It is the default feed, not a
 * replacement: Adelie's users are in China, where github.com is slow to unusable, and a check
 * that cannot reach the mirror goes to GitHub Releases instead.
 */
export const MIRROR_FEED_URL = "https://adelie-releases.oss-cn-hangzhou.aliyuncs.com/latest";

/** Which of the three feeds a check is pointed at. */
export type UpdateFeedKind = "override" | "mirror" | "github";

/**
 * The feed a check starts from: an explicit `PENGUIN_UPDATE_FEED_URL` (a deployment's own mirror,
 * or the local server an end-to-end update test stands up) wins over everything, the OSS mirror is
 * the default.
 */
export function initialFeedKind(env: NodeJS.ProcessEnv): UpdateFeedKind {
  return feedUrlOverride(env) !== null ? "override" : "mirror";
}

/**
 * Whether a failed check on this feed is retried against GitHub Releases. Only the mirror falls
 * back: it is a convenience copy of the Release assets, so GitHub still holds what the check was
 * looking for. An override is an instruction about which feed to use, and a check that quietly
 * went elsewhere would answer a different question than the one that was asked.
 */
export function fallsBackToGithub(kind: UpdateFeedKind): boolean {
  return kind === "mirror";
}
