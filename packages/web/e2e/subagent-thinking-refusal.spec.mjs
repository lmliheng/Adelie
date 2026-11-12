/**
 * Regression: a thinking level the subagent panel could not pin leaves the reason above the child's
 * composer, and the picker keeps reading the level the child actually runs at.
 *
 * The panel's picker used to adopt the clicked level up front and PATCH afterwards, so a refused
 * write left two lies on screen at once: a picker showing a level the child was never pinned to,
 * and a reason that lived only in a six-second notification. The main composer never did this (it
 * swaps the returned Session row in), and this panel is the same shape — a child Session's level,
 * pinned through the same route — so it now behaves the same way: adopted once the PATCH landed,
 * with the sentence in the composer's thinking-refusal slot until the next attempt.
 *
 * The child's PATCH is stubbed for the refusal half (the child's own runs are not what is measured),
 * carrying a code the interface has its own copy for plus an English wire message — that is how the
 * test tells the localized sentence from the raw one. The second half lets the same route through.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** The refusal: a code the interface translates, plus a message that must not reach the page. */
const REFUSAL = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** The line the page draws for that code (S.errors.byCode), after what failed. */
const REASON = "服务器内部错误，请稍后重试。";

/** Every Session write: the panel's pin is the only PATCH this page makes. */
const PATCH_ROUTE = /\/api\/sessions\/[^/]+$/;

const notifications = (page) => page.getByRole("region", { name: "通知" });
/** The child composer's picker — the main composer has one with the same name. */
const picker = (page) => page.locator('[data-testid="dock"] button[aria-label="思考等级"]');
const refusalLine = (page) => page.getByRole("alert").filter({ hasText: "没能切换思考等级" });

/** Register a user, wire the mock model into their Project, create one session. */
async function provisionSession(page, username) {
  await provisionAndLogin(page.request, username, P);
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
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
  expect(put.ok(), "put models").toBeTruthy();
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8" } },
  );
  expect(created.ok(), `create session: ${await created.text()}`).toBeTruthy();
  return (await created.json()).session.sessionId;
}

/** Pick a level from the picker's menu (the trigger carries the plain name, the row the wire value). */
async function pick(page, row) {
  await picker(page).click();
  await page.getByRole("button", { name: row, exact: true }).click();
}

/** No announcement either: the sentence above the card is the whole account (7.111's rule). */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notifications(page).getByRole("button").count()).toBe(0);
}

test("a pin the child refuses says why above its composer and leaves the picker on the level it runs", async ({
  page,
}) => {
  const sessionId = await provisionSession(page, "subthinkfail");

  await page.goto(`${BASE}/chat/${sessionId}`);
  // The MAIN composer: the panel brings a second ChatInput once the agents tab is up.
  const main = page.locator('textarea:not([data-testid="dock"] textarea)');
  await main.waitFor();
  await main.fill("run a subagent");
  await page.locator('button[aria-label="发送"]:not([data-testid="dock"] *)').click();

  // The panel opens itself on the live spawn; this spec needs the child composer.
  await expect(
    page.locator('[data-testid="dock"] [data-tab-id="agents"][data-active="true"]'),
  ).toBeVisible();
  // The parent's turn ends, so the child is idle and the pick below is an ordinary pick.
  await expect(page.getByText("Command finished; the result looks as expected.")).toBeVisible();
  await expect(picker(page)).toBeVisible();
  // What the child runs at, resolved by the panel (spawn-pinned level, else the parent's).
  const ran = await picker(page).innerText();

  const pinned = [];
  await page.route(PATCH_ROUTE, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    pinned.push(route.request().url());
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await pick(page, "高 (high)");

  // The sentence names the action, carries the interface's own words for that code, and says
  // nothing about the Agent's default (a child's pin is the child's alone).
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能切换思考等级：${REASON}`);
  await expect(line).not.toContainText("Agent");
  await expect(line).not.toContainText("RAW ENGLISH");
  // The picker never adopted the pick, and nothing was announced twice.
  await expect(picker(page)).toHaveText(ran);
  await expectNoToast(page);

  // Past the six seconds a notification lived: the sentence is still above the card.
  await page.waitForTimeout(7000);
  await expect(line).toHaveText(`没能切换思考等级：${REASON}`);
  await expect(picker(page)).toHaveText(ran);

  // The retry from the same picker lands: the sentence goes, and the child carries the pin.
  expect(pinned).toHaveLength(1);
  const childId = pinned[0].split("/").pop();
  await page.unroute(PATCH_ROUTE);
  await pick(page, "高 (high)");
  await expect(picker(page)).toContainText("高");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(async () => {
      const row = await (await page.request.get(`${BASE}/api/sessions/${childId}`)).json();
      return row.session.thinkingLevel;
    })
    .toBe("high");
});
