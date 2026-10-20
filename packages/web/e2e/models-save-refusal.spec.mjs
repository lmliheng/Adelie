/**
 * Regression: the config dialog's save and "set as default" wait for their write, and a refused
 * one leaves the page on what the server still holds.
 *
 * Both of these used to dismiss the confirmation (and the config dialog behind it) on the click,
 * while `persist` kept the attempted rows and the attempted pointer — so a refused save left the
 * page showing a renamed model the server had not renamed (measured: both dialogs gone, the card
 * carrying the new name, `displayName` on the server unchanged), and a refused "set as default"
 * left a card wearing the 默认 tag while the server still pointed at another model. Nothing was
 * left to retry from: the card that opens the dialog had to be found again, and the sentence
 * naming the change was gone. The retry is now the same confirmation, and only a written change
 * closes both dialogs.
 *
 * Both tests work on a hand-added model inside a user-defined group, seeded through the table PUT
 * so nothing here depends on the built-in catalog.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** The group and model the tests write to; unique enough to appear nowhere else. */
const GROUP = "probesave";
const MODEL = "probe-save";
const NAME = "Probe Save";
const RENAMED = "Probe Save Renamed";

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
 * Provision the user and seed their Project: the model under its seeded name, and the default
 * pointer NOT on it (so "set as default" has something to change). Idempotent: a rerun on the
 * same data root rewrites the row the tests expect and moves a pointer an earlier run left here
 * rather than trusting either.
 */
async function projectWithModel(page, userId) {
  await provisionAndLogin(page.request, userId, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  const read = async () =>
    (await page.request.get(`${BASE}/api/projects/${projectId}/models`)).json();
  const rowOf = async () =>
    (await read()).models.find((m) => m.provider === GROUP && m.modelId === MODEL);

  const table = await read();
  const current = table.models.find((m) => m.provider === GROUP && m.modelId === MODEL);
  const pointerIsOurs = table.defaultModel?.modelId === MODEL;
  if (!current || (current.displayName ?? "") !== NAME || pointerIsOurs) {
    // A pointer already on our model is moved to any other row: the PUT only rewrites the
    // pointer it is given, and omitting it would leave the stale one in place.
    const other = table.models.find((m) => m.modelId !== MODEL);
    const defaultModel =
      pointerIsOurs && other
        ? { provider: other.provider, modelId: other.modelId }
        : table.defaultModel;
    const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
      data: {
        defaultModel,
        models: [...table.models.filter((m) => toEntry(m).provider !== GROUP).map(toEntry), ROW],
      },
    });
    expect(put.ok(), "seed the model through the table PUT").toBeTruthy();
  }
  expect(await rowOf(), "the Project holds the model").toBeTruthy();
  return { read };
}

/** Refuse every table write with a code the app has no local copy for, so the server's words show. */
async function refuseWrites(page, seen) {
  await page.route("**/api/projects/*/models", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    seen.push(route.request().url());
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
 * Open the model's config dialog. The list is filtered rather than scrolled: a user-defined group
 * sits far below the built-in ones, and a search force-opens every group it leaves visible.
 */
async function openModelDialog(page) {
  await page.locator('input[placeholder*="搜索"]').first().fill(NAME);
  const card = page.getByText(NAME, { exact: true }).first();
  await expect(card).toBeVisible();
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "删除模型" })).toBeVisible();
  return dialog;
}

/**
 * The confirmation stacked on the config dialog, told apart by its own sentence ("确定保存对…" /
 * "确定把…设为默认模型"): its title and the dialog's buttons repeat labels the page already uses.
 */
function confirmation(page, sentence) {
  return page.getByRole("dialog").filter({ hasText: sentence });
}

/** The model card the named model is: the card's own button, whose text carries its marks. */
function cardFor(page, name) {
  return page.getByText(name, { exact: true }).first().locator("xpath=ancestor::button[1]");
}

test("a refused save keeps both dialogs and the name the server still holds", async ({ page }) => {
  const { read } = await projectWithModel(page, "r93save");

  await page.goto("/models");
  const dialog = await openModelDialog(page);
  const nameInput = dialog.locator('input[placeholder*="留空则展示模型 ID"]');
  await expect(nameInput).toHaveValue(NAME);
  await nameInput.fill(RENAMED);

  await dialog.getByRole("button", { name: "确认" }).click();
  const confirm = confirmation(page, "确定保存对");
  await expect(confirm).toBeVisible();
  const sentence = await confirm.innerText();
  expect(sentence).toContain(NAME);

  const puts = [];
  await refuseWrites(page, puts);
  await confirm.getByRole("button", { name: "确认" }).click();

  // The write was refused: the server's words show, and both dialogs are still exactly as they
  // were — the same sentence, the draft still in the field.
  await expect(page.getByText("models store is closed")).toBeVisible();
  expect(puts).toHaveLength(1);
  await expect(confirm).toBeVisible();
  expect(await confirm.innerText()).toBe(sentence);
  await expect(nameInput).toHaveValue(RENAMED);
  await expect(page.getByRole("button", { name: "删除模型" })).toBeVisible();

  // And the card behind it is back to the name the server still holds: the page must not claim
  // a rename that did not happen.
  const card = cardFor(page, NAME);
  await expect(card).toContainText(NAME);
  expect(await card.innerText()).not.toContain(RENAMED);
  const table = await read();
  expect(table.models.find((m) => m.provider === GROUP && m.modelId === MODEL).displayName).toBe(
    NAME,
  );

  // Canceling the confirmation decides nothing: the config dialog and its draft stay.
  await confirm.getByRole("button", { name: "取消" }).click();
  await expect(confirmation(page, "确定保存对")).toHaveCount(0);
  await expect(nameInput).toHaveValue(RENAMED);
});

test("the retry of a refused save is the same confirmation, and only a written one closes the dialog", async ({
  page,
}) => {
  const { read } = await projectWithModel(page, "r93saveretry");

  await page.goto("/models");
  const dialog = await openModelDialog(page);
  const nameInput = dialog.locator('input[placeholder*="留空则展示模型 ID"]');
  await nameInput.fill(RENAMED);

  const puts = [];
  let refuse = true;
  await page.route("**/api/projects/*/models", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    puts.push(route.request().url());
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "models_store_closed", message: "models store is closed" },
      }),
    });
  });

  await dialog.getByRole("button", { name: "确认" }).click();
  const confirm = confirmation(page, "确定保存对");
  await confirm.getByRole("button", { name: "确认" }).click();
  await expect(page.getByText("models store is closed")).toBeVisible();
  await expect(confirm).toBeVisible();
  expect(puts).toHaveLength(1);

  // The retry is the same confirmation — no reopening the card, no second 确认 inside the dialog.
  refuse = false;
  await confirm.getByRole("button", { name: "确认" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(puts).toHaveLength(2);
  await expect(cardFor(page, RENAMED)).toContainText(RENAMED);
  const table = await read();
  expect(table.models.find((m) => m.provider === GROUP && m.modelId === MODEL).displayName).toBe(
    RENAMED,
  );
});

test("a refused set-as-default keeps both dialogs and the pointer the server still holds", async ({
  page,
}) => {
  const { read } = await projectWithModel(page, "r93default");

  await page.goto("/models");
  const dialog = await openModelDialog(page);
  const row = async () =>
    (await read()).models.find((m) => m.provider === GROUP && m.modelId === MODEL);
  const before = (await read()).defaultModel;
  expect(before?.modelId).not.toBe(MODEL);

  await dialog.getByRole("button", { name: "设为默认模型" }).click();
  const confirm = confirmation(page, "设为默认模型？");
  await expect(confirm).toBeVisible();

  const puts = [];
  await refuseWrites(page, puts);
  await confirm.getByRole("button", { name: "确认" }).click();

  await expect(page.getByText("models store is closed")).toBeVisible();
  expect(puts).toHaveLength(1);
  // Both dialogs stay up: the confirmation over the config dialog it was started from.
  await expect(page.getByRole("dialog")).toHaveCount(2);
  await expect(confirm).toBeVisible();
  // The card behind them does not wear the 默认 tag the server never granted.
  expect(await cardFor(page, NAME).innerText()).not.toContain("默认");
  expect((await read()).defaultModel).toEqual(before);
  expect((await row()).modelId).toBe(MODEL);

  // Retrying from the same confirmation, once the write is let through, is what grants it.
  await page.unroute("**/api/projects/*/models");
  await page.getByRole("dialog").last().getByRole("button", { name: "确认" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(cardFor(page, NAME)).toContainText("默认");
  expect((await read()).defaultModel).toEqual({ provider: GROUP, modelId: MODEL });
});
