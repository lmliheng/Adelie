import { describe, expect, it } from "vitest";
import {
  GITHUB_FEED,
  MIRROR_FEED_URL,
  fallsBackToGithub,
  feedUrlOverride,
  initialFeedKind,
  updateSupport,
} from "../src/update-support.js";

describe("updateSupport", () => {
  it("supports packaged macOS and Windows builds", () => {
    for (const platform of ["darwin", "win32"] as const) {
      expect(updateSupport({ isPackaged: true, profile: "release", platform, env: {} })).toEqual({
        supported: true,
      });
    }
  });

  it("supports Linux only when running as an AppImage", () => {
    const env = { APPIMAGE: "/opt/Adelie.AppImage" };
    expect(updateSupport({ isPackaged: true, profile: "release", platform: "linux", env })).toEqual(
      {
        supported: true,
      },
    );
    // A deb install has no APPIMAGE: updating around dpkg would desync the two.
    expect(
      updateSupport({ isPackaged: true, profile: "release", platform: "linux", env: {} }),
    ).toEqual({
      supported: false,
      reason: "linux-not-appimage",
    });
  });

  it("never updates a dev run, whatever the platform", () => {
    expect(
      updateSupport({
        isPackaged: false,
        profile: "dev",
        platform: "darwin",
        env: { APPIMAGE: "/x" },
      }),
    ).toEqual({ supported: false, reason: "dev" });
  });

  it("never updates a packaged build on the dev profile: the installation is the release instance's", () => {
    for (const platform of ["darwin", "win32"] as const) {
      expect(updateSupport({ isPackaged: true, profile: "dev", platform, env: {} })).toEqual({
        supported: false,
        reason: "dev",
      });
    }
  });
});

describe("feedUrlOverride", () => {
  it("accepts http(s) URLs and normalizes them", () => {
    expect(feedUrlOverride({ PENGUIN_UPDATE_FEED_URL: "http://127.0.0.1:8080/feed" })).toBe(
      "http://127.0.0.1:8080/feed",
    );
    expect(feedUrlOverride({ PENGUIN_UPDATE_FEED_URL: " https://example.com/u " })).toBe(
      "https://example.com/u",
    );
  });

  it("ignores unset, blank, non-http and unparseable values", () => {
    expect(feedUrlOverride({})).toBeNull();
    expect(feedUrlOverride({ PENGUIN_UPDATE_FEED_URL: "   " })).toBeNull();
    expect(feedUrlOverride({ PENGUIN_UPDATE_FEED_URL: "file:///etc/passwd" })).toBeNull();
    expect(feedUrlOverride({ PENGUIN_UPDATE_FEED_URL: "not a url" })).toBeNull();
  });
});

describe("the default feed", () => {
  it("is Adelie's own OSS mirror, over https, with /latest as the generic feed its assets live under", () => {
    // The mirror is a generic feed: electron-updater appends `/latest.yml` (Windows) or
    // `/latest-linux.yml` (Linux) to this URL, which is exactly what publish-release-to-oss.sh
    // uploads to `latest/`.
    expect(MIRROR_FEED_URL).toBe("https://adelie-releases.oss-cn-hangzhou.aliyuncs.com/latest");
    expect(new URL(MIRROR_FEED_URL).protocol).toBe("https:");
  });

  it("is this fork's GitHub Releases when a check falls back, not upstream's", () => {
    // Both projects reuse version numbers: a feed left pointing at PenguinHarness would offer —
    // and install — a PenguinHarness build over this app.
    expect(GITHUB_FEED).toEqual({ provider: "github", owner: "lmliheng", repo: "Adelie" });
  });
});

describe("initialFeedKind", () => {
  it("starts from the mirror, or from an explicit PENGUIN_UPDATE_FEED_URL when one is set", () => {
    expect(initialFeedKind({})).toBe("mirror");
    expect(initialFeedKind({ PENGUIN_UPDATE_FEED_URL: "http://127.0.0.1:8080/feed" })).toBe(
      "override",
    );
    // An unusable override is not a feed; the check still starts from the mirror.
    expect(initialFeedKind({ PENGUIN_UPDATE_FEED_URL: "file:///etc/passwd" })).toBe("mirror");
  });
});

describe("fallsBackToGithub", () => {
  it("retries the mirror against GitHub Releases, and leaves an override alone", () => {
    expect(fallsBackToGithub("mirror")).toBe(true);
    expect(fallsBackToGithub("override")).toBe(false);
    // Already the fallback: a second failure is the answer, not another retry.
    expect(fallsBackToGithub("github")).toBe(false);
  });
});
