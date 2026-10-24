/**
 * Regression: hiring a subordinate and editing one of an employee's single fields (here its
 * budget) are asked in a confirmation card, and a refused write keeps that question — with the
 * server's words inside it — instead of leaving only a toast behind.
 *
 * Both cards in `features/company/employee-dialogs.tsx` used to close themselves in the `catch`
 * of their own write, so a refusal left the chart file untouched (nothing was written) while the
 * reason fell into a toast that dismissed itself after a few seconds and sat over a card that was
 * already gone. They now close only once their write landed; a refusal leaves the card standing
 * with the reason drawn under its sentence (`ConfirmModal`'s `refusal` slot), so the retry is the
 * button that was pressed and cancelling decides nothing.
 *
 * The organization, its CEO and the employee edited in the second test are made through the API
 * rather than through the dialogs: this spec is about the two confirmations, not about creation.
 * Company mode is off on a fresh server, so each test turns the admin master switch on first
 * (idempotent), and the Project gets the mock as its model so the onboarding overlay stays off.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "hirerefuse";
const MISSION = "把插件市场上线，做到搜索前三。";

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
 * A fresh user with mock-model credentials and an organization whose CEO the server makes on
 * creation. Returns the ids and a reader over the chart as stored.
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

  /**
   * The chart as the server holds it: the employee tree, with each employee's title and budget.
   * Read from the API, not from the page, so "nothing was written" is a fact about the file.
   */
  const chart = async () => {
    const res = await page.request.get(`${orgBase}/${ORG}/chart`);
    expect(res.ok(), "read the chart").toBeTruthy();
    return await res.json();
  };
  return { projectId, orgBase, chart };
}

/** Open the org chart: each employee is a card whose kebab menu holds the personnel actions. */
async function openChart(page, projectId) {
  await page.goto(`/org/${projectId}/${ORG}/chart`);
  await expect(page.getByRole("button", { name: /· 员工操作$/ }).first()).toBeVisible();
}

/**
 * The card's own text with the refusal line dropped: a refused write adds one line under the
 * sentence ("操作被拒绝：…"), and that line is the only thing the refusal may change.
 */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused hire keeps the card, its sentence and the chart", async ({ page }) => {
  const { projectId, chart } = await setUp(page, "r124hire");
  expect((await chart()).employees).toHaveLength(1);

  await openChart(page, projectId);
  // The CEO's card holds the hire row; the dialog comes up over the chart.
  await page
    .getByRole("button", { name: /· 员工操作$/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "招募下属" }).click();
  // The dialog's own name carries whom it is for; the card below is just "招募下属".
  const dialog = page.getByRole("dialog", { name: /^为 .+ 招募下属$/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: /^头衔/ }).fill("文档工程师");
  await dialog.getByRole("button", { name: "招募下属", exact: true }).click();

  const card = page.getByRole("dialog", { name: "招募下属", exact: true });
  await expect(card).toBeVisible();
  const sentence = await card.innerText();
  expect(sentence).toContain("会改写组织图文件");

  const posts = [];
  await page.route(`**/api/projects/${projectId}/organizations/${ORG}/employees`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await card.getByRole("button", { name: "确认", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region (which
  // may still hold the company beta's own notice) never carries the server's words, and the card
  // reads exactly as before plus the one line.
  await expect(card.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(posts).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the chart still holds the CEO alone.
  expect((await chart()).employees).toHaveLength(1);

  // Closing the card decides nothing, and reopening it does not carry the old reason. The hire
  // dialog behind it is still open with what was typed, so the retry is one click away.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "招募下属", exact: true }).click();
  const again = page.getByRole("dialog", { name: "招募下属", exact: true });
  await expect(again).toBeVisible();
  await expect(again.getByText(REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: the card goes, the hire dialog goes with it, and the chart shows the hire.
  await page.unroute(`**/api/projects/${projectId}/organizations/${ORG}/employees`);
  await again.getByRole("button", { name: "确认", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await chart()).employees.length).toBe(2);
  const hired = (await chart()).employees.find((e) => e.title === "文档工程师");
  expect(hired, "the hired employee is on the chart").toBeTruthy();
  await expect(page.getByText("文档工程师").first()).toBeVisible();
});

test("a refused budget edit keeps the card, its sentence and the stored budget", async ({
  page,
}) => {
  const { projectId, orgBase, chart } = await setUp(page, "r124budget");
  const hired = await page.request.post(`${orgBase}/${ORG}/employees`, {
    data: {
      newAgent: { agentId: `${ORG}_dev`, name: "Dana Dev" },
      title: "站点工程师",
      reportsTo: `${ORG}_ceo`,
      budget: 30,
    },
  });
  expect(hired.ok(), "hire the employee").toBeTruthy();
  const budgetOf = async () =>
    (await chart()).employees.find((e) => e.agentId === `${ORG}_dev`)?.budget;
  expect(await budgetOf()).toBe(30);

  await openChart(page, projectId);
  await page.getByRole("button", { name: "Dana Dev · 员工操作" }).click();
  await page.getByRole("menuitem", { name: "设预算" }).click();
  // The edit dialog and its confirmation share the title the dialog computed, so they are told
  // apart by DOM order: both portal to <body>, the dialog first and the card after it.
  const edit = page.getByRole("dialog", { name: "设置 Dana Dev 的预算" }).first();
  await expect(edit).toBeVisible();
  await expect(edit.getByText("当前：", { exact: false })).toBeVisible();
  await edit.getByRole("spinbutton", { name: /^月预算/ }).fill("60");
  await edit.getByRole("button", { name: "保存", exact: true }).click();

  const card = page.getByRole("dialog", { name: "设置 Dana Dev 的预算" }).last();
  await expect(page.getByRole("dialog", { name: "设置 Dana Dev 的预算" })).toHaveCount(2);
  const sentence = await card.innerText();
  expect(sentence).toContain("将 Dana Dev 的月预算改为");

  const patches = [];
  await page.route(
    `**/api/projects/${projectId}/organizations/${ORG}/employees/**`,
    async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      patches.push(route.request().url());
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: REFUSAL }),
      });
    },
  );

  await card.getByRole("button", { name: "保存", exact: true }).click();

  // The card's own news, not a toast (the notification region is where the company beta's own
  // notice lives, so this checks the words rather than the region being empty).
  await expect(card.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(patches).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the chart still holds the old cap.
  expect(await budgetOf()).toBe(30);

  // Closing the card decides nothing, and reopening it does not carry the old reason; the edit
  // dialog behind it still holds what was typed, so the retry is one click away.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("dialog", { name: "设置 Dana Dev 的预算" })).toHaveCount(1);
  await expect(edit).toBeVisible();
  await edit.getByRole("button", { name: "保存", exact: true }).click();
  const again = page.getByRole("dialog", { name: "设置 Dana Dev 的预算" }).last();
  await expect(page.getByRole("dialog", { name: "设置 Dana Dev 的预算" })).toHaveCount(2);
  await expect(again.getByText(REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: the card and the dialog go, and the chart holds the new cap. The box speaks
  // the reader's currency (CNY, 7 to the dollar), so 60 typed is 60/7 USD stored.
  await page.unroute(`**/api/projects/${projectId}/organizations/${ORG}/employees/**`);
  await again.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "设置 Dana Dev 的预算" })).toHaveCount(0);
  await expect.poll(async () => Math.round((await budgetOf()) * 7)).toBe(60);
});
