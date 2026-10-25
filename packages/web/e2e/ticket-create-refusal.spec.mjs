/**
 * Regression: creating a ticket is asked in a form, and a refused create keeps that form — with
 * the server's words above its fields and everything typed still in them — instead of leaving
 * only a toast behind.
 *
 * `CreateTicketDialog` (`features/company/tickets-page.tsx`) is the ticket box's own form: a
 * title, a slug, a goal, an acceptance note, an owner, a parent, the people to notify, a
 * priority and a due date. Its write used to report a refusal through `toastError` alone, so a
 * few seconds after the attempt the reason was gone while the panel still showed the same
 * untitled board and the button was live again with nothing saying why. The reason now sits at
 * the top of the form (`NoticeStrip`, graded with `S.common.refused`), the fields keep what was
 * typed, and the dialog only closes once its write landed — a write in flight also ignores
 * `onClose`, so the form cannot be dismissed from under its own answer. Reopening it does not
 * carry the old reason.
 *
 * The organization is made through the API (this spec is about the form's answer, not about
 * setting the board up); company mode is off on a fresh server, so each test turns the admin
 * master switch on first (idempotent), and the Project gets the mock as its model — nothing here
 * needs the model, but a fresh Project without one would hold the onboarding overlay over the
 * board.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "ticketcreate";
const TITLE = "把插件市场搬上博客";
const GOAL = "博客那边也要能搜到插件，第一条链接指向市场首页。";

/** The refusal the form paints; a 500 with its own words proves those words came back. */
const REFUSAL = { code: "ticket_files_locked", message: "the ticket files are mid-rewrite" };

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

/** A fresh user with mock-model credentials and an organization with no tickets yet. */
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
    data: { orgId: ORG, mission: "Let the plugin marketplace be found from the blog too." },
  });
  expect(created.ok(), "create organization").toBeTruthy();

  const ticketsUrl = `${orgBase}/${ORG}/tickets`;
  /** The board as the server holds it: how many tickets the organization has, any column. */
  const count = async () => {
    const board = await (await page.request.get(ticketsUrl)).json();
    return Object.values(board.columns).reduce((n, column) => n + column.length, 0);
  };
  return { projectId, ticketsUrl, count };
}

/** The empty board, and the button that raises the create form. */
async function openBoard(page, projectId) {
  await page.goto(`/org/${projectId}/${ORG}/tickets`);
  await expect(page.getByRole("button", { name: "新建工单" }).first()).toBeVisible();
}

/** Raise the form and type into the two fields this test reads back. */
async function openForm(page) {
  await page.getByRole("button", { name: "新建工单" }).first().click();
  const form = page.getByRole("dialog", { name: "新建工单" });
  await expect(form).toBeVisible();
  await form.getByRole("textbox", { name: "标题", exact: true }).fill(TITLE);
  await form.getByRole("textbox", { name: /^目标/ }).fill(GOAL);
  return form;
}

test("a refused create keeps the form, the reason and every typed field", async ({ page }) => {
  test.setTimeout(120_000);
  const { projectId, ticketsUrl, count } = await setUp(page, "r132create");
  await openBoard(page, projectId);
  const form = await openForm(page);

  // One refusal with the server's own words, counted so the test knows the page wrote once.
  const writes = [];
  const pattern = `**${new URL(ticketsUrl).pathname}`;
  await page.route(pattern, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    writes.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await form.getByRole("button", { name: "创建", exact: true }).click();

  // The reason is in the form that asked, and it is not a toast: the notification region never
  // carries the server's words.
  await expect(form.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(writes).toHaveLength(1);
  await expect(form).toBeVisible();

  // Nothing was written, and both fields still hold what was typed.
  expect(await count()).toBe(0);
  await expect(form.getByRole("textbox", { name: "标题", exact: true })).toHaveValue(TITLE);
  await expect(form.getByRole("textbox", { name: /^目标/ })).toHaveValue(GOAL);

  // Cancelling decides nothing; reopening starts from a clean form, without the old reason.
  await form.getByRole("button", { name: "取消" }).click();
  await expect(form).toHaveCount(0);
  const again = await openForm(page);
  await expect(again.getByText(REFUSAL.message)).toHaveCount(0);

  // The retry lands: the form goes, the ticket is written, and its own dialog comes up on it.
  await page.unroute(pattern);
  await again.getByRole("button", { name: "创建", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect.poll(count).toBe(1);
  const detail = page.getByRole("dialog", { name: TITLE });
  await expect(detail).toBeVisible();
  await expect(detail.getByText(GOAL)).toBeVisible();
});
