/**
 * Regression: deleting an organization is asked in a confirmation card, and a refused write keeps
 * that question — with the server's words inside it — instead of leaving only a toast behind.
 *
 * The card in `features/company/org-dialogs.tsx` (the settings dialog's delete row) used to stay
 * open while its reason fell into a toast that dismissed itself after a few seconds and sat over
 * the card rather than in it. It now closes only once its write landed; a refusal leaves the card
 * standing with the reason drawn under its sentence (`ConfirmModal`'s `refusal` slot), so the retry
 * is the button that was pressed and cancelling decides nothing.
 *
 * The organization and its CEO are made through the API rather than through the dialog: this spec
 * is about the confirmation, not about creation. Company mode is off on a fresh server, so the
 * test turns the admin master switch on first (idempotent), and the Project gets the mock as its
 * model so the onboarding overlay stays off the page.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "orgdelrefuse";
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
 * creation. Returns the ids and a reader over the organization listing as stored.
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

  /** The organization ids the server lists — read from the API, so "nothing was written" is a fact. */
  const listed = async () => {
    const res = await page.request.get(orgBase);
    expect(res.ok(), "list the organizations").toBeTruthy();
    return (await res.json()).organizations.map((o) => o.orgId);
  };
  return { projectId, orgBase, listed };
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

/** The delete row's button → the confirmation card (a second dialog, stacked above settings). */
async function openDeleteCard(settings) {
  await settings.getByRole("button", { name: "删除", exact: true }).click();
  const card = settings.page().getByRole("dialog", { name: "删除组织" });
  await expect(card).toBeVisible();
  return card;
}

/**
 * The card's own text with the refusal line dropped: a refused write adds one line under the
 * sentence ("操作被拒绝：…"), and that line is the only thing the refusal may change.
 */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused organization deletion keeps the card, its sentence and the organization", async ({
  page,
}) => {
  const { projectId, orgBase, listed } = await setUp(page, "r125orgdel");
  expect(await listed()).toContain(ORG);

  const settings = await openSettings(page, projectId);
  const card = await openDeleteCard(settings);
  const sentence = await cardText(card);
  expect(sentence).toContain("组织会从公司模式里消失");

  const deletes = [];
  await page.route(`**/api/projects/${projectId}/organizations/${ORG}`, async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletes.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  // The confirm button only unlocks on the typed id: the card's own word for "I mean it".
  await card.getByRole("textbox").fill(ORG);
  await card.getByRole("button", { name: "确认", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region (which
  // may still hold the company beta's own notice) never carries the server's words, and the card
  // reads exactly as before plus the one line.
  await expect(card.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(deletes).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the organization is still on the server, settings still open behind it.
  expect(await listed()).toContain(ORG);
  await expect(settings).toBeVisible();
  const stillThere = await page.request.get(`${orgBase}/${ORG}`);
  expect(stillThere.ok(), "the organization still reads").toBeTruthy();

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  await expect(settings).toBeVisible();
  const again = await openDeleteCard(settings);
  await expect(again.getByText(REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: the card and the settings dialog both go, and the organization is gone.
  await page.unroute(`**/api/projects/${projectId}/organizations/${ORG}`);
  await again.getByRole("textbox").fill(ORG);
  await again.getByRole("button", { name: "确认", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect(settings).toHaveCount(0);
  await expect.poll(listed).not.toContain(ORG);
  const gone = await page.request.get(`${orgBase}/${ORG}`);
  expect(gone.status(), "the organization is gone").toBe(404);
});
