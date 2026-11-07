/**
 * Regression: a thinking level the write refused keeps the reason above the input card instead of
 * in a notification that dismisses itself after six seconds.
 *
 * Both pickers write the picked level straight through and then display the level they read back,
 * so a refused write changes nothing on screen: the trigger still reads the level it read before
 * and is the retry. That left a press that looked as though it had never registered, with the
 * reason vanishing six seconds later. The sentence is drawn above the card now (`role="alert"`,
 * danger colour, two lines, the whole sentence on hover) and stays until the next attempt starts.
 *
 * The draft's picker writes through to the Agent settings, so its sentence says the Agent's default
 * is unchanged too; the Session's picker only pins this conversation and must not mention the
 * Agent. Both writes are stubbed with a 500 carrying a code the interface has its own copy for plus
 * an English wire message — that is how the test tells the localized sentence from the raw one.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The refusal: a code the interface translates, plus a message that must not reach the page. */
const REFUSAL = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** The line the page draws for that code (S.errors.byCode), after what failed. */
const REASON = "服务器内部错误，请稍后重试。";

const notifications = (page) => page.getByRole("region", { name: "通知" });
const thinkingBtn = (page) => page.getByRole("button", { name: "思考等级" });
const refusalLine = (page) => page.getByRole("alert").filter({ hasText: "没能切换思考等级" });

/**
 * Provision a user and give the Project a model (without one the onboarding overlay covers the
 * pages). No model is ever called: both writes measured here are stubbed.
 */
async function provision(page, userId) {
  await provisionAndLogin(page.request, userId, "password123");
  const projects = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects.projects[0].projectId;
  const models = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
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
  expect(models.ok(), "put models").toBeTruthy();
  return projectId;
}

/** Pick a level from the picker's menu (the trigger carries the plain name, the row the wire value). */
async function pick(page, row) {
  await thinkingBtn(page).click();
  await page.getByRole("button", { name: row, exact: true }).click();
}

/** What one refusal looks like on the page, at the moment it lands and past the six seconds. */
async function expectRefusalKept(page, text) {
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(text);
  // The interface's own words for that code, never the server's English message — and the reason
  // is the card's, not a notification's.
  await expect(line).not.toContainText("RAW ENGLISH");
  await expect(notifications(page)).not.toContainText("RAW ENGLISH");

  // Past the six seconds an error notification lived: the sentence is still above the card.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(text);
}

test("a refused draft pick keeps the reason above the card and leaves it reading the old level", async ({
  page,
}) => {
  const projectId = await provision(page, "thinkingrefusal1");
  await page.goto(`${BASE}/chat/new`);
  await expect(thinkingBtn(page)).toContainText("中");

  const writes = [];
  let refuse = true;
  await page.route("**/api/projects/*/agents/*/config", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    writes.push(route.request().postDataJSON());
    if (!refuse) return route.fallback();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await pick(page, "高 (high)");

  // The draft's picker writes through to the Agent settings, so the sentence says so.
  await expectRefusalKept(page, `没能切换思考等级（同时是 Agent 的默认档，没有改动）：${REASON}`);
  // The write changed nothing: the trigger still reads the level it read before, and is the retry.
  await expect(thinkingBtn(page)).toContainText("中");
  const cfg = await (
    await page.request.get(`${BASE}/api/projects/${projectId}/agents/default_agent/config`)
  ).json();
  expect(cfg.config.model?.thinkingLevel ?? null).not.toBe("high");

  // The retry is the same picker: the sentence of the attempt before it goes, and this one lands.
  refuse = false;
  await pick(page, "高 (high)");
  await expect(thinkingBtn(page)).toContainText("高");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(async () => {
      const again = await (
        await page.request.get(`${BASE}/api/projects/${projectId}/agents/default_agent/config`)
      ).json();
      return again.config.model?.thinkingLevel;
    })
    .toBe("high");
  expect(writes).toHaveLength(2);
});

test("a refused session pick keeps the reason and does not claim the Agent default changed", async ({
  page,
}) => {
  const projectId = await provision(page, "thinkingrefusal2");
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "always-ask" } },
  );
  expect(created.ok(), `create session: ${await created.text()}`).toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;

  await page.goto(`${BASE}/chat/${sessionId}`);
  await expect(thinkingBtn(page)).toContainText("中");

  let refuse = true;
  await page.route(`**/api/sessions/${sessionId}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    if (!refuse) return route.fallback();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await pick(page, "高 (high)");

  // Pinning a conversation says nothing about the Agent's default — the sentence must not mention it.
  const text = `没能切换思考等级：${REASON}`;
  await expectRefusalKept(page, text);
  await expect(refusalLine(page)).not.toContainText("Agent");
  await expect(thinkingBtn(page)).toContainText("中");

  // The retry from the same picker lands: the sentence goes and the Session carries the pin.
  refuse = false;
  await pick(page, "高 (high)");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(async () => {
      const row = await (await page.request.get(`${BASE}/api/sessions/${sessionId}`)).json();
      return row.session.thinkingLevel;
    })
    .toBe("high");
});
