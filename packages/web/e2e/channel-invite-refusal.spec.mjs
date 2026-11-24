/**
 * Regression: inviting somebody to a channel is answered by the picker it was asked in.
 *
 * `features/company/channel-header.tsx`'s invite picker used to close on the click, and the
 * server's refusal fell into a toast that dismissed itself after six seconds and sat outside the
 * picker — so once the toast was gone there was no reason on screen and no candidate row left to
 * retry from. It now stays open until the write lands; a refusal leaves it standing with the
 * server's words under that candidate's row (the same row is the retry), and closing the picker
 * takes the question — and its answer — with it.
 *
 * The organization, its channel and the employee who is not in it are made through the API rather
 * than through the dialogs: this spec is about the picker, not about creation. Company mode is off
 * on a fresh server, so each test turns the admin master switch on first (idempotent), and the
 * Project gets the mock as its model so the onboarding overlay stays off the page.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "inviterefuse";
const CHANNEL = "site";
const NAME = "站点上线";
const DEV = { agentId: `${ORG}_dev`, name: "何地" };

/** The write the page makes; a 500 with its own words proves the reason came back. */
const REFUSAL = { code: "channel_store_locked", message: "the channel store is locked" };

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
 * A fresh user, an organization with its CEO, one channel holding that CEO and the reader, and one
 * hired employee outside the channel — the candidate the picker offers. Returns the project id and
 * a reader over the channel as stored.
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

  const channel = await page.request.post(`${orgBase}/${ORG}/channels`, {
    data: { channelId: CHANNEL, name: NAME, purpose: "站点从零到上线的一切" },
  });
  expect(channel.ok(), "create channel").toBeTruthy();
  const invited = await page.request.post(`${orgBase}/${ORG}/channels/${CHANNEL}/members`, {
    data: { principal: `agent:${ORG}_ceo` },
  });
  expect(invited.ok(), "invite the CEO").toBeTruthy();
  // He reports to the CEO and is not in the channel: the only candidate worth clicking.
  const hired = await page.request.post(`${orgBase}/${ORG}/employees`, {
    data: { newAgent: DEV, title: "站点工程师", reportsTo: `${ORG}_ceo` },
  });
  expect(hired.ok(), "hire the employee").toBeTruthy();

  const channelUrl = `${orgBase}/${ORG}/channels/${CHANNEL}`;
  /** The channel as the server holds it: its roster and whether it is archived. */
  const stored = async () => {
    const res = await page.request.get(channelUrl);
    return res.status() === 200 ? await res.json() : null;
  };
  const membersRoute = `**/api/projects/${projectId}/organizations/${ORG}/channels/${CHANNEL}/members`;
  return { projectId, channelUrl, membersRoute, stored };
}

/** Open the channel and the invite picker: the header sits above the channel's stream. */
async function openPicker(page, projectId) {
  await page.goto(`/org/${projectId}/${ORG}/channels/${CHANNEL}`);
  await expect(page.getByRole("heading", { name: new RegExp(NAME) })).toBeVisible();
  await page.getByRole("button", { name: "邀请", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "邀请到频道" });
  await expect(picker).toBeVisible();
  return picker;
}

test("a refused invite keeps the picker and its reason under that candidate's row", async ({
  page,
}) => {
  const { projectId, membersRoute, stored } = await setUp(page, "r312invite");
  expect((await stored())?.members.map((m) => m.principal)).not.toContain(`agent:${DEV.agentId}`);

  const picker = await openPicker(page, projectId);
  const row = picker.getByRole("button", { name: new RegExp(DEV.name) });
  await expect(row).toBeVisible();

  const posts = [];
  await page.route(membersRoute, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await row.click();

  // The reason is in the picker that asked, under the row whose click caused it — and it is not a
  // notification: that region (which may still hold the company beta's own notice) never carries
  // the server's words.
  const line = picker.getByRole("alert");
  await expect(line).toHaveText(REFUSAL.message);
  await expect(picker).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(posts).toHaveLength(1);

  // "Under the row" measured: the sentence starts below the row's bottom edge and stays inside the
  // picker, so the row above it is still the thing to click again.
  const rowBox = await row.boundingBox();
  const lineBox = await line.boundingBox();
  const pickerBox = await picker.boundingBox();
  expect(rowBox).not.toBeNull();
  expect(lineBox).not.toBeNull();
  expect(pickerBox).not.toBeNull();
  expect(lineBox.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height - 1);
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(pickerBox.y + pickerBox.height + 1);
  expect(lineBox.x).toBeGreaterThanOrEqual(pickerBox.x);

  // Nothing was written: he is still outside the channel, and the picker still offers him.
  expect((await stored())?.members.map((m) => m.principal)).not.toContain(`agent:${DEV.agentId}`);
  await expect(row).toBeVisible();

  // Six seconds is how long a notification lived: the sentence is still there, said by the row.
  await page.waitForTimeout(7000);
  await expect(line).toHaveText(REFUSAL.message);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);

  // The picker is the question: closing it takes the reason with it, and reopening it is clean.
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await page.getByRole("button", { name: "邀请", exact: true }).click();
  const again = page.getByRole("dialog", { name: "邀请到频道" });
  await expect(again).toBeVisible();
  await expect(again.getByRole("alert")).toHaveCount(0);

  // The retry lands from that same row: the picker closes, the toast says who joined, and the
  // roster on the server holds him.
  await page.unroute(membersRoute);
  await again.getByRole("button", { name: new RegExp(DEV.name) }).click();
  await expect(again).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" })).toContainText(`已邀请 ${DEV.name}`);
  await expect
    .poll(async () => (await stored())?.members.map((m) => m.principal))
    .toContain(`agent:${DEV.agentId}`);
});

test("a landed invite closes the picker and takes the candidate off it", async ({ page }) => {
  const { projectId, stored } = await setUp(page, "r312landed");
  const first = await openPicker(page, projectId);
  await first.getByRole("button", { name: new RegExp(DEV.name) }).click();

  // The picker was the question and it has its answer: it closes, and the header's roster grows.
  await expect(first).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" })).toContainText(`已邀请 ${DEV.name}`);
  await expect
    .poll(async () => (await stored())?.members.map((m) => m.principal))
    .toContain(`agent:${DEV.agentId}`);
  await expect(page.getByRole("button", { name: "频道成员 · 3 人" })).toBeVisible();

  // Reopening lists only who is left to invite: he is in the channel now, so he is not a candidate.
  const second = await openPicker(page, projectId);
  await expect(second.getByRole("button", { name: new RegExp(DEV.name) })).toHaveCount(0);
});
