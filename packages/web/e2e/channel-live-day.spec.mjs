/**
 * Regression: a channel message read from an earlier day's file lands under that day, not under
 * today.
 *
 * The open stream appends live `org_channel` events without a refetch. The event used to name no
 * day, so the view filed every arrival under "today" (`meta.today`, the server's own date) — a line
 * a CLI or a hand edit appended to yesterday's file, or one written a second before midnight and
 * published by the scan after it, was drawn inside today's section of the open channel while a
 * reload put the same line back under its own day: two views of one channel that disagreed. The
 * event now carries the day file the scan read the line from (`CompanyServerEvent`'s `date`) and
 * the view groups by it; a day that was not loaded yet is created where its date sorts, so an
 * earlier day is never drawn below today.
 *
 * The fixture writes yesterday's line straight into the data root (the one place the App owns
 * rather than serves) and then makes the server look at it the way production does: a write
 * through the API runs an immediate reconcile pass, whose channel scan publishes the new line on
 * the user event stream. No model key is needed — the line names nobody, so no desk is woken.
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

/** Today's message, posted through the API; and the line appended to yesterday's file by hand. */
const TODAY_TEXT = "今天：发布窗口定在周五";
const LATER_TEXT = "今天：上线清单再核一遍";
const YESTERDAY_TEXT = "昨天收工前：灰度名单已确认";

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
 * A fresh user with mock-model credentials, an organization and one channel holding a message
 * today — with today as the only day file, so the opening load has nothing earlier to fetch.
 */
async function setUp(page, tag) {
  await enableCompanyMode();
  const user = `${tag}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  // The organization id is this spec's own: the channel directory is then the only one under the
  // data root that answers to it, which is what lets the day file be written where the App reads.
  const orgId = `live${Math.random().toString(36).slice(2, 8)}`;
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
  // Nothing earlier: the opening load fetches today and stops.
  expect(readdirSync(dir).filter((f) => f.endsWith(".jsonl"))).toEqual([`${today}.jsonl`]);

  return { projectId, orgId, channelUrl, dir, today, user };
}

/** Open a channel: the header sits above its stream and the composer below. */
async function openChannel(page, projectId, orgId) {
  await page.goto(`/org/${projectId}/${orgId}/channels/${CHANNEL}`);
  await expect(page.getByRole("textbox", { name: /输入消息/ })).toBeVisible();
}

/** The message stream of the open channel. */
const stream = (page) => page.getByRole("log");
/** A day's divider, which the stream draws oldest first. */
const dayDivider = (page, label, date) =>
  stream(page).getByText(`${label} · ${date}`, { exact: true });

test("a line read from yesterday's file arrives under yesterday, above today", async ({ page }) => {
  const { projectId, orgId, channelUrl, dir, today, user } = await setUp(page, "r286live");
  const yesterday = shiftDate(today, -1);
  await openChannel(page, projectId, orgId);

  // The opening screen: today, and only today.
  await expect(stream(page).getByText(TODAY_TEXT)).toBeVisible();
  await expect(dayDivider(page, "今天", today)).toBeVisible();
  await expect(stream(page).getByText(/^昨天 · \d{4}-\d{2}-\d{2}$/)).toHaveCount(0);

  // A line appended to yesterday's file while the reader sits in the channel — a CLI, a hand
  // edit, or a write a second before midnight. Its shape is the server's own (one JSON line per
  // message, `parseChannelMessageLine`'s rules).
  const line = JSON.stringify({
    id: `msg-${yesterday}-20-00-00-00000001`,
    time: `${yesterday}T20:00:00.000Z`,
    sender: `user:${user}`,
    hop: 0,
    text: YESTERDAY_TEXT,
    mentions: [],
  });
  writeFileSync(path.join(dir, `${yesterday}.jsonl`), `${line}\n`, "utf8");

  // Make the server scan: a write through the API runs one reconcile pass at once, and the
  // channel scan publishes both the line it found in yesterday's file and this new message.
  const kick = await page.request.post(`${channelUrl}/messages`, { data: { text: LATER_TEXT } });
  expect(kick.ok(), "post a message to run the scan").toBeTruthy();

  // Yesterday becomes its own section with the line inside it — not an addition to today's.
  await expect(stream(page).getByText(YESTERDAY_TEXT)).toBeVisible();
  await expect(dayDivider(page, "昨天", yesterday)).toBeVisible();
  await expect(stream(page).getByText(/^昨天 · \d{4}-\d{2}-\d{2}$/)).toHaveCount(1);

  // Drawn in day order: yesterday's divider, the line, then today's divider and its messages.
  const y = async (locator) => (await locator.boundingBox()).y;
  const yesterdayDivider = dayDivider(page, "昨天", yesterday);
  const yesterdayLine = stream(page).getByText(YESTERDAY_TEXT);
  const todayDivider = dayDivider(page, "今天", today);
  await expect(yesterdayLine).toHaveCount(1);
  expect(await y(yesterdayDivider)).toBeLessThan(await y(yesterdayLine));
  expect(await y(yesterdayLine)).toBeLessThan(await y(todayDivider));
  await expect(stream(page).getByText(LATER_TEXT)).toBeVisible();

  // A reload reads the same files and agrees with the live view — the two used to disagree.
  await page.reload();
  await expect(stream(page).getByText(YESTERDAY_TEXT)).toBeVisible();
  expect(await y(dayDivider(page, "昨天", yesterday))).toBeLessThan(
    await y(stream(page).getByText(YESTERDAY_TEXT)),
  );
  expect(await y(stream(page).getByText(YESTERDAY_TEXT))).toBeLessThan(
    await y(dayDivider(page, "今天", today)),
  );
});
