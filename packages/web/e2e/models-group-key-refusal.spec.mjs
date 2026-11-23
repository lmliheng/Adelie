/**
 * Regression: the group key dialog ("填写密钥" on a group header) keeps itself open on a refused
 * write — with the typed key still in the field and the reason drawn above it — instead of closing
 * on the click and leaving the reason in a notification that dismissed itself after six seconds.
 *
 * The write is the page's whole-table PUT (one key across the group's rows), so a refusal is about
 * the key that was just typed: the dialog is the only thing that holds it, and the confirm button
 * is the retry. Going away on a refusal lost both — the reason six seconds later and the key at the
 * click — and the group header showed no sign anything had been attempted.
 *
 * The table write is stubbed rather than made to fail: what this spec is about is what the page
 * does with the answer. The retry travels for real, so the last test also holds the dialog to
 * closing exactly once, when the key lands.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** The group and model the tests work with; unique enough to appear nowhere else. */
const GROUP = "probekey";
const MODEL = "probe-key";
const NAME = "Probe Key";
const KEY = "sk-probe-group";

/** The row the model is, as this file seeds it: a hand-added model of a user-defined group. */
const ROW = {
  provider: GROUP,
  modelId: MODEL,
  displayName: NAME,
  contextWindow: 32000,
  clientType: "openai-chat",
  baseUrl: "http://127.0.0.1:9/v1",
  maxTokens: 4096,
};

/** The table entry a `ModelInfo` came from: every field the response reports, sent back as-is. */
function toEntry(m) {
  const entry = { provider: m.provider, modelId: m.modelId };
  for (const key of [
    "displayName",
    "contextWindow",
    "clientType",
    "vision",
    "maxTokens",
    "fastMode",
    "pricing",
  ]) {
    if (m[key] !== undefined) entry[key] = m[key];
  }
  if (m.credential?.baseUrl !== undefined) entry.baseUrl = m.credential.baseUrl;
  return entry;
}

/**
 * Provision the user and seed their Project with the model, through the table PUT so nothing here
 * depends on the built-in catalog. Idempotent: a rerun on the same data root rewrites the row the
 * tests expect rather than trusting it.
 */
async function projectWithModel(page, user) {
  await provisionAndLogin(page.request, user, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  const read = async () =>
    (await page.request.get(`${BASE}/api/projects/${projectId}/models`)).json();

  const table = await read();
  const current = table.models.find((m) => m.provider === GROUP && m.modelId === MODEL);
  if (!current || (current.displayName ?? "") !== NAME) {
    const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
      data: {
        defaultModel: table.defaultModel,
        models: [...table.models.filter((m) => m.provider !== GROUP).map(toEntry), ROW],
      },
    });
    expect(put.ok(), "seed the model through the table PUT").toBeTruthy();
  }
  expect(
    (await read()).models.find((m) => m.provider === GROUP && m.modelId === MODEL),
    "the Project holds the model",
  ).toBeTruthy();
}

/**
 * Open the group's key dialog. The list is filtered rather than scrolled: a user-defined group
 * sits far below the built-in ones, and a search force-opens every group it leaves visible.
 */
async function openGroupKeyDialog(page) {
  await page.goto("/models");
  await page.locator('input[placeholder*="搜索"]').first().fill(NAME);
  const action = page.getByRole("button", { name: `填写密钥 ${GROUP}` });
  await expect(action).toBeVisible();
  await action.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The line the dialog draws above the key field. */
function line(dialog) {
  return dialog.getByRole("alert");
}

/** The notification area's dismissible entries: what a refusal used to be. */
function toasts(page) {
  return page.getByRole("region", { name: "通知" }).getByRole("button");
}

test("a refused key write leaves the dialog, the typed key and the reason standing", async ({
  page,
}) => {
  await projectWithModel(page, "r306test");

  const dialog = await openGroupKeyDialog(page);
  const puts = [];
  await page.route("**/api/projects/*/models", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    puts.push(route.request().postDataJSON());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "RAW ENGLISH MESSAGE" } }),
    });
  });

  await dialog.getByLabel("API key").fill(KEY);
  await dialog.getByRole("button", { name: "确认" }).click();

  // The sentence is in the dialog, above the field it is about — not in a toast.
  await expect(line(dialog)).toHaveText("操作被拒绝：服务器内部错误，请稍后重试。");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("API key")).toHaveValue(KEY);
  await expect(toasts(page)).toHaveCount(0);
  expect(puts).toHaveLength(1);
  // The write was the group's one row carrying the typed key.
  expect(puts[0].models.filter((m) => m.provider === GROUP)).toMatchObject([{ apiKey: KEY }]);

  // And it is still there after the toast that used to carry it would have gone.
  await page.waitForTimeout(7000);
  await expect(line(dialog)).toHaveText("操作被拒绝：服务器内部错误，请稍后重试。");
  await expect(dialog).toBeVisible();
});

test("a written key closes the dialog and says what it configured", async ({ page }) => {
  await projectWithModel(page, "r306retry");

  const dialog = await openGroupKeyDialog(page);
  const puts = [];
  let refuse = true;
  await page.route("**/api/projects/*/models", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    puts.push(route.request().postDataJSON());
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "RAW ENGLISH MESSAGE" } }),
    });
  });

  await dialog.getByLabel("API key").fill(KEY);
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(line(dialog)).toHaveText("操作被拒绝：服务器内部错误，请稍后重试。");
  await expect(dialog.getByLabel("API key")).toHaveValue(KEY);
  await expect(toasts(page)).toHaveCount(0);

  // The button is the retry: a key that lands closes the dialog and reports the count it wrote.
  refuse = false;
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" })).toContainText(
    "已为 1 个模型配置 API key",
  );
  expect(puts).toHaveLength(2);
  expect(puts[1].models.filter((m) => m.provider === GROUP)).toMatchObject([{ apiKey: KEY }]);

  // The key really is on the server now: the group's card says it is configured.
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const models = (
    await (await page.request.get(`${BASE}/api/projects/${projects[0].projectId}/models`)).json()
  ).models;
  expect(
    models.find((m) => m.provider === GROUP && m.modelId === MODEL)?.credential?.apiKeyMasked,
  ).toBeTruthy();
});
