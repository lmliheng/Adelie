/**
 * Regression: a refused save of the upload limits (Settings → 服务器 → 上传限制) says why in the
 * section itself, above the Save row, and the sentence outlives the six seconds a toast lives.
 *
 * The two numbers are one PUT. The pair's own rejection (`invalid_attachment_limit`) was already
 * drawn under both fields; every other way the save can fail — a lost session, a dead server, a
 * 500 — arrived as a notification over a form that looked untouched, and the notification then
 * left. Both fields still held what was typed, so the reader had nothing to tell "not saved" from
 * "saved" after six seconds, and Save — the retry — was unmarked.
 *
 * The server-wide refusal is stubbed at `page.route` because what is under test is what the page
 * does with an answer; the pair's own rejection is provoked from the real server, so the two slots
 * cannot be confused with each other.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The line the section draws for `internal`: the shared lead-in plus the app's own sentence. */
const REFUSED = "操作被拒绝：服务器内部错误，请稍后重试。";

/** The server's sentence about the pair, which draws under the two numbers instead. */
const PAIR_REFUSED = "上传限制无效：请填写允许范围内的整数 MB，且合计不低于单个上限。";

/**
 * Sign in as the seeded administrator (the section is admin-only) and give the Project a model —
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

/** The settings dialog, opened the way a person opens it: the user menu, then 上传限制. */
async function openUploads(page) {
  // The user menu shares its name with the Project switcher, so take the last match (as chat.spec).
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "上传限制", exact: true }).click();
  return settings;
}

/** The section element holding the two numbers, so the fields and their slotted line read together. */
function sectionOf(settings) {
  return settings.locator("section").filter({ hasText: "单条消息附件合计上限" });
}

/**
 * The toast stack by its own hook rather than by role: the dialog marks the rest of the page
 * aria-hidden, so a toast that is on screen still has to be counted from the DOM.
 */
function toasts(page) {
  return page.locator('section[aria-label="通知"] button');
}

/** The stored pair, straight from the server — what a refused save must leave alone. */
async function storedLimits(page) {
  const body = await (await page.request.get(`${BASE}/api/admin/settings`)).json();
  const { attachmentMaxMb, attachmentTotalMb } = body.settings;
  return { maxMb: attachmentMaxMb, totalMb: attachmentTotalMb };
}

/**
 * Answer `PUT /api/admin/settings` with a refusal (500 `internal`) until `letThrough()`. Counted,
 * so the spec can tell whether a request was really sent at all.
 */
async function stubSave(page, seen) {
  let refuse = true;
  await page.route("**/api/admin/settings", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    seen.push(route.request().postData() ?? "");
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

test("a refused save keeps its reason above the Save row, past the toast it used to be", async ({
  page,
}) => {
  await ready(page);
  const attempts = [];
  const letThrough = await stubSave(page, attempts);

  await page.goto("/");
  const settings = await openUploads(page);
  const section = sectionOf(settings);
  const maxField = section.getByLabel("单个附件上限（MB）");
  await expect(maxField).toBeEnabled();
  await expect(section.getByRole("alert")).toHaveCount(0);

  const before = await storedLimits(page);
  // A pair that differs from what is stored, so the save is a real write — and legal, so the
  // retry at the end of this spec lands.
  const typedTotal = before.totalMb + 1;

  await maxField.fill(String(before.maxMb));
  await section.getByLabel("单条消息附件合计上限（MB）").fill(String(typedTotal));
  await settings.getByRole("button", { name: "保存", exact: true }).click();

  // The sentence, in the form it was refused in — once, and not as a notification over it.
  await expect(section.getByRole("alert")).toHaveText(REFUSED);
  await expect(section.getByRole("alert")).toHaveCount(1);
  expect(attempts).toHaveLength(1);
  await expect(toasts(page)).toHaveCount(0);

  // Nothing was written, and the form still holds what was typed.
  expect(await storedLimits(page)).toEqual(before);
  await expect(section.getByLabel("单条消息附件合计上限（MB）")).toHaveValue(String(typedTotal));
  // The pair's own slot is not where a server failure goes.
  await expect(section.getByText(PAIR_REFUSED)).toHaveCount(0);

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(section.getByRole("alert")).toHaveText(REFUSED);
  await expect(toasts(page)).toHaveCount(0);

  // The next save is the retry: it lands, so the sentence of the last attempt goes with it.
  letThrough();
  await settings.getByRole("button", { name: "保存", exact: true }).click();
  await expect(section.getByText(REFUSED)).toHaveCount(0);
  expect(await storedLimits(page)).toEqual({ maxMb: before.maxMb, totalMb: typedTotal });
  expect(attempts).toHaveLength(2);
});

test("the pair's own rejection draws under the two numbers, not above the Save row", async ({
  page,
}) => {
  await ready(page);
  await page.goto("/");
  const settings = await openUploads(page);
  const section = sectionOf(settings);
  const maxField = section.getByLabel("单个附件上限（MB）");
  await expect(maxField).toBeEnabled();

  // A total below the single-file cap is the pair's own rejection, and it comes from the real
  // server — the numbers are written together, so a refused pair writes nothing.
  const before = await storedLimits(page);
  await maxField.fill("200");
  await section.getByLabel("单条消息附件合计上限（MB）").fill("1");
  await settings.getByRole("button", { name: "保存", exact: true }).click();

  await expect(section.getByText(PAIR_REFUSED)).toBeVisible();
  // Both fields are marked, and the section slot says nothing: this is not a form-wide failure.
  await expect(section.getByText(REFUSED)).toHaveCount(0);
  await expect(toasts(page)).toHaveCount(0);
  expect(await storedLimits(page)).toEqual(before);
});
