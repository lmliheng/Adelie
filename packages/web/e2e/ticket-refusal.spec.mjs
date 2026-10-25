/**
 * Regression: a ticket's writes are asked in confirmation cards, and a refused write keeps the
 * card that asked — with the server's words inside it — instead of leaving only a toast behind.
 *
 * Three cards live in the ticket dialog (`features/company/ticket-dialog.tsx`): saving an edited
 * section, lifting a block, and moving the ticket from the footer. A fourth entry point raises
 * the same move card from the board (`features/company/tickets-page.tsx`, a card dropped on
 * another column) — one card, two doors. All four used to close before their write landed, so a
 * refusal put the reason in a toast that dismissed itself after a few seconds, over a panel that
 * had not changed and with the button live again and nothing saying why. Each card now goes only
 * once its write landed; a refusal leaves it standing with the reason drawn under its sentence
 * (`ConfirmModal`'s `refusal` slot), and reopening it does not carry the old reason.
 *
 * The organization and its ticket are made through the API rather than through the dialogs:
 * this spec is about the confirmations, not about creation. Company mode is off on a fresh
 * server, so each test turns the admin master switch on first (idempotent), and the Project gets
 * the mock as its model — nothing here needs the model, but a fresh Project without one would
 * hold the onboarding overlay over the board.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "ticketrefuse";
const TITLE = "上线市场站点";
const RENAMED = "上线市场站点和博客";
const GOAL = "让插件市场能被人搜到，首页限时置顶卖出第一格曝光。";

/** The refusal the page paints; a 500 with its own words proves those words came back. */
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

/**
 * A fresh user with mock-model credentials, an organization with its CEO and one ticket owned by
 * that CEO. Returns the ids and a reader over the ticket as stored.
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
  const created = await page.request.post(orgBase, {
    data: { orgId: ORG, mission: "Publish the plugin marketplace and reach the top of search." },
  });
  expect(created.ok(), "create organization").toBeTruthy();

  const filed = await page.request.post(`${orgBase}/${ORG}/tickets`, {
    data: { title: TITLE, goal: GOAL, owner: `agent:${ORG}_ceo`, priority: "P1" },
  });
  expect(filed.ok(), "create ticket").toBeTruthy();
  const ticketId = (await filed.json()).ticketId;

  const ticketUrl = `${orgBase}/${ORG}/tickets/${ticketId}`;
  /** The ticket as the server holds it: its title and its column. */
  const stored = async () => await (await page.request.get(ticketUrl)).json();
  return { projectId, ticketUrl, ticketId, stored };
}

/** The board, and the card of the one ticket — a click anywhere on it opens the ticket. */
async function openBoard(page, projectId) {
  await page.goto(`/org/${projectId}/${ORG}/tickets`);
  await expect(page.getByText(TITLE, { exact: true }).first()).toBeVisible();
}

async function openTicket(page) {
  await page.locator("[data-ticket-column] button", { hasText: TITLE }).first().click();
  const dialog = page.getByRole("dialog", { name: TITLE });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * The card's own text with the refusal line dropped: a refused write adds one line under the
 * sentence ("操作被拒绝：…"), and that line is the only thing the refusal may change.
 */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

/**
 * Refuse one of the ticket's writes, counting the attempts: a `500` with its own words is how the
 * test knows whose words came back, and the count is how it knows the page wrote exactly once.
 */
async function refuseWrite(page, ticketUrl, method, seen, suffix = "") {
  const pattern = `**${new URL(ticketUrl).pathname}${suffix}`;
  await page.route(pattern, async (route) => {
    if (route.request().method() !== method) return route.fallback();
    seen.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
  return pattern;
}

test("a refused save keeps the card, its sentence and the ticket file", async ({ page }) => {
  test.setTimeout(120_000);
  const { projectId, ticketUrl, stored } = await setUp(page, "r130save");
  await openBoard(page, projectId);
  const dialog = await openTicket(page);

  // The summary section's own "编辑" opens its fields in place; "保存" asks first.
  await dialog.getByRole("button", { name: "编辑", exact: true }).first().click();
  await dialog.getByRole("textbox", { name: "标题", exact: true }).fill(RENAMED);
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  const card = page.getByRole("dialog", { name: "保存修改" });
  await expect(card).toBeVisible();
  const sentence = await cardText(card);
  expect(sentence).toContain(`保存对「${TITLE}」的修改`);

  const writes = [];
  const pattern = await refuseWrite(page, ticketUrl, "PUT", writes);
  await card.getByRole("button", { name: "保存", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region never
  // carries the server's words, and the card reads exactly as before plus the one line.
  await expect(card.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(writes).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the file still holds the old title, and the fields keep the edit.
  expect((await stored()).title).toBe(TITLE);
  await expect(dialog.getByRole("textbox", { name: "标题", exact: true })).toHaveValue(RENAMED);

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  const again = page.getByRole("dialog", { name: "保存修改" });
  await expect(again).toBeVisible();
  await expect(again.getByText(REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: the card goes, the file takes the new title, and the dialog is renamed by it.
  await page.unroute(pattern);
  await again.getByRole("button", { name: "保存", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect.poll(async () => (await stored()).title).toBe(RENAMED);
  await expect(page.getByRole("dialog", { name: RENAMED })).toBeVisible();
});

test("a refused move from the dialog keeps the card, its sentence and the column", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { projectId, ticketUrl, stored } = await setUp(page, "r130move");
  await openBoard(page, projectId);
  const dialog = await openTicket(page);

  // The footer's own move: pick the column, then "移动" asks first. The select is the app's own
  // dropdown (a trigger button opening a listbox), not a native one.
  const picker = dialog.getByRole("button", { name: "移动工单" });
  await picker.click();
  await page.getByRole("option", { name: "进行中", exact: true }).click();
  await dialog.getByRole("button", { name: "移动", exact: true }).click();
  const card = page.getByRole("dialog", { name: "移动工单" });
  await expect(card).toBeVisible();
  const sentence = await cardText(card);
  expect(sentence).toContain(`将「${TITLE}」移到「进行中」？`);

  const writes = [];
  const pattern = await refuseWrite(page, ticketUrl, "POST", writes, "/move");
  await card.getByRole("button", { name: "确认", exact: true }).click();

  await expect(card.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(writes).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the ticket is still proposed, and the footer still has the column picked.
  expect((await stored()).status).toBe("proposed");
  await expect(picker).toContainText("进行中");

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  await dialog.getByRole("button", { name: "移动", exact: true }).click();
  const again = page.getByRole("dialog", { name: "移动工单" });
  await expect(again).toBeVisible();
  await expect(again.getByText(REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: the card goes and the file records the column.
  await page.unroute(pattern);
  await again.getByRole("button", { name: "确认", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect.poll(async () => (await stored()).status).toBe("in_progress");
});

test("a refused unblock keeps the card, its sentence and the block", async ({ page }) => {
  test.setTimeout(120_000);
  const { projectId, ticketUrl, stored } = await setUp(page, "r130unblock");
  // Blocked through the API: the block dialog is not what this test is about.
  const blocked = await page.request.post(`${ticketUrl}/block`, {
    data: { reason: "等市场站点的备案下来" },
  });
  expect(blocked.ok(), "block the ticket").toBeTruthy();

  await openBoard(page, projectId);
  const dialog = await openTicket(page);
  await dialog.getByRole("button", { name: "解除阻塞", exact: true }).click();
  const card = page.getByRole("dialog", { name: "解除阻塞", exact: true });
  await expect(card).toBeVisible();
  const sentence = await cardText(card);
  expect(sentence).toContain(`解除「${TITLE}」的阻塞？`);

  const writes = [];
  const pattern = await refuseWrite(page, ticketUrl, "POST", writes, "/unblock");
  await card.getByRole("button", { name: "确认", exact: true }).click();

  await expect(card.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(writes).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the ticket is still blocked, so the footer still offers to lift it.
  expect((await stored()).blocked).toBeTruthy();

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  await dialog.getByRole("button", { name: "解除阻塞", exact: true }).click();
  const again = page.getByRole("dialog", { name: "解除阻塞", exact: true });
  await expect(again).toBeVisible();
  await expect(again.getByText(REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: the card goes and the file no longer carries a block.
  await page.unroute(pattern);
  await again.getByRole("button", { name: "确认", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect.poll(async () => (await stored()).blocked).toBeFalsy();
});

test("a refused move from the board keeps the card, its sentence and the column", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { projectId, ticketUrl, stored } = await setUp(page, "r130board");
  await openBoard(page, projectId);

  // A mouse drag onto another column lifts the card as soon as it moves and asks to move it there.
  const card = page.locator("[data-ticket-column] button", { hasText: TITLE }).first();
  const from = await card.boundingBox();
  const to = await page.locator('[data-ticket-column="in_progress"]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Near the column's top rather than its middle: a tall column can end below the viewport.
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(60, to.height / 2), { steps: 12 });
  await page.mouse.up();
  const question = page.getByRole("dialog", { name: "移动工单" });
  await expect(question).toBeVisible();
  const sentence = await cardText(question);
  expect(sentence).toContain(`将「${TITLE}」移到「进行中」？`);

  const writes = [];
  const pattern = await refuseWrite(page, ticketUrl, "POST", writes, "/move");
  await question.getByRole("button", { name: "确认", exact: true }).click();

  await expect(question.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(writes).toHaveLength(1);
  await expect(question).toBeVisible();
  expect(await cardText(question)).toBe(sentence);

  // Nothing was written: the card is still in its own column.
  expect((await stored()).status).toBe("proposed");
  await expect(
    page.locator('[data-ticket-column="proposed"]').getByText(TITLE, { exact: true }),
  ).toBeVisible();

  // The retry lands: the card goes and the card moves over.
  await page.unroute(pattern);
  await question.getByRole("button", { name: "确认", exact: true }).click();
  await expect(question).toHaveCount(0);
  await expect.poll(async () => (await stored()).status).toBe("in_progress");
  await expect(
    page.locator('[data-ticket-column="in_progress"]').getByText(TITLE, { exact: true }),
  ).toBeVisible();
});
