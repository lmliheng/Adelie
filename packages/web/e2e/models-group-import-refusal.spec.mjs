/**
 * Regression: the add-group dialog's bulk import keeps a refused save's reason in the dialog, with
 * the fields the retry sends — not in a six-second notification over it.
 *
 * The import is one whole-table PUT (every model the endpoint listed, appended), so a refusal
 * writes nothing: the dialog stays open (it closes only on a written save) and the page behind it
 * still has no such group. That reason used to be raised as a toast alone, which sits over the
 * dialog and dismisses itself — leaving a dialog that looked exactly as it had before the press
 * and a page that had not changed, with nothing saying why.
 *
 * The endpoint is stubbed on both routes the flow uses (`models/list` for the listing, `models` for
 * the table write), so nothing here depends on a real provider or on the built-in catalog.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** The group the tests create; unique enough to appear nowhere else. */
const GROUP = "probeimport";

/** What the stubbed endpoint lists: two ids no catalog knows, so the import is the only source. */
const LISTED = ["probe-import-a", "probe-import-b"];

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
 * Provision the user and seed their Project without the group under test: a rerun on the same data
 * root drops the group an earlier run left, so its name is free for the dialog.
 */
async function projectWithoutGroup(page, userId) {
  await provisionAndLogin(page.request, userId, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  const read = async () =>
    (await page.request.get(`${BASE}/api/projects/${projectId}/models`)).json();

  const table = await read();
  if (table.models.some((m) => m.provider === GROUP)) {
    const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
      data: {
        defaultModel: table.defaultModel,
        models: table.models.filter((m) => m.provider !== GROUP).map(toEntry),
      },
    });
    expect(put.ok(), "drop the group an earlier run left").toBeTruthy();
  }
  expect((await read()).models.some((m) => m.provider === GROUP)).toBe(false);
  return { projectId, read };
}

/** Supply the endpoint's listing: the one request the import runs before it saves. */
async function listModels(page, seen) {
  await page.route("**/api/projects/*/models/list", async (route) => {
    seen.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, models: LISTED }),
    });
  });
}

/** Refuse the table write with a code the interface has no local copy for, so the server's words show. */
async function refuseWrites(page, puts, refused) {
  await page.route("**/api/projects/*/models", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    puts.push(route.request().url());
    if (!refused()) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "models_store_closed", message: "models store is closed" },
      }),
    });
  });
}

/**
 * Open the add-group dialog on its import side, with everything the import button needs already
 * filled in: the protocol is hand-picked from the in-field menu (nothing depends on a detect run),
 * so the press is the save itself.
 */
async function openImportDialog(page) {
  await page.goto("/models");
  await page
    .getByRole("button", { name: /新增分组/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "导入模型" }).click();
  await dialog.locator('input[placeholder*="小写字母"]').fill(GROUP);
  await dialog.locator('input[placeholder*="该端点的 API key"]').fill("sk-probe");
  await dialog.locator('input[aria-label="自定义 base URL"]').fill("http://127.0.0.1:9/v1");
  await dialog.getByRole("button", { name: /选择协议/ }).click();
  await page.getByRole("menuitemradio", { name: /OpenAI Chat Completions/ }).click();
  await expect(dialog.getByRole("button", { name: "批量导入模型" })).toBeVisible();
  return dialog;
}

/** The line the dialog draws for a refused save — the whole sentence, in the server's words. */
function refusalLine(dialog) {
  return dialog.getByText(/models store is closed/);
}

test("a refused import leaves the reason in the dialog, over a table that did not move", async ({
  page,
}) => {
  const { read } = await projectWithoutGroup(page, "r210import");
  const before = await read();
  const listed = [];
  await listModels(page, listed);

  const dialog = await openImportDialog(page);
  const puts = [];
  await refuseWrites(page, puts, () => true);
  await dialog.getByRole("button", { name: "批量导入模型" }).click();

  // The reason is in the dialog, whole, and says what the reader has to know before retrying:
  // which group was not created, and that nothing from the listing went in.
  const line = refusalLine(dialog);
  await expect(line).toBeVisible();
  expect(await line.innerText()).toBe(
    `分组「${GROUP}」没有建成，导入的模型一个都没写进表：models store is closed`,
  );
  // Not in a notification, which would sit over the dialog and dismiss itself.
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);

  // The listing ran once and the save was attempted once; the dialog and its fields are intact,
  // so the same button is the retry.
  expect(listed).toHaveLength(1);
  expect(puts).toHaveLength(1);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[placeholder*="小写字母"]')).toHaveValue(GROUP);
  await expect(dialog.locator('input[aria-label="自定义 base URL"]')).toHaveValue(
    "http://127.0.0.1:9/v1",
  );

  // Seven seconds later it is still there: the sentence outlives any toast.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();

  // And the server holds exactly what it held before: no group, no half-imported rows.
  const after = await read();
  expect(after.models.some((m) => m.provider === GROUP)).toBe(false);
  expect(after.models).toHaveLength(before.models.length);
});

test("the retry is the same button, and switching modes retires the sentence", async ({ page }) => {
  const { read } = await projectWithoutGroup(page, "r210importretry");
  const listed = [];
  await listModels(page, listed);

  const dialog = await openImportDialog(page);
  const puts = [];
  let refuse = true;
  await refuseWrites(page, puts, () => refuse);

  await dialog.getByRole("button", { name: "批量导入模型" }).click();
  const line = refusalLine(dialog);
  await expect(line).toBeVisible();
  expect(puts).toHaveLength(1);

  // The mode switch leaves the flow the sentence described, so it goes with it — and does not come
  // back when the reader returns to the import side.
  await dialog.getByRole("button", { name: "仅新增分组" }).click();
  await expect(refusalLine(dialog)).toHaveCount(0);
  await dialog.getByRole("button", { name: "导入模型" }).click();
  await expect(refusalLine(dialog)).toHaveCount(0);

  // Letting the write through: the retry is the same button, and it closes the dialog.
  refuse = false;
  await dialog.getByRole("button", { name: "批量导入模型" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(puts).toHaveLength(2);

  const table = await read();
  expect(
    table.models
      .filter((m) => m.provider === GROUP)
      .map((m) => m.modelId)
      .sort(),
  ).toEqual(LISTED);
  await expect(page.getByText("probe-import-a", { exact: true }).first()).toBeVisible();
});
