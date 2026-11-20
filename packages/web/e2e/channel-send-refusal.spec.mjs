/**
 * Regression: a message the channel does not take says why above the composer — with the server's
 * words — instead of leaving only a toast, and the draft stays in the box whose send button is the
 * retry.
 *
 * Sending is the composer's only write (`features/company/channel-view.tsx`'s `send`). While it
 * failed, the words fell into a notification over the stream that dismissed itself after six
 * seconds; afterwards the channel read exactly as it had before the press, with the typed message
 * still in the box and nothing to say why it had not gone out (7.19's rule: the sentence belongs
 * where the attempt was made). The sentence now draws above the composer
 * (`channel-send-refusal.ts`, `data-testid="channel-send-refusal"`).
 *
 * The organization, its channel and the invited CEO are made through the API rather than through
 * the dialogs: this spec is about the composer. Company mode is off on a fresh server, so each test
 * turns the admin master switch on first (idempotent), and the Project gets the mock as its model
 * so the onboarding overlay stays off the page.
 *
 * Two shapes of refusal are covered because they come from different layers: a store that answers
 * 500 with a code the app has words for (`internal`), and the organization service's own 409
 * (`channel_archived`), a code the dictionary never learned — that one keeps the server's sentence.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "chansend";
const CHANNEL = "site";
const NAME = "站点上线";

/** The store's refusal: a 500 whose code the app has its own sentence for. */
const STORE_REFUSAL = { code: "internal", message: "the channel store is locked" };
/** What the composer's line reads for it (S.errors.byCode.internal, behind the app's lead-in). */
const STORE_SENTENCE = "这条消息没有发出：服务器内部错误，请稍后重试。";

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

  const channel = await page.request.post(`${orgBase}/${ORG}/channels`, {
    data: { channelId: CHANNEL, name: NAME, purpose: "站点从零到上线的一切" },
  });
  expect(channel.ok(), "create channel").toBeTruthy();
  const invited = await page.request.post(`${orgBase}/${ORG}/channels/${CHANNEL}/members`, {
    data: { principal: `agent:${ORG}_ceo` },
  });
  expect(invited.ok(), "invite the CEO").toBeTruthy();

  const channelUrl = `${orgBase}/${ORG}/channels/${CHANNEL}`;
  /** The channel as the server holds it: its `archived` flag, and every message written to it. */
  const stored = async () => {
    const res = await page.request.get(channelUrl);
    return res.status() === 200 ? await res.json() : null;
  };
  /** The channel's messages as written by people and employees — not the system notices. */
  const spoken = async () => {
    const res = await page.request.get(channelUrl + "/messages");
    const all = res.status() === 200 ? (await res.json()).messages : [];
    return all.filter((m) => m.sender !== "system").map((m) => m.text);
  };
  return { projectId, orgBase, channelUrl, stored, spoken };
}

/** Open a channel: the header sits above its stream and the composer below. */
async function openChannel(page, projectId, channelId = CHANNEL) {
  await page.goto(`/org/${projectId}/${ORG}/channels/${channelId}`);
  await expect(page.getByRole("textbox", { name: /输入消息/ })).toBeVisible();
}

/** The composer's box, by the placeholder it names its keys in. */
const box = (page) => page.getByRole("textbox", { name: /输入消息/ });
/** The message stream of the open channel. */
const stream = (page) => page.getByRole("log");
/** The sentence above the composer. */
const refusal = (page) => page.getByTestId("channel-send-refusal");

test("a message refused by the store says so above the composer and the draft stays", async ({
  page,
}) => {
  const { projectId, channelUrl, stored, spoken } = await setUp(page, "r280store");
  // A fresh channel holds only the system notices of its own creation.
  expect(await spoken()).toHaveLength(0);

  await openChannel(page, projectId);
  await box(page).fill("这周的发布会推迟到周五");
  expect((await stored())?.archived).toBe(false);

  // The store answers 500 with a code the app has words for.
  const posts = [];
  await page.route(
    `**/api/projects/${projectId}/organizations/${ORG}/channels/${CHANNEL}/messages`,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      posts.push(route.request().url());
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: STORE_REFUSAL }),
      });
    },
  );

  await page.getByRole("button", { name: "发送", exact: true }).click();

  // The sentence is above the composer, once, in the app's words — and not a toast.
  await expect(refusal(page)).toBeVisible();
  await expect(refusal(page)).toHaveText(STORE_SENTENCE);
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText("服务器内部错误");
  expect(posts).toHaveLength(1);
  // Nothing moved: the box still holds the words and the button is still the retry.
  await expect(box(page)).toHaveValue("这周的发布会推迟到周五");
  await expect(page.getByRole("button", { name: "发送", exact: true })).toBeEnabled();
  await expect.poll(async () => (await spoken()).length).toBe(0);

  // Seven seconds on, the six-second toast would be gone — the sentence is still there.
  await page.waitForTimeout(7000);
  await expect(refusal(page)).toHaveText(STORE_SENTENCE);
  await expect(box(page)).toHaveValue("这周的发布会推迟到周五");

  // The retry lands: the sentence goes first, the message reaches the stream, the box empties.
  await page.unroute(
    `**/api/projects/${projectId}/organizations/${ORG}/channels/${CHANNEL}/messages`,
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(refusal(page)).toHaveCount(0);
  // The bubble is in the stream, not in the box (the two read the same text as the send lands).
  await expect(stream(page).getByText("这周的发布会推迟到周五")).toBeVisible();
  await expect(box(page)).toHaveValue("");
  expect(await spoken()).toEqual(["这周的发布会推迟到周五"]);
});

test("a channel archived under the reader keeps the server's own sentence above the composer", async ({
  page,
}) => {
  const { projectId, channelUrl, spoken } = await setUp(page, "r280arch");

  await openChannel(page, projectId);
  // Another reader archives the channel while this one is typing: the composer is still up, the
  // page has not reloaded its detail.
  const archived = await page.request.patch(channelUrl, { data: { archived: true } });
  expect(archived.ok(), "archive the channel").toBeTruthy();

  await box(page).fill("上线之前把公告发出去");
  await page.getByRole("button", { name: "发送", exact: true }).click();

  // `channel_archived` is the organization service's own code and the dictionary has no words for
  // it, so the server's sentence is what the line carries.
  await expect(refusal(page)).toBeVisible();
  await expect(refusal(page)).toContainText("这条消息没有发出：");
  await expect(refusal(page)).toContainText("is archived");
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText("is archived");
  await expect(box(page)).toHaveValue("上线之前把公告发出去");
  expect(await spoken()).toHaveLength(0);
});

test("a refusal belongs to the channel it happened in", async ({ page }) => {
  const { projectId, orgBase } = await setUp(page, "r280scope");

  await openChannel(page, projectId);
  await page.route(
    `**/api/projects/${projectId}/organizations/${ORG}/channels/${CHANNEL}/messages`,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: STORE_REFUSAL }),
      });
    },
  );
  await box(page).fill("这条留在 site 里");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(refusal(page)).toHaveText(STORE_SENTENCE);

  // Into another channel the reader is a member of (the all-hands one) — and back again: the
  // sentence described one channel's press and does not follow the reader anywhere.
  const allHands = (await (await page.request.get(`${orgBase}/${ORG}/channels`)).json()).channels
    .map((c) => c.channelId)
    .find((id) => id !== CHANNEL);
  expect(allHands, "a second channel the reader is in").toBeTruthy();
  await openChannel(page, projectId, allHands);
  await expect(refusal(page)).toHaveCount(0);
  await expect(box(page)).toHaveValue("");
  await openChannel(page, projectId);
  await expect(refusal(page)).toHaveCount(0);
});
