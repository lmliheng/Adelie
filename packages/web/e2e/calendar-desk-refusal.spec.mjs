/**
 * Regression: the organization calendar's edit dialog offers 「打开工位会话」 on an event whose
 * last run fired — the desk session that run went to. Opening the desk is a read that can fail
 * (the desk is created on the way in, so the route can refuse it), and until now a refusal was
 * only a toast: it dismissed itself after six seconds, sat over the dialog rather than in it, and
 * left the link's line looking exactly as it had before the click.
 *
 * The reason now stays inside the dialog, directly under the row the link lives on (7.19's rule),
 * and the same link is the retry — the dialog never closes on the way into `catch`, so it is
 * still standing to hold the answer. Closing the dialog and reopening it starts clean.
 *
 * "Last run fired" comes from the scheduler's state, which only an actual fire writes. Rather
 * than run the scheduler for one display field, the calendar list's own answer is read through
 * `page.route` and those two fields are added to this event: everything else on the page — the
 * event, the dialog, the desk route — is the real server's.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "caldesk";
/** The event file's name (and the dialog's subject); the chip shows its title instead. */
const EVENT = "probe_nightly";
const TITLE = "夜巡";
const PROMPT = "检查看板，把没人认领的工单派下去";
/** The desk route answers GET with a 500 of its own: the reason has to come back to the dialog. */
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

/**
 * A fresh user with mock-model credentials, an organization with its CEO, and one calendar event
 * on that CEO whose last run reads as fired. Returns the ids.
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

  const org = `${BASE}/api/projects/${projectId}/organizations/${ORG}`;
  const created = await page.request.post(`${BASE}/api/projects/${projectId}/organizations`, {
    data: { orgId: ORG, mission: "Ship the nightly sweep before the morning standup." },
  });
  expect(created.ok(), "create organization").toBeTruthy();

  const event = await page.request.post(`${org}/calendar`, {
    data: {
      agentId: `${ORG}_ceo`,
      name: EVENT,
      title: TITLE,
      prompt: PROMPT,
      enabled: true,
      // In the past, so the event is on the month grid the dialog is opened from; a `1d`
      // period keeps it recurring rather than a one-off instance.
      startAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      period: "1d",
    },
  });
  expect(event.ok(), "create calendar event").toBeTruthy();

  /**
   * The scheduler's state for this event, as the calendar list would report it after a fire.
   * `npm`-free: the list route's own answer is fetched and handed back with the two fields added.
   */
  await page.route(`**/api/projects/${projectId}/organizations/${ORG}/calendar`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const body = await response.json();
    const fired = new Date(Date.now() - 2 * 3600_000).toISOString();
    body.events = body.events.map((e) =>
      e.agentId === `${ORG}_ceo` && e.name === EVENT
        ? { ...e, lastFiredAt: fired, lastOutcome: "fired" }
        : e,
    );
    await route.fulfill({ response, json: body });
  });

  return { projectId };
}

/** Open the calendar and the event's edit dialog by clicking its chip (the month view holds it). */
async function openEvent(page, projectId) {
  await page.goto(`/org/${projectId}/${ORG}/calendar`);
  // A chip is named by its time and title ("20:07 夜巡"), one per day the event recurs on; the
  // legend row also carries the title but names the employee and the cadence around it.
  const chip = page.getByRole("button", { name: new RegExp(`^\\d{2}:\\d{2} ${TITLE}$`) }).first();
  await expect(chip).toBeVisible();
  await chip.click();
  const edit = page.getByRole("dialog", { name: `编辑日程「${EVENT}」` });
  await expect(edit).toBeVisible();
  return edit;
}

test("a desk the dialog could not open keeps its reason under the link's row", async ({ page }) => {
  const { projectId } = await setUp(page, "r292desk");
  const edit = await openEvent(page, projectId);

  // The link is on the row above the form: last fired, its outcome, and the way into the desk.
  const link = edit.getByRole("button", { name: "打开工位会话" });
  await expect(link).toBeVisible();

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

  await link.click();

  // The reason is in the dialog that asked, under the row whose link was pressed — and it is not
  // a notification: that region never carries the server's words.
  const line = edit.getByRole("alert");
  const said = `操作被拒绝：${DESK_REFUSAL.message}`;
  await expect(line).toHaveText(said);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(DESK_REFUSAL.message);
  expect(deskGets).toHaveLength(1);
  await expect(edit).toBeVisible();
  expect(page.url()).toContain(`/org/${projectId}/${ORG}/calendar`);

  // "Under the row" measured: the sentence starts below the link's bottom edge and stays inside
  // the dialog.
  const linkBox = await link.boundingBox();
  const lineBox = await line.boundingBox();
  const dialogBox = await edit.boundingBox();
  expect(linkBox).not.toBeNull();
  expect(lineBox).not.toBeNull();
  expect(dialogBox).not.toBeNull();
  expect(lineBox.y).toBeGreaterThanOrEqual(linkBox.y + linkBox.height - 1);
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height + 1);

  // Six seconds is how long a notification lived: the sentence is still there, said by the row.
  await page.waitForTimeout(7000);
  await expect(line).toHaveText(said);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(DESK_REFUSAL.message);

  // The dialog is the question: closing it takes the reason with it, and reopening it is clean.
  await edit.getByRole("button", { name: "取消" }).click();
  await expect(edit).toHaveCount(0);
  const again = await openEvent(page, projectId);
  await expect(again.getByRole("alert")).toHaveCount(0);

  // The retry lands: the same link opens the desk, and the shell follows it into the session.
  await page.unroute(`**/api/projects/${projectId}/organizations/${ORG}/employees/*/desk`);
  await again.getByRole("button", { name: "打开工位会话" }).click();
  await page.waitForURL(/\/chat\/[^/?#]+/);
  expect(page.url()).toContain("/chat/");
  await expect(page.getByRole("dialog", { name: `编辑日程「${EVENT}」` })).toHaveCount(0);
});
