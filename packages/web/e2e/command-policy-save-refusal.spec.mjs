/**
 * Regression: a refused Save on Project settings → Security policy keeps its reason above the
 * Save button that asked, and says which policy the engine is still running.
 *
 * One Save PUTs the whole `[command_policy]` block — the master switch and every rule — so a
 * refusal leaves the controls on screen showing a state the engine is not running. Before, the
 * reason was a six-second notification repeating the error's own words: the reader who had just
 * switched blocking off believed the next command ran unguarded, and the reader who had just added
 * the 65th rule believed it was enforced.
 *
 * The refusal here is the server's own answer: the route caps the rule list at 64 entries
 * (`MAX_RULES`, `http/routes/command-policy.ts`). Since 7.127 the page declares that ceiling and
 * stops the add entry point at it, so the 65th rule can no longer be typed here — the spec stores
 * the list one short of the ceiling through the API (exactly what such a Project holds) and lets
 * the outgoing PUT carry one more rule, see `saveOnePastCeiling`.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;

/** The shared notification region: a refusal must not also land in it. */
const notices = (page) => page.getByRole("region", { name: "通知" });

/** The route's own ceiling, mirrored here as the situation being tested. */
const MAX_RULES = 64;

async function projectIdOf(page) {
  return (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0].projectId;
}

async function policyOf(page, projectId) {
  return (await page.request.get(`${BASE}/api/projects/${projectId}/command-policy`)).json();
}

/**
 * A rule list at the ceiling: the Project's own defaults, each cloned under a distinct name until
 * there are exactly `MAX_RULES` of them. Counted rather than pinned, so a data root that outlives
 * a rerun and a factory set that grows both stay valid.
 */
function fullList(defaults) {
  const rules = [];
  for (let i = 0; rules.length < MAX_RULES; i += 1) {
    const base = defaults[i % defaults.length];
    const name = i < defaults.length ? base.name : `${base.name}-${i}`;
    rules.push({
      name,
      pattern: `\\b${name.replace(/[^a-zA-Z0-9-]/g, "-")}\\b`,
      enabled: true,
    });
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

/**
 * Lets the page save a legal draft while the route receives one rule past its ceiling.
 *
 * The rejection this spec is about is the route's own, and since 7.127 the form refuses to grow a
 * 64-rule list — which is the point of that guard. So the draft is stored one rule short, the form
 * fills it to 64, and this interceptor appends one rule to the outgoing PUT only: the route gets
 * the shape a Project from a build without the guard would carry, and answers it with its real
 * validation and its real 400. Nothing else about the page or the server is stubbed; call the
 * returned function before a retry that should land.
 */
async function saveOnePastCeiling(page) {
  const pattern = "**/api/projects/*/command-policy";
  await page.route(pattern, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const body = route.request().postDataJSON();
    await route.continue({
      postData: JSON.stringify({
        ...body,
        rules: [...body.rules, { name: "past-the-ceiling", pattern: "\\bpast-the-ceiling\\b" }],
      }),
    });
  });
  return () => page.unroute(pattern);
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

/** The master switch is the first switch on the page — the rule rows have one each, below it. */
const masterSwitch = (dialog) => dialog.getByRole("switch").first();

/** Adds one rule through the form at the top of the list. */
async function addRule(page, dialog, name) {
  await dialog.getByRole("button", { name: "添加规则" }).click();
  // The required mark puts a "*" inside each label, so the name is matched by prefix.
  await page.getByLabel(/^名称/).fill(name);
  await page.getByLabel(/^正则表达式/).fill(`\\b${name}\\b`);
  await dialog.getByRole("button", { name: "确定" }).click();
  await expect(dialog.getByRole("button", { name: "保存" })).toBeEnabled();
}

test("a refused Save that would have switched blocking off says it is still on", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projectId = await projectIdOf(page);
  const factory = await policyOf(page, projectId);
  // Normalized first, so a rerun starts from the switch ON and the list one rule short of the
  // ceiling — the last rule the form can still add (7.127 keeps the entry point inert at 64).
  await storePolicy(page, projectId, {
    enabled: true,
    rules: fullList(factory.defaultRules).slice(0, MAX_RULES - 1),
  });
  const storedBefore = await policyOf(page, projectId);
  expect(storedBefore.rules).toHaveLength(MAX_RULES - 1);

  await page.goto(`${BASE}/chat`);
  const dialog = await openSecurity(page);
  await expect(masterSwitch(dialog)).toHaveAttribute("aria-checked", "true");

  // The draft asks for two things: the rule that fills the list to the ceiling, and blocking off.
  // The rule comes first because the list goes inert the moment the master switch is off.
  await addRule(page, dialog, "past-the-ceiling");
  await masterSwitch(dialog).click();
  await expect(masterSwitch(dialog)).toHaveAttribute("aria-checked", "false");

  const stopIntercepting = await saveOnePastCeiling(page);
  await dialog.getByRole("button", { name: "保存" }).click();

  const refusal = dialog.getByTestId("command-policy-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).toHaveAttribute("role", "alert");
  // The state the engine is in — the switch on screen says the opposite.
  await expect(refusal).toContainText("命令拦截仍处于启用状态");
  // …and the server's own reason.
  await expect(refusal).toContainText(`rules exceeds ${MAX_RULES} entries.`);
  // Nothing was reported through a notification instead.
  await expect(notices(page).getByRole("button")).toHaveCount(0);

  // Nothing was written: still ON, still exactly the rules read before.
  expect(await policyOf(page, projectId)).toEqual(storedBefore);

  // Six seconds is how long a toast lives: the sentence has to outlive it.
  await page.waitForTimeout(7000);
  await expect(refusal).toBeVisible();

  // Back to a list the route accepts, then press the same button: it lands, the sentence goes.
  // The interceptor comes off first, so the retry carries the list the page really holds.
  await stopIntercepting();
  await masterSwitch(dialog).click();
  await expect(masterSwitch(dialog)).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "恢复默认" }).click();
  await expect(dialog.getByRole("button", { name: "保存" })).toBeEnabled();
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(refusal).toHaveCount(0);
  const retried = await policyOf(page, projectId);
  expect(retried.enabled).toBe(true);
  expect(retried.rules).toHaveLength(factory.defaultRules.length);
});

test("a refused rule-list edit does not claim the switch moved", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const projectId = await projectIdOf(page);
  const factory = await policyOf(page, projectId);
  // One rule short of the ceiling, so the form can add the one that fills the list.
  await storePolicy(page, projectId, {
    enabled: true,
    rules: fullList(factory.defaultRules).slice(0, MAX_RULES - 1),
  });
  const storedBefore = await policyOf(page, projectId);

  await page.goto(`${BASE}/chat`);
  const dialog = await openSecurity(page);
  await expect(masterSwitch(dialog)).toHaveAttribute("aria-checked", "true");

  // Only the rule list changes: the switch stays where the Project has it.
  await addRule(page, dialog, "one-too-many");
  const stopIntercepting = await saveOnePastCeiling(page);
  await dialog.getByRole("button", { name: "保存" }).click();

  const refusal = dialog.getByTestId("command-policy-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText("项目里仍是上一次保存的那一份");
  // Neither switch sentence: this attempt never tried to change the switch.
  await expect(refusal).not.toContainText("启用状态");
  await expect(refusal).not.toContainText("停用状态");
  await expect(notices(page).getByRole("button")).toHaveCount(0);
  expect(await policyOf(page, projectId)).toEqual(storedBefore);

  // "Restore defaults" brings the list back under the ceiling; the same button lands it.
  await stopIntercepting();
  await dialog.getByRole("button", { name: "恢复默认" }).click();
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(refusal).toHaveCount(0);
  const retried = await policyOf(page, projectId);
  expect(retried.rules).toHaveLength(factory.defaultRules.length);
});
