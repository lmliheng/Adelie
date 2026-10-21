/**
 * The new-conversation page's version line: it always names the running build, and when the
 * update check knows a newer published release it names that one beside it. The point is the
 * stale case — the superscript badge only says "有新版本可用" and keeps the version in a
 * tooltip, so a reader two releases behind could not see the gap from this page.
 *
 * The update check is the one thing stubbed here: its real answer depends on GitHub, and the
 * case is about the line, not the lookup (the lookup itself is covered by the server's own
 * tests). Version, login and the draft page are the real app.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const U = "versionline";
const P = "password123";

/** One UpdateCheckResponse; `latest` names the newest release the lookup found. */
function checkPayload(latest, updateAvailable) {
  return {
    currentVersion: "0.0.0",
    buildDate: null,
    latestVersion: latest,
    updateAvailable,
    releaseUrl: null,
    publishedAt: null,
    checkedAt: new Date().toISOString(),
  };
}

test("the new-conversation page names the newest release beside the running one", async ({
  page,
}) => {
  // Swapped between loads: the app reads the check once per page load (module-level cache).
  let answer = checkPayload("9.9.9", true);
  await page.route("**/api/version/update-check*", (route) =>
    route.fulfill({ status: 200, json: answer }),
  );

  await provisionAndLogin(page.request, U, P);
  const res = await page.request.get(`${BASE}/api/version`);
  expect(res.ok(), "version").toBeTruthy();
  const version = (await res.json()).version;

  await page.goto(`${BASE}/chat/new`);
  // The brand block: logo, name, subtitle and the version line under them.
  const brand = page.getByRole("heading", { name: "Adelie" }).locator("..");
  await expect(brand).toContainText(`v${version}`);
  await expect(brand).toContainText("最新版本 v9.9.9");

  // Up to date: nothing newer to name, so the line is the running version alone.
  answer = checkPayload("9.9.9", false);
  await page.reload();
  await expect(brand).toContainText(`v${version}`);
  await expect(brand).not.toContainText("最新版本");
});
