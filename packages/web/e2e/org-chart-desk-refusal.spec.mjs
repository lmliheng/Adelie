/**
 * Regression: the org chart's card menu opens an employee's desk session, and that read can fail —
 * the desk is created on the way in, so the route can refuse it. Until now a refusal was only a
 * toast: it dismissed itself after six seconds, sat over the card rather than in it, and the card
 * that was pressed went back to looking exactly as it had before the click.
 *
 * The reason now stays in the card that asked, in the server's own words (7.19's rule), drawn at
 * the bottom of its face — the card's box is fixed and the canvas clips, so a line under the card
 * would be cut off on the bottom row. The same card's menu is the retry. The page never leaves the
 * chart on the way into `catch`, so the sentence is still standing there when the answer comes back.
 *
 * Company mode is off on a fresh server: the admin master switch is turned on first (idempotent),
 * and the Project gets the mock as its model so the onboarding overlay stays off the page. The
 * organization and its one subordinate are made through the API — this spec is about the card's
 * answer, not about hiring.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "chartdeskrefuse";
const MISSION = "把组织图上的每一扇工位门都守好。";
const DEV = { agentId: `${ORG}_dev`, name: "Dana Dev" };
/** The desk route answers GET with a 500 of its own: the reason has to come back to the card. */
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

/** A fresh user with mock-model credentials, an organization, and one subordinate on its chart. */
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
  return { projectId };
}

/** The card's own menu → "打开工位会话". */
async function askForDesk(page) {
  await page.getByRole("button", { name: `${DEV.name} · 员工操作` }).click();
  await page.getByRole("menuitem", { name: "打开工位会话" }).click();
}

test("a refused desk keeps its reason inside the card that asked", async ({ page }) => {
  const { projectId } = await setUp(page, "r298desk");
  const chartUrl = `/org/${projectId}/${ORG}/chart`;
  await page.goto(chartUrl);

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

  await askForDesk(page);

  // The reason is in the card that asked, in the server's words — and it is not a notification:
  // that region never carries them. The page stayed on the chart.
  const canvas = page.getByRole("group", { name: "组织图画布" });
  const line = canvas.getByRole("alert");
  const said = `操作被拒绝：${DESK_REFUSAL.message}`;
  await expect(line).toHaveText(said);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(DESK_REFUSAL.message);
  expect(deskGets).toHaveLength(1);
  expect(page.url()).toContain(chartUrl);

  // "Inside the card" measured: the sentence's whole box (the face it is laid into) is within
  // the card's face — it is not a line hanging outside it, nor a panel somewhere else.
  const inside = await line.evaluate((el) => {
    const face = el.parentElement;
    const a = el.getBoundingClientRect();
    const f = face.getBoundingClientRect();
    return {
      a: { left: a.left, right: a.right, top: a.top, bottom: a.bottom, height: a.height },
      f: { left: f.left, right: f.right, top: f.top, bottom: f.bottom, height: f.height },
    };
  });
  expect(inside.a.height).toBeGreaterThan(0);
  expect(inside.a.left).toBeGreaterThanOrEqual(inside.f.left - 1);
  expect(inside.a.right).toBeLessThanOrEqual(inside.f.right + 1);
  expect(inside.a.top).toBeGreaterThanOrEqual(inside.f.top - 1);
  expect(inside.a.bottom).toBeLessThanOrEqual(inside.f.bottom + 1);
  expect(inside.f.height).toBeGreaterThan(0);

  // Six seconds is how long a notification lived: the sentence is still there.
  await page.waitForTimeout(7000);
  await expect(line).toHaveText(said);

  // The retry lands: the same card's menu opens the desk and the shell follows it into the
  // session. The refusal does not come along.
  await page.unroute(`**/api/projects/${projectId}/organizations/${ORG}/employees/*/desk`);
  await askForDesk(page);
  await page.waitForURL(/\/chat\/session-[^/?#]+/);
  await expect(page.getByText(said)).toHaveCount(0);
});
