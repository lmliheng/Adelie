/**
 * Regression: a settings write the server refuses keeps its words in the settings dialog, on the
 * row of the button that sent it.
 *
 * The organization settings dialog (`features/company/org-dialogs.tsx`) already stays open on a
 * refused write — Save only closes it once the PATCH landed, and the pause / resume button is its
 * own PATCH — but the reason fell into a toast: six seconds later nothing on the page said the
 * write had been refused, while the draft still read as if it had gone out. Now `patch()` keeps
 * the server's words in `saveRefusal`, drawn on the dialog footer beside Cancel / Save (the body
 * scrolls, so a line under the last field can land below the fold).
 *
 * The organization is made through the API rather than through the dialog: this spec is about the
 * refusal, not about creation. Company mode is off on a fresh server, so the test turns the admin
 * master switch on first (idempotent), and the Project gets the mock as its model so the onboarding
 * overlay stays off the page.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "orgsetrefuse";
const MISSION = "把插件市场上线，做到搜索前三。";

/** The refusal the page paints; a 500 with its own words proves those words came back. */
const REFUSAL = { code: "org_store_locked", message: "the organization store is mid-rewrite" };

/** The admin master switch, off by default: turned on server-wide before the flow starts. */
async function enableCompanyMode() {
  const adminCtx = await request.newContext();
  try {
    await login(adminCtx, ADMIN_ID, ADMIN_PASSWORD);
    const res = await adminCtx.put(`${BASE}/api/admin/settings`, { data: { companyMode: true } });
    if (!res.ok()) {
      throw new Error(`enable company mode failed: ${res.status()} ${await res.text()}`);
    }
  } finally {
    await adminCtx.dispose();
  }
}

/**
 * A fresh user with mock-model credentials and an organization whose CEO the server makes on
 * creation. Returns the ids and readers over the organization as the server stores it, so
 * "nothing was written" is a fact rather than a reading of the screen.
 */
async function setUp(page, tag) {
  await enableCompanyMode();
  const user = `${tag}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  await provisionAndLogin(page.request, user, P);
  const project = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0];
  const projectId = project.projectId;
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
  expect(put.ok(), `put models ${projectId}`).toBeTruthy();

  const orgBase = `${BASE}/api/projects/${projectId}/organizations`;
  const created = await page.request.post(orgBase, { data: { orgId: ORG, mission: MISSION } });
  expect(created.ok(), "create organization").toBeTruthy();

  /** The name and status the server holds — what a refused write must leave untouched. */
  const stored = async () => {
    const res = await page.request.get(`${orgBase}/${ORG}`);
    expect(res.ok(), "read the organization").toBeTruthy();
    const detail = await res.json();
    return { name: detail.settings.name, status: detail.settings.status };
  };
  return { projectId, orgBase, stored };
}

/**
 * The settings dialog, opened from the switcher's own row: the shell names the open organization
 * on that trigger (`<project> / <org> · <status>`), and the gear row behind it is a plain button —
 * the switcher's panel holds no `Menu` list, so its rows carry no menu role.
 */
async function openSettings(page, projectId) {
  await page.goto(`/org/${projectId}/${ORG}/overview`);
  const trigger = page.getByRole("button", { name: new RegExp(`/ ${ORG} ·`) });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await page.getByRole("button", { name: "组织设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "组织设置" });
  await expect(settings).toBeVisible();
  return settings;
}

test("a refused settings save keeps the dialog and the reason beside Save", async ({ page }) => {
  const { projectId, orgBase, stored } = await setUp(page, "r284orgsave");
  const before = await stored();

  const settings = await openSettings(page, projectId);
  const name = settings.getByLabel("显示名");
  await expect(name).toHaveValue(before.name);

  const patches = [];
  await page.route(`${orgBase}/${ORG}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patches.push(route.request().postDataJSON());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await name.fill("Refused rename");
  await settings.getByRole("button", { name: "保存", exact: true }).click();

  // The reason is on the dialog's footer row, not in the notification region, and the dialog is
  // still there with the draft the reader typed.
  const reason = settings.getByTestId("org-settings-refusal");
  await expect(reason).toBeVisible();
  await expect(reason).toContainText(REFUSAL.message);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(patches).toHaveLength(1);
  expect(patches[0]).toMatchObject({ name: "Refused rename" });
  await expect(settings).toBeVisible();
  await expect(name).toHaveValue("Refused rename");

  // Nothing landed: the server still holds the old name.
  expect(await stored()).toEqual(before);

  // A toast would be gone by now; the sentence stays because it lives in the box.
  await page.waitForTimeout(7000);
  await expect(reason).toBeVisible();

  // Closing decides nothing, and reopening does not carry the last attempt's reason.
  await settings.getByRole("button", { name: "取消", exact: true }).click();
  await expect(settings).toHaveCount(0);
  const again = await openSettings(page, projectId);
  await expect(again.getByTestId("org-settings-refusal")).toHaveCount(0);
  await expect(again.getByLabel("显示名")).toHaveValue(before.name);

  // The retry lands: the dialog closes and the server holds the new name.
  await page.unroute(`${orgBase}/${ORG}`);
  await again.getByLabel("显示名").fill("Accepted rename");
  await again.getByRole("button", { name: "保存", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect.poll(stored).toEqual({ ...before, name: "Accepted rename" });
});

test("a refused pause keeps the dialog and the reason beside the button", async ({ page }) => {
  const { projectId, orgBase, stored } = await setUp(page, "r284orgpause");
  const before = await stored();
  expect(before.status).toBe("active");

  const settings = await openSettings(page, projectId);

  const patches = [];
  await page.route(`${orgBase}/${ORG}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patches.push(route.request().postDataJSON());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  // Pause is its own PATCH, sent on the click — there is no draft to keep, only the reason.
  await settings.getByRole("button", { name: "暂停组织", exact: true }).click();
  const reason = settings.getByTestId("org-settings-refusal");
  await expect(reason).toContainText(REFUSAL.message);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(patches).toEqual([{ status: "paused" }]);
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("button", { name: "暂停组织", exact: true })).toBeVisible();
  expect(await stored()).toEqual(before);

  // The retry is the same button, and this time the shell follows the new status.
  await page.unroute(`${orgBase}/${ORG}`);
  await settings.getByRole("button", { name: "暂停组织", exact: true }).click();
  await expect(settings.getByRole("button", { name: "恢复组织", exact: true })).toBeVisible();
  await expect(settings.getByTestId("org-settings-refusal")).toHaveCount(0);
  await expect.poll(stored).toEqual({ ...before, status: "paused" });
});
