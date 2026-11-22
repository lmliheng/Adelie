/**
 * Regression: the company sidebar's 工位 group lists one row per employee, and a row whose desk
 * Session id its caches have not learned yet opens the desk through the desk route (creating it on
 * the way in) — a read that can fail. Until now a refusal was only a toast: it dismissed itself
 * after six seconds, and the row that was pressed went back to looking exactly as it had before
 * the click.
 *
 * The reason now stays under the row that asked, in the server's own words (7.19's rule), and the
 * same row is the retry. The row never leaves the page on the way into `catch`, so the sentence is
 * still standing there when the answer comes back.
 *
 * The row has to be one that does not know its Session id yet, or the click only navigates and
 * asks the server nothing. That is a real state — the caches catch up on organization events — and
 * it is what the two reads are handed back as here: the chart without each employee's `desk`, the
 * sessions route without its `desks` list. Everything else (the organization, the desk itself, the
 * desk route) is the real server's.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "deskrow";
/** The desk route answers GET with a 500 of its own: the reason has to come back to the row. */
const DESK_REFUSAL = {
  code: "desk_reserve_failed",
  message: "the desk session could not be reserved",
};

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

/** A fresh user with mock-model credentials, and an organization whose CEO has a desk. */
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

  const created = await page.request.post(`${BASE}/api/projects/${projectId}/organizations`, {
    data: { orgId: ORG, mission: "把工位的那扇门守好，每一行都开得进去。" },
  });
  expect(created.ok(), "create organization").toBeTruthy();

  return { projectId };
}

test("a desk row the sidebar could not open keeps its reason under the row", async ({ page }) => {
  const { projectId } = await setUp(page, "r297desk");
  const overview = `/org/${projectId}/${ORG}/overview`;

  // The documented stale-cache state, handed back by the two reads the sidebar draws the group
  // from: no employee carries `desk`, and the sessions route lists none. Read here, before the
  // page opens (a read taken inside a route handler races the first navigation), then served
  // from these bodies for the rest of the case.
  const orgApi = `${BASE}/api/projects/${projectId}/organizations/${ORG}`;
  const chart = await (await page.request.get(`${orgApi}/chart`)).json();
  const sessions = await (await page.request.get(`${orgApi}/sessions`)).json();
  const staleChart = {
    ...chart,
    employees: chart.employees.map(({ desk, ...rest }) => rest),
  };
  const staleSessions = { ...sessions, desks: [] };
  await page.route(`**/api/projects/${projectId}/organizations/${ORG}/chart`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ json: staleChart });
  });
  await page.route(`**/api/projects/${projectId}/organizations/${ORG}/sessions`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ json: staleSessions });
  });

  const deskGets = [];
  await page.route(
    `**/api/projects/${projectId}/organizations/${ORG}/employees/*/desk`,
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      deskGets.push(route.request().url());
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: DESK_REFUSAL }),
      });
    },
  );

  await page.goto(overview);

  // The row is in the company sidebar's 工位 group, and it stands for an employee whose desk id
  // the caches have not learned — the click is the only way in, so it goes to the desk route.
  const sidebar = page.getByRole("complementary");
  const row = sidebar.getByRole("button", { name: new RegExp(`${ORG} CEO 的工位`) });
  await expect(row).toBeVisible();
  await row.click();

  // The reason is under the row that asked, in the server's words — and it is not a
  // notification: that region never carries them.
  const line = sidebar.getByRole("alert");
  const said = `操作被拒绝：${DESK_REFUSAL.message}`;
  await expect(line).toHaveText(said);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(DESK_REFUSAL.message);
  expect(deskGets).toHaveLength(1);
  expect(page.url()).toContain(overview);

  // "Under the row" measured: the sentence starts below the row's bottom edge and stays in the
  // sidebar. The row says it is no longer opening once the answer is back.
  const rowBox = await row.boundingBox();
  const lineBox = await line.boundingBox();
  expect(rowBox).not.toBeNull();
  expect(lineBox).not.toBeNull();
  expect(lineBox.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height - 1);
  const sidebarBox = await sidebar.boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(lineBox.x).toBeGreaterThanOrEqual(sidebarBox.x - 1);
  expect(lineBox.x + lineBox.width).toBeLessThanOrEqual(sidebarBox.x + sidebarBox.width + 1);
  expect(lineBox.height).toBeGreaterThan(0);
  await expect(row).toBeEnabled();

  // Six seconds is how long a notification lived: the sentence is still there.
  await page.waitForTimeout(7000);
  await expect(line).toHaveText(said);

  // The retry lands: the same row opens the desk and the shell follows it into the session, and
  // the line does not come along.
  await page.unroute(`**/api/projects/${projectId}/organizations/${ORG}/employees/*/desk`);
  await row.click();
  await page.waitForURL(/\/chat\/[^/?#]+/);
  expect(page.url()).toContain("/chat/");
  await expect(sidebar.getByText(said)).toHaveCount(0);
});
