/**
 * Regression: the organization calendar asks before every write, and a refused write keeps that
 * question — with the server's words inside it — instead of leaving only a toast.
 *
 * Both cards on `features/company/calendar-page.tsx` used to be dismissed by their own request
 * rather than by its outcome: the save card closed on the way into `catch` (the event was still
 * the one stored, but the reason arrived as a toast that dismissed itself after six seconds and
 * sat over the card rather than in it), and the delete card stayed open while its reason fell
 * into that same toast. Both now close only once their write landed; a refusal leaves the card
 * standing with the refusal drawn under its sentence (`ConfirmModal`'s `refusal` slot), so the
 * retry is the button that was pressed and cancelling lands back on the form with the values
 * that were refused.
 *
 * The organization and its event are made through the API rather than through the dialogs: this
 * spec is about the two confirmations, not about creation. Company mode is off on a fresh
 * server, so each test turns the admin master switch on first (idempotent), and the Project
 * gets the mock as its model so the onboarding overlay stays off the page.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "calrefuse";
/** The event file's name (and the dialog's subject); the chip shows its title instead. */
const EVENT = "probe_standup";
const TITLE = "站会";
const PROMPT = "检查看板，推进自己的工单";
const EDITED = "检查看板，推进工单并在频道汇报";

/** The writes the page makes; a 500 with its own words proves the reason came back. */
const SAVE_REFUSAL = { code: "calendar_store_locked", message: "calendar store is locked" };
const DELETE_REFUSAL = { code: "calendar_rota_busy", message: "the rota is mid-rewrite" };

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
 * A fresh user with mock-model credentials, an organization with its CEO, and one calendar
 * event on that CEO. Returns the ids and small readers over the server's own state.
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
    data: { orgId: ORG, mission: "Publish the plugin marketplace and reach the top of search." },
  });
  expect(created.ok(), "create organization").toBeTruthy();

  const event = await page.request.post(`${org}/calendar`, {
    data: {
      agentId: `${ORG}_ceo`,
      name: EVENT,
      title: TITLE,
      prompt: PROMPT,
      enabled: true,
      startAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
      period: "1d",
    },
  });
  expect(event.ok(), "create calendar event").toBeTruthy();

  /** The stored event, or null once it is gone. */
  const stored = async () => {
    const res = await page.request.get(`${org}/calendar/${ORG}_ceo/${EVENT}`);
    return res.status() === 200 ? await res.json() : null;
  };
  return { projectId, org, stored };
}

/** Open the calendar and the event's edit dialog by clicking its chip (the month view holds it). */
async function openEvent(page, projectId) {
  await page.goto(`/org/${projectId}/${ORG}/calendar`);
  // A chip is named by its time and title ("17:07 站会"), one per day the event recurs on; the
  // legend row also carries the title but names the employee and the cadence around it.
  const chip = page.getByRole("button", { name: new RegExp(`^\\d{2}:\\d{2} ${TITLE}$`) }).first();
  await expect(chip).toBeVisible();
  await chip.click();
  const edit = page.getByRole("dialog", { name: `编辑日程「${EVENT}」` });
  await expect(edit).toBeVisible();
  return edit;
}

/**
 * The card's own text with the refusal line dropped: a refused write adds one line under the
 * sentence ("操作被拒绝：…"), and that line is the only thing the refusal may change.
 */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused save keeps the card, its sentence and the stored event", async ({ page }) => {
  const { projectId, org, stored } = await setUp(page, "r122save");
  const before = await stored();
  expect(before?.prompt).toBe(PROMPT);

  const edit = await openEvent(page, projectId);
  // The write has to be a real change, so the refused values are visibly not the stored ones.
  await edit.getByRole("textbox", { name: /^提示词/ }).fill(EDITED);

  const writes = [];
  await page.route(
    `**/api/projects/${projectId}/organizations/${ORG}/calendar/**`,
    async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      writes.push(route.request().url());
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: SAVE_REFUSAL }),
      });
    },
  );

  await edit.getByRole("button", { name: "保存", exact: true }).click();
  const card = page.getByRole("dialog", { name: "保存修改" });
  await expect(card).toBeVisible();
  const sentence = await card.innerText();
  expect(sentence).toContain(`保存日程「${EVENT}」`);

  await card.getByRole("button", { name: "保存", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region holds
  // no dismissible button, and the card reads exactly as before plus the one line.
  await expect(card.getByText(SAVE_REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(writes).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the event is still the one the server had, and the form behind the
  // card still holds what was refused.
  expect((await stored())?.prompt).toBe(PROMPT);
  await expect(edit).toBeVisible();
  await expect(edit.getByRole("textbox", { name: /^提示词/ })).toHaveValue(EDITED);

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  await edit.getByRole("button", { name: "保存", exact: true }).click();
  const again = page.getByRole("dialog", { name: "保存修改" });
  await expect(again).toBeVisible();
  await expect(again.getByText(SAVE_REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // Let the retry through on the same card: it lands, the card and the form both go, and the
  // stored event is the edit.
  await page.unroute(`**/api/projects/${projectId}/organizations/${ORG}/calendar/**`);
  await again.getByRole("button", { name: "保存", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect(edit).toHaveCount(0);
  await expect.poll(async () => (await stored())?.prompt).toBe(EDITED);

  // The open API also lists it: the event is on the calendar, not merely in a file.
  const calendar = await (await page.request.get(`${org}/calendar`)).json();
  expect(calendar.events.some((e) => e.name === EVENT && e.prompt === EDITED)).toBe(true);
});

test("a refused delete keeps the card, its sentence and the event", async ({ page }) => {
  const { projectId, org, stored } = await setUp(page, "r122del");
  expect((await stored())?.prompt).toBe(PROMPT);

  const edit = await openEvent(page, projectId);
  await edit.getByRole("button", { name: "删除日程", exact: true }).click();
  const card = page.getByRole("dialog", { name: "删除日程" });
  await expect(card).toBeVisible();
  const sentence = await card.innerText();
  expect(sentence).toContain(`确认删除日程「${EVENT}」`);

  const deletes = [];
  await page.route(
    `**/api/projects/${projectId}/organizations/${ORG}/calendar/**`,
    async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      deletes.push(route.request().url());
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: DELETE_REFUSAL }),
      });
    },
  );

  await card.getByRole("button", { name: "删除", exact: true }).click();
  await expect(card.getByText(DELETE_REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(deletes).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was deleted, and the form behind the card is still the one that asked.
  expect((await stored())?.prompt).toBe(PROMPT);
  await expect(edit).toBeVisible();

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  await edit.getByRole("button", { name: "删除日程", exact: true }).click();
  const again = page.getByRole("dialog", { name: "删除日程" });
  await expect(again).toBeVisible();
  await expect(again.getByText(DELETE_REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: card and form both go, and the event is gone from the server.
  await page.unroute(`**/api/projects/${projectId}/organizations/${ORG}/calendar/**`);
  await again.getByRole("button", { name: "删除", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect(edit).toHaveCount(0);
  await expect.poll(stored).toBeNull();
  const calendar = await (await page.request.get(`${org}/calendar`)).json();
  expect(calendar.events.some((e) => e.name === EVENT)).toBe(false);
});
