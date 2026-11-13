/**
 * Regression: a refused Save on Project settings → New chat defaults keeps its reason under the
 * controls that asked, and says which of the Save's two writes the Project took.
 *
 * One Save is up to two writes — the `[default_chat]` block (agent / workspace / approval /
 * thinking) and then the Project's default model. Before, a refusal was a six-second
 * notification carrying the error's own words and nothing else, so a Save whose block HAD been
 * stored (and whose model half was then refused) looked exactly like one that never got
 * anywhere: the reader had to guess which half of the form the Project now holds.
 *
 * Both refusals here are the server's own: the narrow default-model route answers 400
 * `bad_request` ("defaultModel must be included in models: …") when the pair is no longer in the
 * Project's table. That is what another tab's models page does between the dialog loading its
 * snapshot and the Save — so the spec makes that same edit through the API, exactly as the
 * members spec has somebody else revoke a membership.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;

/** The shared notification region: a refusal must not also land in it. */
const notices = (page) => page.getByRole("region", { name: "通知" });

const refOf = (m) => (m ? `${m.provider}/${m.modelId}` : null);

/** The trigger labels of the thinking-level select, by wire value. */
const THINKING_LABEL = {
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "极高",
  max: "最高",
};

async function projectIdOf(page) {
  return (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0].projectId;
}

async function modelsOf(page, projectId) {
  return (await page.request.get(`${BASE}/api/projects/${projectId}/models`)).json();
}

async function chatDefaultsOf(page, projectId) {
  return (await page.request.get(`${BASE}/api/projects/${projectId}/chat-defaults`)).json();
}

/**
 * The row's tooltip — the picker's own way of telling two rows apart, and the only handle a
 * spec has on one: it carries the upstream id, since a display name repeats across gateways
 * (the same `deepseek-v4-pro-0813` is offered by the vendor group and by a gateway under the
 * same name).
 */
const tooltipOf = (m) =>
  (m.displayName ? m.displayName : m.modelId) === m.modelId
    ? m.modelId
    : `${m.displayName} · ${m.modelId}`;

/**
 * Two models the picker offers that are NOT the current default, both from the default's own
 * provider group where possible — the dialog's picker opens on that group, so a same-group row
 * is the one a reader reaches without touching the rail. Counted rather than pinned: this data
 * root outlives a rerun and the preset list can grow. Only rows whose tooltip is unique across
 * the whole table qualify: a duplicate would make "click that row" ambiguous.
 */
function targetsOf(models) {
  const dflt = models.defaultModel;
  const isDefault = (m) => m.provider === dflt.provider && m.modelId === dflt.modelId;
  const seenOnce = (m) => models.models.filter((x) => tooltipOf(x) === tooltipOf(m)).length === 1;
  const usable = models.models.filter((m) => seenOnce(m) && !isDefault(m));
  const sameGroup = usable.filter((m) => m.provider === dflt.provider);
  const [a, b] = [...sameGroup, ...usable];
  expect(a, "the picker must offer a model that is not the default").toBeTruthy();
  expect(b, "and a second one, for the second case").toBeTruthy();
  return [a, b];
}

/** Opens Project settings → New chat defaults through the sidebar, the way a user gets there. */
async function openDefaults(page) {
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const project = projects.projects[0];
  const sidebar = page.getByRole("complementary");
  await expect(sidebar).toBeVisible({ timeout: 20000 });
  await sidebar.getByRole("button", { name: project.name ?? project.projectId }).click();
  // Same DOM click as the members spec: the row closes its menu as it opens the dialog.
  await page.getByRole("button", { name: "项目设置" }).evaluate((el) => el.click());
  const dialog = page.getByRole("dialog", { name: "项目设置" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "默认值" }).click();
  // The section arrives with both its reads (the block and the models).
  await expect(dialog.getByRole("button", { name: "选择模型" })).toBeVisible();
  return dialog;
}

/** Picks `target` through the section's own model picker (search, then the row). */
async function pickModel(page, dialog, target) {
  const label = target.displayName ? target.displayName : target.modelId;
  await dialog.getByRole("button", { name: "选择模型" }).click();
  await page.getByPlaceholder(/搜索模型/).fill(target.modelId);
  const row = page.getByRole("listbox").locator(`button[data-tooltip="${tooltipOf(target)}"]`);
  await expect(row).toHaveCount(1);
  await row.click();
  // The pick is what makes the section dirty: the Save button proves the form took it.
  await expect(dialog.getByRole("button", { name: "保存" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "选择模型" })).toHaveText(label);
}

/** Sets the thinking level to `level` through that select (its accessible name is the label). */
async function setThinking(page, dialog, level) {
  await dialog.getByRole("button", { name: "思考等级" }).click();
  await page.getByRole("option", { name: THINKING_LABEL[level], exact: true }).click();
  await expect(dialog.getByRole("button", { name: "思考等级" })).toHaveText(THINKING_LABEL[level]);
  await expect(dialog.getByRole("button", { name: "保存" })).toBeEnabled();
}

/** The whole-table PUT's entry list: what this route takes, against the models it already holds. */
function tableOf(models, extra) {
  const rows = models.models.map((m) => ({ provider: m.provider, modelId: m.modelId }));
  return [...rows, ...(extra ? [{ provider: extra.provider, modelId: extra.modelId }] : [])];
}

/** Another tab's models page drops `target` from the Project: the narrow default route then refuses it. */
async function dropModel(page, projectId, target) {
  const models = await modelsOf(page, projectId);
  const rows = tableOf(models).filter(
    (r) => !(r.provider === target.provider && r.modelId === target.modelId),
  );
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: { models: rows },
  });
  expect(put.ok()).toBeTruthy();
  const after = await modelsOf(page, projectId);
  expect(after.models.some((m) => refOf(m) === refOf(target))).toBe(false);
}

/** Puts it back, so the same Save button can be the retry. */
async function restoreModel(page, projectId, target) {
  const models = await modelsOf(page, projectId);
  if (models.models.some((m) => refOf(m) === refOf(target))) return;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: { models: tableOf(models, target) },
  });
  expect(put.ok()).toBeTruthy();
}

test("a Save refused at its model half says the defaults were saved, and the same button retries", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projectId = await projectIdOf(page);
  const [target] = targetsOf(await modelsOf(page, projectId));
  const storedBefore = await chatDefaultsOf(page, projectId);
  const modelsBefore = await modelsOf(page, projectId);

  await page.goto(`${BASE}/chat`);
  const dialog = await openDefaults(page);

  // Both halves of the Save are dirty: the block (thinking level) and the default model.
  const level = storedBefore.thinkingLevel === "high" ? "xhigh" : "high";
  await setThinking(page, dialog, level);
  await pickModel(page, dialog, target);

  // Another tab removes that model meanwhile — the dialog's snapshot still offers it, and the
  // pick the form holds is what the Save will send.
  await dropModel(page, projectId, target);
  await expect(dialog.getByRole("button", { name: "选择模型" })).toHaveText(
    target.displayName ? target.displayName : target.modelId,
  );
  await expect(dialog.getByRole("button", { name: "保存" })).toBeEnabled();

  await dialog.getByRole("button", { name: "保存" }).click();

  const refusal = dialog.getByTestId("chat-defaults-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).toHaveAttribute("role", "alert");
  // The sentence names the half the Project took, then the server's own reason.
  await expect(refusal).toContainText("新对话默认值已保存，但默认模型没能改");
  await expect(refusal).toContainText(
    `defaultModel must be included in models: (provider=${target.provider}, model_id=${target.modelId})`,
  );
  // Nothing was reported through a notification instead.
  await expect(notices(page).getByRole("button")).toHaveCount(0);

  // The block really is stored, and the default model really is the old one.
  const storedAfter = await chatDefaultsOf(page, projectId);
  expect(storedAfter.thinkingLevel).toBe(level);
  const modelsAfter = await modelsOf(page, projectId);
  expect(refOf(modelsAfter.defaultModel)).toBe(refOf(modelsBefore.defaultModel));

  // Six seconds is how long a toast lives: the sentence has to outlive it.
  await page.waitForTimeout(7000);
  await expect(refusal).toBeVisible();

  // Put the row back and press the same button: the model half lands, the sentence goes away.
  await restoreModel(page, projectId, target);
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(refusal).toHaveCount(0);
  const retried = await modelsOf(page, projectId);
  expect(refOf(retried.defaultModel)).toBe(refOf(target));
});

test("a Save whose block was not touched does not claim the defaults were saved", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projectId = await projectIdOf(page);
  const [, target] = targetsOf(await modelsOf(page, projectId));
  const storedBefore = await chatDefaultsOf(page, projectId);

  await page.goto(`${BASE}/chat`);
  const dialog = await openDefaults(page);
  await pickModel(page, dialog, target);
  await dropModel(page, projectId, target);
  await dialog.getByRole("button", { name: "保存" }).click();

  const refusal = dialog.getByTestId("chat-defaults-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText("没能改默认模型，项目里仍是原来的模型");
  // The block was never part of this attempt, so nothing may say it was saved.
  await expect(refusal).not.toContainText("已保存");
  await expect(notices(page).getByRole("button")).toHaveCount(0);
  // And nothing was written: the stored block is byte-for-byte the read from before.
  expect(await chatDefaultsOf(page, projectId)).toEqual(storedBefore);

  // The same button retries it once the row is back.
  await restoreModel(page, projectId, target);
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(refusal).toHaveCount(0);
  const retried = await modelsOf(page, projectId);
  expect(refOf(retried.defaultModel)).toBe(refOf(target));
});
