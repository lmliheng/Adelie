/**
 * Regression: the two server-wide switches — Settings → 服务器 → Agent API and 公司模式 — say why
 * they are shut when `GET /api/admin/settings` fails, on the same line a refused write uses, and
 * that sentence outlives the six seconds a toast lives.
 *
 * Both switches stay disabled until a stored value arrives, so a failed read leaves a dead knob
 * under a value nobody read; the page used to say so in a notification that dismissed itself,
 * leaving the knob dead with nothing on screen about it.
 *
 * The read is stubbed at `page.route` rather than provoked from the server: what is under test is
 * what the page does with an answer, and the sentence asserted is the app's own for the code the
 * server would send (`internal`), behind the shared lead-in. Leaving the page and coming back is
 * the retry — the sections are mounted only while they are the open page.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The line the section draws: the shared lead-in plus the app's sentence for `internal`. */
const REFUSED = "操作被拒绝：服务器内部错误，请稍后重试。";

/**
 * Sign in as the seeded administrator (both pages are admin-only) and give the Project a model —
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

/** The section element holding the switch, so both the switch and its line are read together. */
function sectionOf(settings, switchName) {
  return settings.locator("section").filter({ hasText: switchName });
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
 * Answer `GET /api/admin/settings` with a refusal (500 `internal`) until `letThrough()`.
 * Counted, so the spec can tell whether a request was really sent at all.
 */
async function stubRead(page, seen) {
  let refuse = true;
  await page.route("**/api/admin/settings", async (route) => {
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

test("the Agent API switch says why it is shut, past the toast it used to be", async ({ page }) => {
  await ready(page);
  const reads = [];
  const letThrough = await stubRead(page, reads);

  await page.goto("/");
  const settings = await openSettings(page, "Agent API");
  const section = sectionOf(settings, "允许 Agent API");

  // The sentence, under the switch it left shut — once, and not as a notification over it.
  await expect(section.getByRole("alert")).toHaveText(REFUSED);
  await expect(section.getByRole("alert")).toHaveCount(1);
  await expect(section.getByRole("switch", { name: "允许 Agent API" })).toBeDisabled();
  expect(reads.length).toBeGreaterThanOrEqual(1);
  await expect(toasts(page)).toHaveCount(0);

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(section.getByRole("alert")).toHaveText(REFUSED);
  await expect(section.getByRole("switch", { name: "允许 Agent API" })).toBeDisabled();

  // Leaving the page and coming back is the retry: the read lands, the sentence goes, the switch
  // opens on what the server holds (on by default).
  letThrough();
  const remountAt = reads.length;
  await settings.getByRole("button", { name: "通用", exact: true }).click();
  await settings.getByRole("button", { name: "Agent API", exact: true }).click();
  const again = sectionOf(settings, "允许 Agent API");
  await expect(again.getByRole("alert")).toHaveCount(0);
  await expect(again.getByRole("switch", { name: "允许 Agent API" })).toBeEnabled();
  await expect(again.getByRole("switch", { name: "允许 Agent API" })).toBeChecked();
  expect(reads.length).toBeGreaterThan(remountAt);
});

test("the company-mode switch says why it is shut, past the toast it used to be", async ({
  page,
}) => {
  await ready(page);
  const reads = [];
  const letThrough = await stubRead(page, reads);

  await page.goto("/");
  const settings = await openSettings(page, "公司模式");
  const section = sectionOf(settings, "启用公司模式");

  await expect(section.getByRole("alert")).toHaveText(REFUSED);
  await expect(section.getByRole("alert")).toHaveCount(1);
  await expect(section.getByRole("switch", { name: "启用公司模式" })).toBeDisabled();
  expect(reads.length).toBeGreaterThanOrEqual(1);
  await expect(toasts(page)).toHaveCount(0);

  await page.waitForTimeout(7_000);
  await expect(section.getByRole("alert")).toHaveText(REFUSED);
  await expect(section.getByRole("switch", { name: "启用公司模式" })).toBeDisabled();

  // The retry is the same: another page and back. The server holds the mode off, and the switch
  // now shows that rather than the disabled default it was stuck on.
  letThrough();
  const remountAt = reads.length;
  await settings.getByRole("button", { name: "通用", exact: true }).click();
  await settings.getByRole("button", { name: "公司模式", exact: true }).click();
  const again = sectionOf(settings, "启用公司模式");
  await expect(again.getByRole("alert")).toHaveCount(0);
  await expect(again.getByRole("switch", { name: "启用公司模式" })).toBeEnabled();
  await expect(again.getByRole("switch", { name: "启用公司模式" })).not.toBeChecked();
  expect(reads.length).toBeGreaterThan(remountAt);
});
