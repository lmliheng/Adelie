/**
 * Regression: the organization overview's header carries 「打开 CEO 工位」, a read that can fail
 * (the desk is created on the way in, so the route can refuse it). Until now a refusal was only a
 * toast: it dismissed itself after six seconds, and the header button — the one thing the reader
 * pressed — went back to looking exactly as it had before the click.
 *
 * The reason now stays on the page it was asked from, in the same top-of-the-body slot the
 * refresh error uses (7.19's rule), and the same button is the retry. The page never leaves
 * `/org/<project>/<org>/overview` on the way into `catch`, so the line is still standing there
 * when the answer comes back.
 *
 * A brand-new organization hides the header button and puts that call to action in the
 * first-steps guide instead, so the fixture files one ticket: the guide steps aside, and the
 * header carries the button this spec presses.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "ovdesk";
const MISSION = "把工单收干净，每天早会前给出前一日的结论。";
/** The desk route answers GET with a 500 of its own: the reason has to come back to the page. */
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

/** A fresh user with mock-model credentials, an organization with its CEO, and one open ticket. */
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
    data: { orgId: ORG, mission: MISSION },
  });
  expect(created.ok(), "create organization").toBeTruthy();

  // One ticket is what makes the page stop being "fresh": the guide's step 1 then gives way to
  // the header button, which is the surface this spec presses.
  const ticket = await page.request.post(
    `${BASE}/api/projects/${projectId}/organizations/${ORG}/tickets`,
    {
      data: {
        title: "写第一份周会纪要",
        // The ticket's file name comes from the slug; the title is the reader's own wording.
        slug: "first-weekly-minutes",
        goal: "把本周的工单结论写成一份纪要。",
        owner: `agent:${ORG}_ceo`,
        priority: "P1",
      },
    },
  );
  expect(ticket.ok(), `create ticket: ${ticket.status()} ${await ticket.text()}`).toBeTruthy();

  return { projectId };
}

test("a CEO desk the header could not open keeps its reason on the page", async ({ page }) => {
  const { projectId } = await setUp(page, "r293desk");
  const overview = `/org/${projectId}/${ORG}/overview`;
  await page.goto(overview);

  const button = page.getByRole("button", { name: "打开 CEO 工位" });
  await expect(button).toBeVisible();

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

  await button.click();

  // The reason is on the page that asked, in the server's words — and it is not a notification:
  // that region never carries them.
  const line = page.getByRole("alert");
  const said = `操作被拒绝：${DESK_REFUSAL.message}`;
  await expect(line).toHaveText(said);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(DESK_REFUSAL.message);
  expect(deskGets).toHaveLength(1);
  expect(page.url()).toContain(overview);

  // "Under the button" measured: the sentence starts below the header button's bottom edge and
  // stays on the page. The button says it is no longer opening once the answer is back.
  const buttonBox = await button.boundingBox();
  const lineBox = await line.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(lineBox).not.toBeNull();
  expect(lineBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height - 1);
  await expect(button).toBeEnabled();
  await expect(button).toHaveText("打开 CEO 工位");

  // Six seconds is how long a notification lived: the sentence is still there.
  await page.waitForTimeout(7000);
  await expect(line).toHaveText(said);

  // The retry lands: the same button opens the desk and the shell follows it into the session,
  // and the line does not come along.
  await page.unroute(`**/api/projects/${projectId}/organizations/${ORG}/employees/*/desk`);
  await button.click();
  await page.waitForURL(/\/chat\/[^/?#]+/);
  expect(page.url()).toContain("/chat/");
  await expect(page.getByText(said)).toHaveCount(0);
});
