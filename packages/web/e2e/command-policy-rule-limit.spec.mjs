/**
 * Regression: Project settings → Security policy declares the route's 64-rule ceiling on the
 * count row, and stops "Add rule" at it.
 *
 * The route refuses the 65th rule (`rules exceeds 64 entries.`, `MAX_RULES` in
 * `http/routes/command-policy.ts`), but the page used to keep the add entry point live at 64: the
 * rule could be typed, the list saved, and the refusal was the first mention that any ceiling
 * existed — after the work, as a notification that dismissed itself. The ceiling belongs where
 * the form is opened (`src/lib/command-policy-rule-limit.ts`), so the button goes inert and the
 * row that opens it says why.
 *
 * The state is stored through the API — exactly what a Project with a long deny list already
 * holds — because the point of this spec is the page's own behaviour at that state, not the
 * route's validation (which `command-policy-save-refusal.spec.mjs` covers).
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;

/** The route's own ceiling, mirrored here as the situation being tested. */
const MAX_RULES = 64;

async function projectIdOf(page) {
  return (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0].projectId;
}

async function policyOf(page, projectId) {
  return await (await page.request.get(`${BASE}/api/projects/${projectId}/command-policy`)).json();
}

/**
 * A rule list of exactly `count` rules: the Project's own defaults, each cloned under a distinct
 * name past the factory set. Counted rather than pinned, so a data root that outlives a rerun and
 * a factory set that grows both stay valid.
 */
function listOf(defaults, count) {
  const rules = [];
  for (let i = 0; rules.length < count; i += 1) {
    const base = defaults[i % defaults.length];
    const name = i < defaults.length ? base.name : `${base.name}-${i}`;
    rules.push({ name, pattern: `\\b${name.replace(/[^a-zA-Z0-9-]/g, "-")}\\b`, enabled: true });
  }
  return rules;
}

/** Stores a policy directly (the state a Project with a long deny list is already in). */
async function storePolicy(page, projectId, body) {
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/command-policy`, {
    data: body,
  });
  expect(put.ok(), await put.text()).toBeTruthy();
  return put.json();
}

/** Opens Project settings → Security policy through the sidebar, the way a user gets there. */
async function openSecurity(page) {
  // A data root with no model credential yet greets the chat page with its guide, which sits
  // above everything on its own scrim — dismiss it before reaching into the sidebar.
  const guide = page.getByRole("dialog", { name: "尚未配置模型 credential" });
  await guide.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  if (await guide.count()) await guide.getByRole("button", { name: "稍后" }).click();

  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const project = projects.projects[0];
  const sidebar = page.getByRole("complementary");
  await expect(sidebar).toBeVisible({ timeout: 20000 });
  await sidebar.getByRole("button", { name: project.name ?? project.projectId }).click();
  // Same DOM click as the members spec: the row closes its menu as it opens the dialog.
  await page.getByRole("button", { name: "项目设置" }).evaluate((el) => el.click());
  const dialog = page.getByRole("dialog", { name: "项目设置" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "安全策略" }).click();
  // The section arrives with its read: the master switch and the rule count are both there.
  await expect(dialog.getByRole("switch").first()).toBeVisible();
  await expect(dialog.getByText(/^规则 · \d+$/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "保存" })).toBeVisible();
  return dialog;
}

test("at the ceiling the add entry point is inert and the count row says why", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projectId = await projectIdOf(page);
  const factory = await policyOf(page, projectId);
  await storePolicy(page, projectId, {
    enabled: true,
    rules: listOf(factory.defaultRules, MAX_RULES),
  });

  await page.goto(`${BASE}/chat`);
  const dialog = await openSecurity(page);
  await expect(dialog.getByText(new RegExp(`^规则 · ${MAX_RULES}$`))).toBeVisible();

  const hint = dialog.getByTestId("command-policy-rule-limit");
  await expect(hint).toBeVisible();
  await expect(hint).toContainText(String(MAX_RULES));

  const add = dialog.getByRole("button", { name: "添加规则" });
  await expect(add).toBeDisabled();
  // Inert means no form opens, not merely a dimmed button.
  expect(await dialog.getByLabel(/^名称/).count()).toBe(0);

  // Delete one rule: the draft is one short of the ceiling, so the sentence and the entry point
  // come back on the same render.
  await dialog.getByRole("button", { name: "删除" }).last().click();
  await expect(hint).toHaveCount(0);
  await expect(add).toBeEnabled();
  await add.click();
  await expect(dialog.getByLabel(/^名称/)).toBeVisible();
});

test("below the ceiling nothing is said and the form opens", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projectId = await projectIdOf(page);
  const factory = await policyOf(page, projectId);
  await storePolicy(page, projectId, {
    enabled: true,
    rules: listOf(factory.defaultRules, MAX_RULES - 1),
  });

  await page.goto(`${BASE}/chat`);
  const dialog = await openSecurity(page);
  await expect(dialog.getByText(new RegExp(`^规则 · ${MAX_RULES - 1}$`))).toBeVisible();

  // One rule still fits: no sentence, and the form opens when asked.
  await expect(dialog.getByTestId("command-policy-rule-limit")).toHaveCount(0);
  const add = dialog.getByRole("button", { name: "添加规则" });
  await expect(add).toBeEnabled();
  await add.click();
  await expect(dialog.getByLabel(/^名称/)).toBeVisible();
});
