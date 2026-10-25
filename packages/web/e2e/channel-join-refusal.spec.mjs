/**
 * Regression: joining a channel is asked in a confirmation card, and a refused join keeps that
 * question — with the server's words inside it — instead of leaving only a toast behind.
 *
 * Both entry points into joining (`features/company/channel-view.tsx`'s "you are not a member"
 * notice and `features/company/channel-sidebar.tsx`'s row action) raise the one card in
 * `channel-dialogs.tsx`. Each used to close it before the write landed, so a refusal left the
 * reason in a toast that dismissed itself after a few seconds — on top of a page that had not
 * changed, with the Join button live again and nothing saying why. The card now goes only once
 * its join landed; a refusal leaves it standing with the reason drawn under its sentence
 * (`ConfirmModal`'s `refusal` slot), and reopening it does not carry the old reason.
 *
 * The organization and its channel are made through the API rather than through the dialogs:
 * this spec is about the confirmation, not about creation. The channel is made by the reader and
 * then left through the API, so the reader is a non-member who may read it — which is what puts
 * a Join action in front of them. Company mode is off on a fresh server, so each test turns the
 * admin master switch on first (idempotent), and the Project gets the mock as its model so the
 * onboarding overlay stays off the page.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "chanjoinrefuse";
const CHANNEL = "site";
const NAME = "站点上线";
/** The notice strip the channel view shows a non-member; its Join button sits at its end. */
const NOT_MEMBER = "你还不是这个频道的成员";

/** The refusal the page paints; a 500 with its own words proves those words came back. */
const REFUSAL = { code: "channel_members_locked", message: "the channel roster is mid-rewrite" };

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
 * A fresh user with mock-model credentials, an organization with its CEO, one channel holding
 * both — and then the reader taken back out of it, so the sidebar files it under "其他频道" and
 * the view offers Join. Returns the ids and a reader over the channel as stored.
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

  // The creator is the channel's first member; the CEO is invited so the roster holds somebody
  // the reader leaves behind (a channel nobody is in is a different question).
  const channel = await page.request.post(`${orgBase}/${ORG}/channels`, {
    data: { channelId: CHANNEL, name: NAME, purpose: "站点从零到上线的一切" },
  });
  expect(channel.ok(), "create channel").toBeTruthy();
  const invited = await page.request.post(`${orgBase}/${ORG}/channels/${CHANNEL}/members`, {
    data: { principal: `agent:${ORG}_ceo` },
  });
  expect(invited.ok(), "invite the CEO").toBeTruthy();

  const channelUrl = `${orgBase}/${ORG}/channels/${CHANNEL}`;
  const detail = await (await page.request.get(channelUrl)).json();
  const me = detail.members.map((m) => m.principal).find((p) => p.startsWith("user:"));
  expect(me, "the reader is a member").toBeTruthy();
  const left = await page.request.delete(`${channelUrl}/members/${encodeURIComponent(me)}`);
  expect(left.status(), "leave the channel as its creator").toBe(204);

  /** The channel as the server holds it: its roster and whether the reader is on it. */
  const stored = async () => await (await page.request.get(channelUrl)).json();
  expect((await stored()).isMember, "the reader is not a member").toBe(false);
  return { projectId, channelUrl, me, stored };
}

/** Open the channel: the header sits above its stream. */
async function openChannel(page, projectId) {
  await page.goto(`/org/${projectId}/${ORG}/channels/${CHANNEL}`);
  await expect(page.getByRole("heading", { name: new RegExp(NAME) })).toBeVisible();
}

/** The channel view's notice strip — the non-member's own Join lives at its end. */
function notMemberStrip(page) {
  return page.getByText(NOT_MEMBER, { exact: false }).locator("..");
}

/**
 * The card's own text with the refusal line dropped: a refused write adds one line under the
 * sentence ("操作被拒绝：…"), and that line is the only thing the refusal may change.
 */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

/**
 * Refuse every join the page attempts, counting them: the write is one POST to the channel's
 * `/members`, and a 500 with its own words is how the test knows whose words came back.
 */
async function refuseJoins(page, projectId, seen) {
  await page.route(
    `**/api/projects/${projectId}/organizations/${ORG}/channels/${CHANNEL}/members`,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      seen.push(route.request().url());
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: REFUSAL }),
      });
    },
  );
  return `**/api/projects/${projectId}/organizations/${ORG}/channels/${CHANNEL}/members`;
}

test("a refused join from the channel view keeps the card, its sentence and the roster", async ({
  page,
}) => {
  const { projectId, me, stored } = await setUp(page, "r128view");
  await openChannel(page, projectId);

  const joins = [];
  const pattern = await refuseJoins(page, projectId, joins);

  await notMemberStrip(page).getByRole("button", { name: "加入", exact: true }).click();
  const card = page.getByRole("dialog", { name: "加入频道" });
  await expect(card).toBeVisible();
  const sentence = await cardText(card);
  expect(sentence).toContain("加入后你会收到这个频道里 @你 的消息");

  await card.getByRole("button", { name: "加入", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region (which
  // may still hold the company beta's own notice) never carries the server's words, and the card
  // reads exactly as before plus the one line.
  await expect(card.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(joins).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the reader is still off the roster, so the view still offers Join.
  expect((await stored()).members.map((m) => m.principal)).not.toContain(me);
  await expect(notMemberStrip(page)).toBeVisible();

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  await notMemberStrip(page).getByRole("button", { name: "加入", exact: true }).click();
  const again = page.getByRole("dialog", { name: "加入频道" });
  await expect(again).toBeVisible();
  await expect(again.getByText(REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: the card goes, the roster holds the reader, and the Join strip is gone.
  await page.unroute(pattern);
  await again.getByRole("button", { name: "加入", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect.poll(async () => (await stored()).isMember).toBe(true);
  expect((await stored()).members.map((m) => m.principal)).toContain(me);
  await expect(page.getByText(NOT_MEMBER, { exact: false })).toHaveCount(0);
});

test("a refused join from the sidebar keeps the card, its sentence and the roster", async ({
  page,
}) => {
  const { projectId, me, stored } = await setUp(page, "r128side");
  await openChannel(page, projectId);

  // The reader is not in it, so its row sits under "其他频道" with the hover-only Join action.
  const row = page.getByRole("link", { name: NAME, exact: true });
  await expect(row).toBeVisible();
  await row.hover();
  const rowJoin = row.locator("xpath=..").getByRole("button", { name: "加入", exact: true });
  await expect(rowJoin).toBeVisible();

  const joins = [];
  const pattern = await refuseJoins(page, projectId, joins);

  await rowJoin.click();
  const card = page.getByRole("dialog", { name: "加入频道" });
  await expect(card).toBeVisible();
  const sentence = await cardText(card);
  expect(sentence).toContain("加入后你会收到这个频道里 @你 的消息");

  await card.getByRole("button", { name: "加入", exact: true }).click();

  await expect(card.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(joins).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the reader is still off the roster and the row still offers Join.
  expect((await stored()).members.map((m) => m.principal)).not.toContain(me);
  await expect(page.getByText(NOT_MEMBER, { exact: false })).toBeVisible();

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  await row.hover();
  await rowJoin.click();
  const again = page.getByRole("dialog", { name: "加入频道" });
  await expect(again).toBeVisible();
  await expect(again.getByText(REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: the card goes, the roster holds the reader, and the row is no longer one to
  // join — the listing reloads and the view's own Join strip goes with it.
  await page.unroute(pattern);
  await again.getByRole("button", { name: "加入", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect.poll(async () => (await stored()).isMember).toBe(true);
  expect((await stored()).members.map((m) => m.principal)).toContain(me);
  await expect(page.getByText(NOT_MEMBER, { exact: false })).toHaveCount(0);
  await row.hover();
  await expect(rowJoin).toHaveCount(0);
});
