/**
 * Regression: Settings → 服务器 → 上传限制 says why its two fields are dead when
 * `GET /api/admin/settings` fails, on the line above them, and that sentence outlives the six
 * seconds a toast lives.
 *
 * Both fields stay disabled until the stored numbers arrive, so a failed read leaves two dead
 * fields showing nothing — the page used to say so in a notification that dismissed itself,
 * leaving the fields dead with nothing on screen about it.
 *
 * The read is stubbed at `page.route` rather than provoked from the server: what is under test is
 * what the page does with an answer, and the sentence asserted is the app's own for the code the
 * server would send (`internal`), behind the shared lead-in. Leaving the page and coming back is
 * the retry — the section is mounted only while it is the open page.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The line the section draws: the shared lead-in plus the app's sentence for `internal`. */
const REFUSED = "操作被拒绝：服务器内部错误，请稍后重试。";

/** The stored defaults, which is what the fields show once the read lands. */
const MAX_MB = 100;
const TOTAL_MB = 120;

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

/** The section element holding the two fields, so the fields and their line are read together. */
function sectionOf(settings) {
  return settings.locator("section").filter({ hasText: "单条消息附件合计上限" });
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

test("the upload limits say why they are dead, past the toast they used to be", async ({
  page,
}) => {
  await ready(page);
  const reads = [];
  const letThrough = await stubRead(page, reads);

  await page.goto("/");
  const settings = await openSettings(page, "上传限制");
  const section = sectionOf(settings);
  const maxField = section.getByLabel("单个附件上限（MB）");
  const totalField = section.getByLabel("单条消息附件合计上限（MB）");

  // The sentence, above the fields it left dead — once, and not as a notification over them.
  await expect(section.getByRole("alert")).toHaveText(REFUSED);
  await expect(section.getByRole("alert")).toHaveCount(1);
  await expect(maxField).toBeDisabled();
  await expect(totalField).toBeDisabled();
  expect(reads.length).toBeGreaterThanOrEqual(1);
  await expect(toasts(page)).toHaveCount(0);

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(section.getByRole("alert")).toHaveText(REFUSED);
  await expect(maxField).toBeDisabled();
  await expect(totalField).toBeDisabled();

  // Leaving the page and coming back is the retry: the read lands, the sentence goes, both
  // fields open on what the server holds.
  letThrough();
  const remountAt = reads.length;
  await settings.getByRole("button", { name: "通用", exact: true }).click();
  await settings.getByRole("button", { name: "上传限制", exact: true }).click();
  const again = sectionOf(settings);
  await expect(again.getByRole("alert")).toHaveCount(0);
  await expect(again.getByLabel("单个附件上限（MB）")).toBeEnabled();
  await expect(again.getByLabel("单条消息附件合计上限（MB）")).toBeEnabled();
  await expect(again.getByLabel("单个附件上限（MB）")).toHaveValue(String(MAX_MB));
  await expect(again.getByLabel("单条消息附件合计上限（MB）")).toHaveValue(String(TOTAL_MB));
  expect(reads.length).toBeGreaterThan(remountAt);
});
