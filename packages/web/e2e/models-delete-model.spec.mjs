/**
 * Regression: "Delete model" dismisses its confirmation (and the config dialog behind it) only
 * after the write landed, and a refused write leaves the card on the page.
 *
 * The confirmation names the model and says the config and API key go with it. It used to close
 * on the way out of the request, success or not, and so did the config dialog — while `persist`
 * keeps the attempted rows for a field edit the user is still holding, i.e. a table *without*
 * this model. So a refused delete took the model off the page while the server still held it,
 * and the card that opens this dialog went with it: nothing was left to retry from, and nothing
 * said the row still existed except the toast. (Measured on the pre-fix build: no dialog, zero
 * matches for the model's name on the page, the row still on the server, and a retry that had
 * nowhere to start.)
 *
 * Both tests work on a hand-added model inside a user-defined group, seeded through the table PUT
 * so nothing here depends on the built-in catalog.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** The group and model both tests delete; unique enough to appear nowhere else. */
const GROUP = "probesolo";
const MODEL = "probe-solo";
const NAME = "Probe Solo";

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
 * Provision the user and make sure their Project holds the model (a second run on the same data
 * root finds it already deleted or already seeded and leaves the table as it is).
 */
async function projectWithModel(page, userId) {
  await provisionAndLogin(page.request, userId, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  const read = async () =>
    (await page.request.get(`${BASE}/api/projects/${projectId}/models`)).json();
  const has = (table) => table.models.some((m) => m.provider === GROUP && m.modelId === MODEL);

  let table = await read();
  if (!has(table)) {
    const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
      data: {
        defaultModel: table.defaultModel,
        models: [...table.models.filter((m) => toEntry(m).provider !== GROUP).map(toEntry), ROW],
      },
    });
    expect(put.ok(), "seed the model through the table PUT").toBeTruthy();
    table = await read();
  }
  expect(has(table), "the Project holds the model").toBeTruthy();
  return { read, has };
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

/** Open the model's config dialog from its card, expanding the group first when it starts folded. */
async function openModelDialog(page) {
  const card = page.getByText(NAME, { exact: true }).first();
  if (!(await card.isVisible().catch(() => false))) {
    await page.getByText(GROUP, { exact: false }).first().click();
  }
  await expect(card).toBeVisible();
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "删除模型" })).toBeVisible();
  return dialog;
}

/** The "Delete model" confirmation stacked on the config dialog. */
function confirmation(page) {
  return page.getByRole("dialog").filter({ hasText: "确定删除" });
}

/**
 * The card's own text with the refusal slot dropped: a refused write adds one line under the
 * sentence ("操作被拒绝：…"), and that line is the only thing the refusal is allowed to change —
 * the sentence, the list it names and the buttons must read exactly as they did before the write.
 */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused model delete keeps its dialog, its sentence and the card the server still backs", async ({
  page,
}) => {
  const { read, has } = await projectWithModel(page, "r92refuse");

  await page.goto("/models");
  await openModelDialog(page);
  await page.getByRole("button", { name: "删除模型" }).click();
  const confirm = confirmation(page);
  await expect(confirm).toBeVisible();
  const sentence = await confirm.innerText();
  expect(sentence).toContain(NAME);

  const puts = [];
  await refuseWrites(page, puts);
  await confirm.getByRole("button", { name: "确认" }).click();

  // The write was refused: the server's words show, and both dialogs are still exactly as they
  // were — the same model, the same sentence, with the refusal drawn under it (a toast used to
  // be the only place they showed, and it dismissed itself out of the card still on screen).
  await expect(confirm.getByText("models store is closed")).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(puts).toHaveLength(1);
  await expect(confirm).toBeVisible();
  expect(await cardText(confirm)).toBe(sentence);
  await expect(page.getByRole("button", { name: "删除模型" })).toBeVisible();

  // The card is back on the page behind the dialog (the dialog's own title also carries the
  // name, so both count): before the fix the refused delete took it away while the server kept
  // the row, leaving nowhere to retry from.
  await expect(page.getByText(NAME, { exact: true })).toHaveCount(2);

  // And the server still holds the untouched row.
  expect(has(await read())).toBeTruthy();

  // Canceling the confirmation decides nothing: the config dialog stays, the row stays.
  await confirm.getByRole("button", { name: "取消" }).click();
  await expect(confirmation(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "删除模型" })).toBeVisible();
  expect(has(await read())).toBeTruthy();
});

test("the retry after a refused model delete writes it, and only a written one closes both dialogs", async ({
  page,
}) => {
  const { read, has } = await projectWithModel(page, "r92retry");

  await page.goto("/models");
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

  await openModelDialog(page);
  await page.getByRole("button", { name: "删除模型" }).click();
  const confirm = confirmation(page);
  await confirm.getByRole("button", { name: "确认" }).click();
  await expect(confirm.getByText("models store is closed")).toBeVisible();
  await expect(confirm).toBeVisible();
  expect(puts).toHaveLength(1);

  // The retry is the same confirmation — no reopening the card, no second 删除模型 click.
  refuse = false;
  await confirm.getByRole("button", { name: "确认" }).click();
  await expect(confirmation(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "删除模型" })).toHaveCount(0);
  expect(puts).toHaveLength(2);
  await expect(page.getByText(NAME, { exact: true })).toHaveCount(0);

  expect(has(await read())).toBeFalsy();
});
