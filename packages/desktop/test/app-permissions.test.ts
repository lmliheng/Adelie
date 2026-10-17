import { describe, expect, it } from "vitest";
import { grantsPermission } from "../src/app-permissions.js";

const ORIGIN = "http://localhost:51234";

describe("grantsPermission", () => {
  it("grants notifications to the App's own origin", () => {
    expect(grantsPermission("notifications", ORIGIN, ORIGIN)).toBe(true);
  });

  it("grants notifications for a page URL on the App origin (the request handler's shape)", () => {
    expect(grantsPermission("notifications", `${ORIGIN}/chat/abc`, ORIGIN)).toBe(true);
  });

  it("refuses notifications from another origin, a preview host included", () => {
    expect(grantsPermission("notifications", "http://127.0.0.1:51234/", ORIGIN)).toBe(false);
    expect(grantsPermission("notifications", "https://example.com/", ORIGIN)).toBe(false);
  });

  it("refuses notifications while the App origin is not known yet", () => {
    expect(grantsPermission("notifications", ORIGIN, null)).toBe(false);
  });

  it("leaves every other permission as it was (granted)", () => {
    for (const permission of ["fullscreen", "clipboard-sanitized-write", "media", "geolocation"]) {
      expect(grantsPermission(permission, "https://example.com/", ORIGIN)).toBe(true);
      expect(grantsPermission(permission, ORIGIN, null)).toBe(true);
    }
  });
});
