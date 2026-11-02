/**
 * Regression: Settings → 插件 says why the page is empty when `GET /api/admin/plugin-config`
 * fails, on the page itself, and that sentence outlives the six seconds a toast lives.
 *
 * The page draws nothing until the configuration arrives, so a failed read left a blank page and
 * the reason in a notification that dismissed itself — six seconds later there was nothing on
 * screen about it at all. A picked machine already said why; this server did not.
 *
 * The read is stubbed at `page.route` rather than provoked from the server: what is under test is
 * what the page does with an answer, and the sentence asserted is the app's own for the code the
 * server would send (`internal`), which the caller localizes before it reaches the line. Leaving
 * the page and coming back is the retry — the section is mounted only while it is the open page.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The line the page draws for this server: its own sentence, then the app's text for `internal`. */
const REFUSED = "无法读取本机的插件：服务器内部错误，请稍后重试。";

/**
 * Sign in as the seeded administrator (the page is admin-only) and give the Project a model —
 * the onboarding overlay covers the page without one.
 */
async function ready(page) {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: "claude-4-8" },
      models: [
        {
          provider: "custom",
          modelId: "claude-4-8",
          apiKey: "sk-mock",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
}

/** The settings dialog, opened the way a person opens it: the user menu, then a page. */
async function openSettings(page, section) {
  // The user menu shares its name with the Project switcher, so take the last match (as chat.spec).
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: section, exact: true }).click();
  return settings;
}

/**
 * The toast stack by its own hook rather than by role: the modal marks the rest of the page
 * aria-hidden, and a toast is exactly the surface this spec is about — read the DOM, so a toast
 * that is on screen still counts.
 */
function toasts(page) {
  return page.locator('section[aria-label="通知"] button');
}

/**
 * Answer `GET /api/admin/plugin-config` with a refusal (500 `internal`) until `letThrough()`.
 * Counted, so the spec can tell whether a request was really sent at all.
 */
async function stubRead(page, seen) {
  let refuse = true;
  await page.route("**/api/admin/plugin-config", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    seen.push(route.request().url());
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "Internal server error" } }),
    });
  });
  return () => {
    refuse = false;
  };
}

test("the plugins page says why it is empty, past the toast it used to be", async ({ page }) => {
  await ready(page);
  const reads = [];
  const letThrough = await stubRead(page, reads);

  await page.goto("/");
  const settings = await openSettings(page, "插件");
  const section = settings.locator("section").first();
  // Empty, with the reason — the cards that would be here never arrived.
  await expect(section.getByRole("alert")).toHaveText(REFUSED);
  await expect(section.getByRole("alert")).toHaveCount(1);
  await expect(section.locator("[data-plugin-config]")).toHaveCount(0);
  expect(reads.length).toBeGreaterThanOrEqual(1);
  await expect(toasts(page)).toHaveCount(0);

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(section.getByRole("alert")).toHaveText(REFUSED);

  // Leaving the page and coming back is the retry: the read lands, the sentence goes, and the
  // cards it was standing in for are drawn.
  letThrough();
  const remountAt = reads.length;
  await settings.getByRole("button", { name: "通用", exact: true }).click();
  await settings.getByRole("button", { name: "插件", exact: true }).click();
  const again = settings.locator("section").first();
  await expect(again.getByRole("alert")).toHaveCount(0);
  await expect(again.locator("[data-plugin-config]").first()).toBeVisible();
  expect(reads.length).toBeGreaterThan(remountAt);
});
