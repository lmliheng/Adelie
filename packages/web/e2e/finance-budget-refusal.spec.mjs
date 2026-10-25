/**
 * Regression: a budget typed in the finance page keeps its own answer — a refused write leaves
 * the reason in the box that asked, instead of only a toast that dismisses itself.
 *
 * `BudgetEditor` (`features/company/finance-page.tsx`) is the budget cell while it is being
 * typed: the number box, save and cancel, with "empty = unbounded" and the USD it will store
 * underneath. Its write used to report a refusal through `toastError` alone, so a few seconds
 * after the attempt the row stood there with the typed amount, no explanation and a live save
 * button — the retry was a guess. The reason now sits on one line under the box, right where the
 * retry is, and text the box cannot read says its piece on that same line rather than in a
 * toast. Cancelling lands back on the row as it was; reopening starts without the old reason.
 *
 * The organization is made through the API (this spec is about the box's answer, not about
 * setting the company up): a fresh organization already has its CEO, whose budget is the row
 * this test edits. Company mode is off on a fresh server, so each test turns the admin master
 * switch on first (idempotent), and the Project gets the mock as its model — nothing here needs
 * the model, but a fresh Project without one would hold the onboarding overlay over the page.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "budgetrefuse";
/** Typed in the reader's currency (CNY by default) and stored in USD at the App's fixed rate. */
const TYPED = "42";
const STORED_USD = 6;

/** The refusal the box paints; a 500 with its own words proves those words came back. */
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

/** A fresh user with mock-model credentials, an organization, and its CEO read off the chart. */
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
  const created = await page.request.post(orgBase, {
    data: { orgId: ORG, mission: "Keep the plugin marketplace found from the blog." },
  });
  expect(created.ok(), "create organization").toBeTruthy();

  /** The chart as the server holds it: the CEO row's name and stored budget (USD). */
  const ceo = async () => {
    const chart = await (await page.request.get(`${orgBase}/${ORG}/chart`)).json();
    const row = chart.employees.find((e) => e.agentId === chart.ceoAgentId);
    return { agentId: chart.ceoAgentId, name: row.name, budget: row.budget ?? null };
  };
  const { agentId, name, budget } = await ceo();
  return { projectId, agentId, name, budget, ceo };
}

/** The finance page, and the row's own edit button (the one carrying the employee's name). */
async function openFinance(page, projectId, name) {
  await page.goto(`/org/${projectId}/${ORG}/finance`);
  await expect(page.getByRole("button", { name: `编辑 ${name} 的预算` })).toBeVisible();
}

test("a refused budget keeps the box, the typed amount and the reason", async ({ page }) => {
  test.setTimeout(120_000);
  const { projectId, agentId, name, budget, ceo } = await setUp(page, "r133budget");
  await openFinance(page, projectId, name);

  // What the box starts with: the stored budget in the reader's currency.
  const editorLabel = `编辑 ${name} 的预算`;
  const openEditor = async () => {
    await page.getByRole("button", { name: editorLabel }).click();
    const box = page.getByRole("spinbutton", { name: editorLabel });
    await expect(box).toBeVisible();
    return box;
  };
  const box = await openEditor();
  const prefilled = await box.inputValue();
  await box.fill(TYPED);

  // One refusal with the server's own words, counted so the test knows the page wrote once.
  const writes = [];
  const pattern = `**/organizations/${ORG}/employees/${encodeURIComponent(agentId)}`;
  await page.route(pattern, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    writes.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await page.getByRole("button", { name: "保存预算" }).click();

  // The reason is under the box that asked, and it is not a toast: the notification region
  // never carries the server's words.
  await expect(page.getByRole("alert").filter({ hasText: REFUSAL.message })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(writes).toHaveLength(1);

  // Nothing was written, and the box still holds what was typed.
  expect((await ceo()).budget).toBe(budget);
  await expect(page.getByRole("spinbutton", { name: editorLabel })).toHaveValue(TYPED);

  // Cancelling decides nothing; reopening starts from the stored budget, without the old reason.
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("spinbutton", { name: editorLabel })).toHaveCount(0);
  const again = await openEditor();
  await expect(again).toHaveValue(prefilled);
  await expect(page.getByRole("alert").filter({ hasText: REFUSAL.message })).toHaveCount(0);

  // The retry lands: the editor closes and the chart holds the amount that was typed.
  await page.unroute(pattern);
  await again.fill(TYPED);
  await page.getByRole("button", { name: "保存预算" }).click();
  await expect(page.getByRole("spinbutton", { name: editorLabel })).toHaveCount(0);
  await expect.poll(async () => (await ceo()).budget).toBe(STORED_USD);
});

test("a budget the box cannot read says so under the box, and writes nothing", async ({ page }) => {
  test.setTimeout(120_000);
  const { projectId, name, budget, ceo } = await setUp(page, "r133hint");
  await openFinance(page, projectId, name);

  const editorLabel = `编辑 ${name} 的预算`;
  await page.getByRole("button", { name: editorLabel }).click();
  const box = page.getByRole("spinbutton", { name: editorLabel });
  await expect(box).toBeVisible();
  await box.fill("-5");

  // Counted so the test can say the refusal never reached the server at all.
  const writes = [];
  await page.route(`**/organizations/${ORG}/employees/**`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    writes.push(route.request().url());
    await route.fallback();
  });

  await page.getByRole("button", { name: "保存预算" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "每月上限" })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText("每月上限");
  expect(writes).toHaveLength(0);
  expect((await ceo()).budget).toBe(budget);

  // A readable amount goes through from the same box, and the line goes with the save — once:
  // disabling the box for the write blurs it, and a blur is also a save.
  await box.fill(TYPED);
  await page.getByRole("button", { name: "保存预算" }).click();
  await expect(page.getByRole("spinbutton", { name: editorLabel })).toHaveCount(0);
  await expect.poll(async () => (await ceo()).budget).toBe(STORED_USD);
  expect(writes).toHaveLength(1);
});
