/**
 * Regression: an employee leaving the organization is asked in a confirmation card, and a refused
 * leave keeps that question — with the server's words inside it — instead of leaving only a toast
 * behind.
 *
 * The card in `features/company/org-chart-page.tsx` (the card menu's own "离任" row) already
 * stayed open on a refusal, but its reason fell into a toast that dismissed itself after a few
 * seconds and sat over the card rather than in it. It now closes only once its leave landed; a
 * refusal leaves the card standing with the reason drawn under its sentence (`ConfirmModal`'s
 * `refusal` slot), so the retry is the button that was pressed and cancelling decides nothing.
 *
 * The organization, its CEO and the departing employee are made through the API rather than
 * through the dialogs: this spec is about the confirmation, not about hiring. Company mode is off
 * on a fresh server, so the test turns the admin master switch on first (idempotent), and the
 * Project gets the mock as its model so the onboarding overlay stays off the page.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "orgleaverefuse";
const MISSION = "把插件市场上线，做到搜索前三。";
/** The employee the flow lets go; the CEO is the one the server never lets leave. */
const DEV = { agentId: `${ORG}_dev`, name: "Dana Dev" };

/** The refusal the page paints; a 500 with its own words proves those words came back. */
const REFUSAL = { code: "org_chart_locked", message: "the org chart is mid-rewrite" };

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
 * A fresh user with mock-model credentials, an organization whose CEO the server makes on
 * creation, and one subordinate hired straight through the API.
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
  const hired = await page.request.post(`${orgBase}/${ORG}/employees`, {
    data: {
      newAgent: { agentId: DEV.agentId, name: DEV.name },
      title: "站点工程师",
      reportsTo: `${ORG}_ceo`,
    },
  });
  expect(hired.ok(), "hire the employee").toBeTruthy();

  /**
   * The chart as the server holds it: read from the API rather than the page, so "nothing was
   * written" is a fact about the chart file.
   */
  const chart = async () => {
    const res = await page.request.get(`${orgBase}/${ORG}/chart`);
    expect(res.ok(), "read the chart").toBeTruthy();
    return await res.json();
  };
  return { projectId, chart };
}

/** Open the org chart, then the departing employee's own card menu → "离任". */
async function openLeaveCard(page, projectId) {
  await page.goto(`/org/${projectId}/${ORG}/chart`);
  await page.getByRole("button", { name: `${DEV.name} · 员工操作` }).click();
  await page.getByRole("menuitem", { name: "离任" }).click();
  const card = page.getByRole("dialog", { name: "离任", exact: true });
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

test("a refused leave keeps the card, its sentence and the chart", async ({ page }) => {
  const { projectId, chart } = await setUp(page, "r127leave");
  const stillThere = async () => (await chart()).employees.some((e) => e.agentId === DEV.agentId);
  expect(await stillThere()).toBe(true);

  const card = await openLeaveCard(page, projectId);
  const sentence = await cardText(card);
  expect(sentence).toContain(`让 ${DEV.name} 离任`);

  const deletes = [];
  await page.route(
    `**/api/projects/${projectId}/organizations/${ORG}/employees/**`,
    async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      deletes.push(route.request().url());
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: REFUSAL }),
      });
    },
  );

  await card.getByRole("button", { name: "确认", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region (which
  // may still hold the company beta's own notice) never carries the server's words, and the card
  // reads exactly as before plus the one line.
  await expect(card.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(deletes).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the employee is still on the chart.
  expect(await stillThere()).toBe(true);

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  const again = await openLeaveCard(page, projectId);
  await expect(again.getByText(REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: the card goes and the employee is off the chart.
  await page.unroute(`**/api/projects/${projectId}/organizations/${ORG}/employees/**`);
  await again.getByRole("button", { name: "确认", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect.poll(async () => (await chart()).employees.length).toBe(1);
  await expect(page.getByRole("button", { name: `${DEV.name} · 员工操作` })).toHaveCount(0);
});
