/**
 * Regression: an "earlier days" press that does not come back says why under its own button,
 * instead of leaving only a toast, and the button stays as the retry.
 *
 * Paging back through a channel is a read (`features/company/channel-view.tsx`'s `loadEarlier`).
 * A day file that failed left the stream exactly as it was — the button still said "Earlier days"
 * and the reason fell into a notification over the top of the page that dismissed itself after six
 * seconds, so afterwards nothing on screen said the press had failed at all (7.19's rule: the
 * sentence belongs where the attempt was made). The sentence now draws under that button
 * (`channel-earlier-refusal.ts`, `data-testid="channel-earlier-refusal"`), which is also the retry.
 *
 * Reaching the button needs more days than the first screen loads: opening a channel walks back
 * until it holds enough messages or the day budget (7 files) runs out, so this spec writes seven
 * past-day files itself — into the data root run.sh exports as ADELIE_HOME, the one place the App
 * owns rather than serves — and the eighth stays behind the button. Their shape is the server's own
 * (one JSON line per message, `parseChannelMessageLine`'s rules); today's message is posted through
 * the API so the directory is found where the server put it instead of being assumed.
 *
 * The third case covers the same line reached by the other attempt: the walk the view does while
 * opening a channel, refused from before the page is opened, leaves the stream with today only —
 * and "less history than the channel has" used to be the whole story on screen.
 */
import { test, expect, request } from "@playwright/test";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const CHANNEL = "site";
const NAME = "发布节奏";

/** What today holds, and what the seeded older days say (oldest first in the assertions). */
const TODAY_TEXT = "今天：发布窗口定在周五";
/** The day the reader tries to open, and how far back it sits from today. */
const OLDEST_DAYS_BACK = 7;

/** The store's refusal: a 500 whose code the app has its own sentence for. */
const STORE_REFUSAL = { code: "internal", message: "the day file is locked" };
/** What the line under the button reads for it (S.errors.byCode.internal, behind the lead-in). */
const STORE_SENTENCE = "更早的记录没有取到：服务器内部错误，请稍后重试。";

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

/** `yyyy-mm-dd` shifted by whole days, in UTC so the arithmetic never crosses a local midnight. */
function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The data root run.sh exports; the spec writes day files where the App reads them. */
function dataRoot() {
  const home = process.env.ADELIE_HOME;
  expect(home, "ADELIE_HOME (e2e/run.sh exports the data root)").toBeTruthy();
  return home;
}

/** `organizations/<orgId>/channels/<channelId>/` under the data root — the depth is the store's own concern. */
function findChannelDir(root, orgId, channelId) {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    if (
      entries.some((e) => e.isDirectory() && e.name === channelId) &&
      path.basename(dir) === "channels" &&
      path.basename(path.dirname(dir)) === orgId
    ) {
      return path.join(dir, channelId);
    }
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(path.join(dir, entry.name));
    }
  }
  return null;
}

/**
 * A fresh user with mock-model credentials, an organization, one channel holding a message today
 * — and, written straight into the data root, the past days that put one more day behind the
 * "earlier" button.
 */
async function setUp(page, tag) {
  await enableCompanyMode();
  const user = `${tag}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  // The organization id is this spec's own: the channel directory is then the only one under the
  // data root that answers to it, which is what lets the day files be written where the App reads.
  const orgId = `earlier${Math.random().toString(36).slice(2, 8)}`;
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
    data: { orgId, mission: "Ship the release on a weekly cadence." },
  });
  expect(created.ok(), "create organization").toBeTruthy();

  const channel = await page.request.post(`${orgBase}/${orgId}/channels`, {
    data: { channelId: CHANNEL, name: NAME, purpose: "发布窗口与上线节奏" },
  });
  expect(channel.ok(), "create channel").toBeTruthy();

  // Today exists as a day file once a message is in it; the API is what writes it, so the
  // directory below is the server's own layout rather than one guessed here.
  const channelUrl = `${orgBase}/${orgId}/channels/${CHANNEL}`;
  const sent = await page.request.post(`${channelUrl}/messages`, { data: { text: TODAY_TEXT } });
  expect(sent.ok(), "post today's message").toBeTruthy();
  const today = (await (await page.request.get(`${channelUrl}/messages`)).json()).date;

  const dir = findChannelDir(dataRoot(), orgId, CHANNEL);
  expect(dir, `channels/${CHANNEL} under ADELIE_HOME`).toBeTruthy();
  expect(existsSync(path.join(dir, `${today}.jsonl`)), "today's day file").toBe(true);

  /** Oldest first: one message per day, the day OLDEST_DAYS_BACK files back sitting behind the button. */
  const seeded = [];
  for (let back = OLDEST_DAYS_BACK; back >= 1; back--) {
    const date = shiftDate(today, -back);
    const text = `${back} 天前：发布窗口前的检查`;
    const line = JSON.stringify({
      id: `msg-${date}-09-00-00-${back.toString(16).padStart(8, "0")}`,
      time: `${date}T09:00:00.000Z`,
      sender: `user:${user}`,
      hop: 0,
      text,
      mentions: [],
    });
    writeFileSync(path.join(dir, `${date}.jsonl`), `${line}\n`, "utf8");
    seeded.push(text);
  }

  return { projectId, orgId, oldest: seeded[0] };
}

/** Open a channel: the header sits above its stream and the composer below. */
async function openChannel(page, projectId, orgId, channelId = CHANNEL) {
  await page.goto(`/org/${projectId}/${orgId}/channels/${channelId}`);
  await expect(page.getByRole("textbox", { name: /输入消息/ })).toBeVisible();
}

/** The message stream of the open channel. */
const stream = (page) => page.getByRole("log");
/** The "earlier days" button above the stream. */
const earlierButton = (page) => page.getByRole("button", { name: "更早的记录", exact: true });
/** The sentence under that button. */
const refusal = (page) => page.getByTestId("channel-earlier-refusal");
/** The page-level notifications region, where the reason used to end up. */
const notices = (page) => page.getByRole("region", { name: "通知" });

/** The messages route, held to answer 500 for a day that is not today. */
function refuseOlderDays(page, projectId, orgId) {
  const url = `**/api/projects/${projectId}/organizations/${orgId}/channels/${CHANNEL}/messages**`;
  const seen = [];
  const install = () =>
    page.route(url, async (route) => {
      const request = route.request();
      if (request.method() !== "GET" || !new URL(request.url()).searchParams.has("date")) {
        return route.fallback();
      }
      seen.push(request.url());
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: STORE_REFUSAL }),
      });
    });
  return { install, seen, url };
}

test("a day that does not come back says so under the button, and the button is the retry", async ({
  page,
}) => {
  const { projectId, orgId, oldest } = await setUp(page, "r282load");
  await openChannel(page, projectId, orgId);

  // The first screen holds the day budget, so the oldest day is still behind the button.
  await expect(stream(page).getByText(TODAY_TEXT)).toBeVisible();
  await expect(stream(page).getByText(oldest)).toHaveCount(0);
  await expect(earlierButton(page)).toBeVisible();
  await expect(refusal(page)).toHaveCount(0);

  const mock = refuseOlderDays(page, projectId, orgId);
  await mock.install();

  await earlierButton(page).click();

  // The sentence is under the button, once, in the app's words — and not a toast.
  await expect(refusal(page)).toBeVisible();
  await expect(refusal(page)).toHaveText(STORE_SENTENCE);
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(notices(page)).not.toContainText("服务器内部错误");
  expect(mock.seen).toHaveLength(1);
  // Nothing moved: the button is still there and still the retry.
  await expect(earlierButton(page)).toBeEnabled();
  await expect(stream(page).getByText(oldest)).toHaveCount(0);

  // Seven seconds on, the six-second toast would be gone — the sentence is still there.
  await page.waitForTimeout(7000);
  await expect(refusal(page)).toHaveText(STORE_SENTENCE);

  // The retry lands: the sentence goes, the day's message reaches the stream.
  await page.unroute(mock.url);
  await earlierButton(page).click();
  await expect(refusal(page)).toHaveCount(0);
  await expect(stream(page).getByText(oldest)).toBeVisible();
});

test("the first screen's own walk back that stops part way says so too, above the button that continues", async ({
  page,
}) => {
  const { projectId, orgId, oldest } = await setUp(page, "r285walk");

  // Refused before the channel is opened: the walk the view does by itself (today, then earlier
  // days until the first screen is full) is the attempt that fails here — there is no press.
  const mock = refuseOlderDays(page, projectId, orgId);
  await mock.install();
  await openChannel(page, projectId, orgId);

  // Today landed, the walk stopped on its first older day, so the stream holds no history before it.
  await expect(stream(page).getByText(TODAY_TEXT)).toBeVisible();
  await expect(stream(page).getByText(oldest)).toHaveCount(0);
  expect(mock.seen).toHaveLength(1);

  // The sentence says why, once, in the app's words — and not as a toast.
  await expect(refusal(page)).toBeVisible();
  await expect(refusal(page)).toHaveText(STORE_SENTENCE);
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(notices(page)).not.toContainText("服务器内部错误");

  // The button is the retry, and it continues from exactly the day the walk stopped on.
  await expect(earlierButton(page)).toBeEnabled();

  // Seven seconds on, the six-second toast would be gone — the sentence is still there.
  await page.waitForTimeout(7000);
  await expect(refusal(page)).toHaveText(STORE_SENTENCE);

  // The retry lands: the sentence goes, and the day the walk stopped on arrives as its own section.
  // Asserted on the day divider, not the message text: these day files are written straight into
  // the data root, so the server's reconciler also picks them up and the view appends them to
  // TODAY (their own date is not what the event carries) — the message text alone would pass even
  // if the press had not fetched anything.
  await page.unroute(mock.url);
  await earlierButton(page).click();
  await expect(refusal(page)).toHaveCount(0);
  await expect(stream(page).getByText(/^昨天 · \d{4}-\d{2}-\d{2}$/)).toBeVisible();
});

test("the sentence belongs to the channel it happened in", async ({ page }) => {
  const { projectId, orgId } = await setUp(page, "r282scope");
  await openChannel(page, projectId, orgId);

  const mock = refuseOlderDays(page, projectId, orgId);
  await mock.install();
  await earlierButton(page).click();
  await expect(refusal(page)).toHaveText(STORE_SENTENCE);

  // Into the all-hands channel and back: the sentence described one channel's press and does not
  // follow the reader anywhere. Coming back re-runs this channel's own opening walk, and the route
  // still refuses older days — so the sentence is there again because the new attempt failed too,
  // not because the old one was remembered (releasing the route clears it, see the first case).
  await openChannel(page, projectId, orgId, "default_channel");
  await expect(refusal(page)).toHaveCount(0);
  await openChannel(page, projectId, orgId);
  await expect(refusal(page)).toHaveText(STORE_SENTENCE);
});
