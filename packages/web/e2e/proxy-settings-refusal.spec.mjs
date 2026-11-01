/**
 * Regression: the two refusals the proxy options (Settings → 服务器 → 代理选项) have no field to
 * draw on say why in the section itself, and the sentences outlive the six seconds a toast lives.
 *
 * A save refused for anything but the address — a lost session, a dead server, a 500 — writes
 * nothing, so the two switches and the address come back exactly as they were and Save is the
 * retry; the reason used to arrive as a notification over that untouched form. Settings that fail
 * to LOAD are the sharper half: every control stays disabled showing the form's defaults, and the
 * page said nothing about it that survived six seconds.
 *
 * The address's own rejection (`invalid_proxy_url`) is not this spec's business — it already draws
 * under the input, and the assertion that it still does is here only so the two slots cannot be
 * confused with each other.
 *
 * Both refusals are stubbed at `page.route` rather than provoked from the server: what is under
 * test is what the page does with an answer, and the sentence asserted is the app's own for the
 * code the server would send (`internal`), behind the shared lead-in.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The line the section draws: the shared lead-in plus the app's sentence for `internal`. */
const REFUSED = "操作被拒绝：服务器内部错误，请稍后重试。";

/** The address a save of this spec sends; its own form is what proves nothing was written. */
const TYPED = "http://127.0.0.1:9";

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

/** The settings dialog, opened the way a person opens it: the user menu, then 代理选项. */
async function openProxy(page) {
  // The user menu shares its name with the Project switcher, so take the last match (as chat.spec).
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "代理选项", exact: true }).click();
  return settings;
}

/** The form's own `<section>`: the two switches, the address and (when refused) the sentence. */
function proxyForm(settings) {
  return settings.locator("section").filter({ hasText: "应用程序使用代理" });
}

/**
 * Answer one method of `/api/admin/settings` with a refusal (500 `internal`) until `letThrough()`.
 * Counted, so the spec can tell whether a request was really sent at all.
 */
async function stubSettings(page, method, seen) {
  let refuse = true;
  await page.route("**/api/admin/settings", async (route) => {
    if (route.request().method() !== method) return route.fallback();
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
  const projectId = await ready(page);
  const attempts = [];
  const letThrough = await stubSettings(page, "PUT", attempts);

  await page.goto("/");
  const settings = await openProxy(page);
  const form = proxyForm(settings);
  await expect(form.getByLabel("代理地址")).toBeEnabled();
  await expect(form.getByRole("alert")).toHaveCount(0);
  const notices = page.getByRole("region", { name: "通知" });

  // What the server holds before the refused save: nothing — the address is empty.
  const before = (await (await page.request.get(`${BASE}/api/admin/settings`)).json()).settings;
  expect(before.proxyUrl ?? null).toBeNull();

  await form.getByLabel("代理地址").fill(TYPED);
  await settings.getByRole("button", { name: "保存", exact: true }).click();

  // The sentence, in the form it was refused in — once, and not as a notification over it.
  await expect(form.getByRole("alert")).toHaveText(REFUSED);
  await expect(form.getByRole("alert")).toHaveCount(1);
  expect(attempts).toHaveLength(1);
  await expect(notices.getByRole("button")).toHaveCount(0);

  // Nothing was written: the server still has no address, and the form still holds what was typed.
  const after = (await (await page.request.get(`${BASE}/api/admin/settings`)).json()).settings;
  expect(after.proxyUrl ?? null).toBeNull();
  await expect(form.getByLabel("代理地址")).toHaveValue(TYPED);
  // The address slot is not where a server failure goes.
  await expect(form.getByText("代理地址无效", { exact: false })).toHaveCount(0);

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(form.getByRole("alert")).toHaveText(REFUSED);
  await expect(notices.getByRole("button")).toHaveCount(0);

  // The next save is the retry: it lands, so the sentence of the last attempt goes with it.
  letThrough();
  await settings.getByRole("button", { name: "保存", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveCount(0);
  const saved = (await (await page.request.get(`${BASE}/api/admin/settings`)).json()).settings;
  expect(saved.proxyUrl).toBe(TYPED);
  expect(attempts).toHaveLength(2);
  // Left as it was found: the next run of this file starts from an empty address.
  const reset = await page.request.put(`${BASE}/api/admin/settings`, {
    data: { proxyForApp: true, proxyForAgent: true, proxyUrl: "" },
  });
  expect(reset.ok(), "reset the proxy").toBeTruthy();
  expect(projectId).toBeTruthy();
});

test("settings that fail to load say so above the controls, which stay shut", async ({ page }) => {
  await ready(page);
  const reads = [];
  const letThrough = await stubSettings(page, "GET", reads);

  await page.goto("/");
  const settings = await openProxy(page);
  const form = proxyForm(settings);

  // The sentence comes first in the section — it is read before the defaults under it.
  await expect(form.getByRole("alert")).toHaveText(REFUSED);
  await expect(form.getByRole("alert")).toHaveCount(1);
  expect(reads.length).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);

  // Nothing hydrated: both switches, the address, Save and the probe are disabled — and the
  // sentence is the only thing that says why.
  for (const name of ["应用程序使用代理", "Agent 环境使用代理"]) {
    await expect(form.getByRole("switch", { name })).toBeDisabled();
  }
  await expect(form.getByLabel("代理地址")).toBeDisabled();
  await expect(settings.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  await expect(settings.getByRole("button", { name: "测速", exact: true })).toBeDisabled();

  // Still there after a toast's lifetime — the controls below it never come back on their own.
  await page.waitForTimeout(7_000);
  await expect(form.getByRole("alert")).toHaveText(REFUSED);
  await expect(form.getByLabel("代理地址")).toBeDisabled();

  // Leaving the section and coming back is the retry: this time the read lands, the sentence goes
  // and the controls open.
  letThrough();
  const remountAt = reads.length;
  await settings.getByRole("button", { name: "通用", exact: true }).click();
  await settings.getByRole("button", { name: "代理选项", exact: true }).click();
  await expect(proxyForm(settings).getByRole("alert")).toHaveCount(0);
  await expect(proxyForm(settings).getByLabel("代理地址")).toBeEnabled();
  expect(reads.length).toBeGreaterThan(remountAt);
});
