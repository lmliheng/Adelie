/**
 * Regression: leaving a channel and archiving it are asked in a confirmation card, and a refused
 * write keeps that question — with the server's words inside it — instead of leaving only a toast.
 *
 * Both cards in `features/company/channel-header.tsx` used to stay open while their reason fell
 * into a toast that dismissed itself after a few seconds and sat over the card rather than in it.
 * They now close only once their write landed; a refusal leaves the card standing with the reason
 * drawn under its sentence (`ConfirmModal`'s `refusal` slot), so the retry is the button that was
 * pressed and cancelling decides nothing. Un-archiving has no card — one menu row — and keeps its
 * toast, which is what this spec checks it does NOT do for the two cards.
 *
 * The organization, its channel and the invited CEO are made through the API rather than through
 * the dialogs: this spec is about the two confirmations, not about creation. Company mode is off
 * on a fresh server, so each test turns the admin master switch on first (idempotent), and the
 * Project gets the mock as its model so the onboarding overlay stays off the page.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "chanrefuse";
const CHANNEL = "site";
const NAME = "站点上线";

/** The writes the page makes; a 500 with its own words proves the reason came back. */
const LEAVE_REFUSAL = {
  code: "channel_members_locked",
  message: "the channel roster is mid-rewrite",
};
const ARCHIVE_REFUSAL = { code: "channel_store_locked", message: "channel store is locked" };

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
 * A fresh user with mock-model credentials, an organization with its CEO, and one invited channel
 * holding both the reader and the CEO. Returns the ids and a reader over the channel as stored.
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

  // The creator is the channel's first member; the CEO is invited so leaving really removes one
  // person from a channel others are in.
  const channel = await page.request.post(`${orgBase}/${ORG}/channels`, {
    data: { channelId: CHANNEL, name: NAME, purpose: "站点从零到上线的一切" },
  });
  expect(channel.ok(), "create channel").toBeTruthy();
  const invited = await page.request.post(`${orgBase}/${ORG}/channels/${CHANNEL}/members`, {
    data: { principal: `agent:${ORG}_ceo` },
  });
  expect(invited.ok(), "invite the CEO").toBeTruthy();

  const channelUrl = `${orgBase}/${ORG}/channels/${CHANNEL}`;
  /** The channel as the server holds it: its roster and whether it is archived. */
  const stored = async () => {
    const res = await page.request.get(channelUrl);
    return res.status() === 200 ? await res.json() : null;
  };
  const detail = await stored();
  const me = detail.members.map((m) => m.principal).find((p) => p.startsWith("user:"));
  expect(me, "the reader is a member").toBeTruthy();
  return { projectId, channelUrl, me, stored };
}

/** Open the channel: the header sits above its stream. */
async function openChannel(page, projectId) {
  await page.goto(`/org/${projectId}/${ORG}/channels/${CHANNEL}`);
  await expect(page.getByRole("heading", { name: new RegExp(NAME) })).toBeVisible();
}

/**
 * The card's own text with the refusal line dropped: a refused write adds one line under the
 * sentence ("操作被拒绝：…"), and that line is the only thing the refusal may change.
 */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused leave keeps the card, its sentence and the roster", async ({ page }) => {
  const { projectId, channelUrl, me, stored } = await setUp(page, "r123leave");
  expect((await stored())?.members.map((m) => m.principal)).toContain(me);

  await openChannel(page, projectId);
  await page.getByRole("button", { name: "离开", exact: true }).click();
  const card = page.getByRole("dialog", { name: "离开频道" });
  await expect(card).toBeVisible();
  const sentence = await card.innerText();
  expect(sentence).toContain(`确认离开「${NAME}」`);

  const deletes = [];
  await page.route(
    `**/api/projects/${projectId}/organizations/${ORG}/channels/${CHANNEL}/members/**`,
    async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      deletes.push(route.request().url());
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: LEAVE_REFUSAL }),
      });
    },
  );

  await card.getByRole("button", { name: "离开", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region (which
  // may still hold the company beta's own notice) never carries the server's words, and the card
  // reads exactly as before plus the one line.
  await expect(card.getByText(LEAVE_REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(LEAVE_REFUSAL.message);
  expect(deletes).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the reader is still on the roster (the card hides the page behind it, so
  // the header's own button is not readable here — the roster is).
  expect((await stored())?.members.map((m) => m.principal)).toContain(me);

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "离开", exact: true }).click();
  const again = page.getByRole("dialog", { name: "离开频道" });
  await expect(again).toBeVisible();
  await expect(again.getByText(LEAVE_REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: the card goes, and the roster on the server no longer holds the reader.
  await page.unroute(
    `**/api/projects/${projectId}/organizations/${ORG}/channels/${CHANNEL}/members/**`,
  );
  await again.getByRole("button", { name: "离开", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect
    .poll(async () => (await stored())?.members.map((m) => m.principal).includes(me))
    .toBe(false);
  // Left is left: the header no longer offers to leave (nor to invite), and says so in a notice.
  await expect(page.getByRole("button", { name: "离开", exact: true })).toHaveCount(0);
  await expect(page.getByText("你还不是这个频道的成员", { exact: false })).toBeVisible();
  expect((await (await page.request.get(channelUrl)).json()).isMember).toBe(false);
});

test("a refused archive keeps the card, its sentence and the channel open", async ({ page }) => {
  const { projectId, stored } = await setUp(page, "r123archive");
  expect((await stored())?.archived).toBe(false);

  await openChannel(page, projectId);
  await page.getByRole("button", { name: new RegExp(`^频道操作: ${NAME}`) }).click();
  await page.getByRole("menuitem", { name: "归档" }).click();
  const card = page.getByRole("dialog", { name: "归档频道" });
  await expect(card).toBeVisible();
  const sentence = await card.innerText();
  expect(sentence).toContain(`确认归档「${NAME}」`);

  const patches = [];
  await page.route(
    `**/api/projects/${projectId}/organizations/${ORG}/channels/${CHANNEL}`,
    async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      patches.push(route.request().url());
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: ARCHIVE_REFUSAL }),
      });
    },
  );

  await card.getByRole("button", { name: "归档", exact: true }).click();

  // A refusal over a card is the card's news, never a toast (the notification region is where the
  // company beta's own notice lives, so this checks the words rather than the region being empty).
  await expect(card.getByText(ARCHIVE_REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(
    ARCHIVE_REFUSAL.message,
  );
  expect(patches).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the channel still takes messages, and its menu still offers to archive.
  expect((await stored())?.archived).toBe(false);
  await expect(page.getByRole("textbox", { name: /输入消息/ })).toBeVisible();

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: new RegExp(`^频道操作: ${NAME}`) }).click();
  await page.getByRole("menuitem", { name: "归档" }).click();
  const again = page.getByRole("dialog", { name: "归档频道" });
  await expect(again).toBeVisible();
  await expect(again.getByText(ARCHIVE_REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: the card goes, the channel is archived, and the page says it is read-only.
  await page.unroute(`**/api/projects/${projectId}/organizations/${ORG}/channels/${CHANNEL}`);
  await again.getByRole("button", { name: "归档", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect.poll(async () => (await stored())?.archived).toBe(true);
  await expect(page.getByText("这个频道已归档，只读")).toBeVisible();
});
