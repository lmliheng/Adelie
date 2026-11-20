/**
 * Regression: a refused save or check of the speech input (Settings → 服务器 → 语音输入) says why
 * in the section itself, once, and the sentence outlives the six seconds a toast lives.
 *
 * Both verbs write or probe the same three fields, and a failure that is about the form as a whole
 * (a lost session, a dead server, a 500) was drawn twice: inline above the Save row — the slot the
 * rest of this settings dialog migrated to (7.19's rule) — and again as a notification over that
 * untouched form, which then left. The second copy is what this spec pins down: the reason appears
 * once, in the section, and no notification carries it.
 *
 * The routes are stubbed rather than travelled: what is under test is what the page does with an
 * answer, and the sentence asserted is the app's own for the code the server would send
 * (`internal`), so no real speech provider is involved.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The sentence the section draws for `internal`: the shared lead-in plus the app's own words. */
const REFUSED = "操作被拒绝：服务器内部错误，请稍后重试。";

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
  return projectId;
}

/** The settings dialog, opened the way a person opens it: the user menu, then 语音输入. */
async function openSpeech(page) {
  // The user menu shares its name with the Project switcher, so take the last match (as chat.spec).
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "语音输入", exact: true }).click();
  return settings;
}

/** The speech form: the three fields and (when refused) the sentence below them — one `<section>`. */
function speechForm(settings) {
  return settings.locator('section:has-text("识别模型")');
}

/**
 * The toast stack by its own hook rather than by role: the dialog marks the rest of the page
 * aria-hidden, so a toast that is on screen still has to be counted from the DOM.
 */
function toasts(page) {
  return page.locator('section[aria-label="通知"] button');
}

/** A site that is a valid http(s) URL and answers nothing: the retry of this spec stores it. */
const TYPED = "http://127.0.0.1:9";

/**
 * Answer one method of `/api/asr/config` with a refusal until `letThrough()`. Counted, so the spec
 * can tell whether a request was really sent at all.
 */
async function stubConfig(page, method, seen, refusal) {
  let refuse = true;
  await page.route("**/api/asr/config", async (route) => {
    if (route.request().method() !== method) return route.fallback();
    seen.push(route.request().postData() ?? "");
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: refusal.status,
      contentType: "application/json",
      body: JSON.stringify({ error: refusal.error }),
    });
  });
  return () => {
    refuse = false;
  };
}

/**
 * Answer the connectivity check: a refusal until `letThrough()`, then the answer of a service that
 * did accept the fields. Stubbed so the save's own follow-up check is instant and deterministic —
 * the point of `TYPED` is that nothing listens on it.
 */
async function stubCheck(page, seen) {
  let refuse = true;
  await page.route("**/api/asr/test", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    seen.push(route.request().postData() ?? "");
    await route.fulfill({
      status: refuse ? 500 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        refuse
          ? { error: { code: "internal", message: "Internal server error" } }
          : { ok: true, message: "", endpoint: "ws://127.0.0.1:9/asr/v1" },
      ),
    });
  });
  return () => {
    refuse = false;
  };
}

test("a refused save keeps its reason in the section, once, past the toast it used to be", async ({
  page,
}) => {
  await ready(page);
  const attempts = [];
  const letThrough = await stubConfig(page, "PUT", attempts, {
    status: 500,
    error: { code: "internal", message: "Internal server error" },
  });
  await stubCheck(page, []);

  await page.goto("/");
  const settings = await openSpeech(page);
  const form = speechForm(settings);
  await expect(form.getByLabel("服务地址")).toBeEnabled();
  await expect(form.getByRole("alert")).toHaveCount(0);
  const model = `asr-refusal-${Date.now()}`;

  // What the server holds before the refused save — the refused one must leave it there.
  const before = (await (await page.request.get(`${BASE}/api/asr/config`)).json()).config;

  await form.getByLabel("服务地址").fill(TYPED);
  await form.getByLabel("识别模型").fill(model);
  await settings.getByRole("button", { name: "保存", exact: true }).click();

  // The sentence, in the form it was refused in — once, and not as a notification over it.
  await expect(form.getByRole("alert")).toHaveText(REFUSED);
  await expect(form.getByRole("alert")).toHaveCount(1);
  expect(attempts).toHaveLength(1);
  await expect(toasts(page)).toHaveCount(0);

  // Nothing was written, and the form still holds what was typed.
  const after = (await (await page.request.get(`${BASE}/api/asr/config`)).json()).config;
  expect(after.baseUrl).toBe(before.baseUrl);
  expect(after.model).toBe(before.model);
  await expect(form.getByLabel("识别模型")).toHaveValue(model);

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(form.getByRole("alert")).toHaveText(REFUSED);
  await expect(toasts(page)).toHaveCount(0);

  // The next save is the retry: it lands, so the sentence of the last attempt goes with it.
  letThrough();
  await settings.getByRole("button", { name: "保存", exact: true }).click();
  await expect(form.getByText(REFUSED)).toHaveCount(0);
  const saved = (await (await page.request.get(`${BASE}/api/asr/config`)).json()).config;
  expect(saved.baseUrl).toBe(TYPED);
  expect(saved.model).toBe(model);
  expect(attempts).toHaveLength(2);
});

test("a field's own rejection is drawn under that field, not in the section", async ({ page }) => {
  await ready(page);
  const attempts = [];
  await stubConfig(page, "PUT", attempts, {
    status: 400,
    error: { code: "invalid_asr_base_url", message: "baseUrl must be a full http(s) URL." },
  });
  await stubCheck(page, []);

  await page.goto("/");
  const settings = await openSpeech(page);
  const form = speechForm(settings);
  await expect(form.getByLabel("服务地址")).toBeEnabled();

  // Cleared, then saved: a site that is not a URL is the field's own rejection, and one edit is
  // enough to put the whole body on the wire — every field is validated together, none is written.
  await form.getByLabel("服务地址").fill("");
  await settings.getByRole("button", { name: "保存", exact: true }).click();

  await expect(form.getByText("服务地址必须是完整的 http(s) 地址。")).toBeVisible();
  // The field's sentence is the only `role="alert"` here: the section slot is not where it goes.
  await expect(form.getByRole("alert")).toHaveCount(1);
  await expect(form.getByText(REFUSED)).toHaveCount(0);
  await expect(toasts(page)).toHaveCount(0);
  expect(attempts).toHaveLength(1);
});

test("a refused check says so in the section, past the toast it used to be", async ({ page }) => {
  await ready(page);
  const checks = [];
  const letThrough = await stubCheck(page, checks);

  await page.goto("/");
  const settings = await openSpeech(page);
  const form = speechForm(settings);
  const probe = settings.getByRole("button", { name: "测试连通性", exact: true });
  await expect(probe).toBeEnabled();
  await expect(form.getByRole("alert")).toHaveCount(0);

  await probe.click();
  await expect(form.getByRole("alert")).toHaveText(REFUSED);
  await expect(form.getByRole("alert")).toHaveCount(1);
  expect(checks).toHaveLength(1);
  await expect(toasts(page)).toHaveCount(0);

  // Still there past a toast's lifetime: the check's own block under the key is where it belongs.
  await page.waitForTimeout(7_000);
  await expect(form.getByRole("alert")).toHaveText(REFUSED);
  await expect(toasts(page)).toHaveCount(0);

  // The same button is the retry; the answer then replaces the refusal.
  letThrough();
  await probe.click();
  await expect(form.getByText(REFUSED)).toHaveCount(0);
  await expect(form.getByText("连通正常", { exact: false })).toBeVisible();
  expect(checks).toHaveLength(2);
});
