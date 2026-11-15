/**
 * Regression: a `/agent` handoff that does not get out keeps the reason above the input card,
 * instead of in a notification that dismisses itself after six seconds.
 *
 * A staged `/agent` target turns the composer's Send into "hand this draft over to that Agent": the
 * press opens a NEW conversation and posts the draft as its first message. When either half is
 * refused nothing is written (the empty conversation the first half created is deleted again), the
 * conversation on screen is not touched, and the draft, the staged files and the target chip all
 * stay on the card whose button was pressed — so that button IS the retry. What the reader used to
 * get was a notification over the card: six seconds later the screen read exactly as it had before
 * the press, with the words explaining why gone (7.19's rule). The sentence is drawn above the card
 * now — the same slot an ordinary send uses (`role="alert"`, danger colour, two lines, the whole
 * sentence on hover) — and names the Agent plus the fact that this conversation is unchanged.
 *
 * Every refusal is stubbed at the page's own write (`POST …/agents/<id>/sessions`) with an English
 * wire message, so the test can tell the interface's localized sentence from the raw one. The second
 * case answers `model_credential_missing`, whose body carries no model id: the new conversation is
 * created on the Project's default model, so the sentence has to name that one.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "helper_agent";
const MODEL = "claude-4-8";
const MESSAGE = "这条先交接不出去";
/** The interface's own sentence for `internal`; the stubbed English message must never reach it. */
const INTERNAL = "服务器内部错误，请稍后重试。";
/** The interface's own words for the missing credential, which name the model. */
const CREDENTIAL = `模型 ${MODEL} 还没有可用的 API key，请先在「模型」页为它配置`;
/** A message that must not reach the page: only the interface's own words may. */
const RAW = "RAW ENGLISH SERVER MESSAGE";

const notifications = (page) => page.getByRole("region", { name: "通知" });
const refusalLine = (page) => page.getByTestId("send-refusal");
const sendButton = (page) => page.getByRole("button", { name: "发送", exact: true });
const composer = (page) => page.getByPlaceholder(/输入消息/);
/** The staged handoff chip's own ×: the chip is there while that button is. */
const targetChip = (page) => page.getByRole("button", { name: "移除交接目标" });

/**
 * Nothing was raised in the notification region, read once after the refusal's own render landed.
 *
 * `toHaveCount(0)` retries for the whole expect timeout, so it also passes against a toast that
 * simply expired after six seconds — the very behaviour this file is about.
 */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notifications(page).getByRole("button").count()).toBe(0);
}

/**
 * Provision the user, aim the Project's model at the mock, make sure the handoff target exists, and
 * create the conversation to hand a draft over from. Provisioning is idempotent, so a rerun of this
 * file alone shares one data root with earlier runs.
 */
async function setUp(page, user) {
  await provisionAndLogin(page.request, user, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: MODEL },
      models: [
        {
          provider: "custom",
          modelId: MODEL,
          apiKey: "sk-mock",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  const agent = await page.request.post(`${BASE}/api/projects/${projectId}/agents`, {
    data: { agentId: AGENT },
  });
  expect(agent.ok() || agent.status() === 409, "create handoff target").toBeTruthy();
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: MODEL, approvalMode: "allow-all" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;
  return { projectId, sessionId };
}

/** Every conversation the handoff target holds: a refusal must not leave one behind. */
async function sessionCount(page, projectId) {
  const res = await page.request.get(
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions?limit=100`,
  );
  expect(res.ok(), "list sessions").toBeTruthy();
  const body = await res.json();
  return body.sessions.length;
}

/**
 * Open the conversation, stage the handoff target through the real `/agent` command, and type the
 * message — everything past the stub is the user's own path.
 */
async function stageHandoff(page, sessionId) {
  await page.goto(`${BASE}/chat/${sessionId}`);
  const box = composer(page);
  await expect(box).toBeVisible();
  await box.fill("/agent");
  await box.press("Enter");
  // The picker's rows are buttons carrying the agentId; the pick stages the chip, nothing is sent.
  // Exact: a handoff this file performed on an earlier run is also a sidebar row named after the
  // Agent.
  await page.getByRole("button", { name: AGENT, exact: true }).click();
  await expect(targetChip(page)).toBeVisible();
  await box.fill(MESSAGE);
  return box;
}

/** Refuse the next conversation creation with `code`, recording each attempt's body. */
async function refuseSessionCreates(page, writes, error) {
  await page.route("**/api/projects/*/agents/*/sessions", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    writes.push(route.request().postDataJSON());
    return route.fulfill({
      status: error.status,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: error.code, message: RAW } }),
    });
  });
}

test("a refused handoff keeps the reason above the card, past six seconds", async ({ page }) => {
  const { projectId, sessionId } = await setUp(page, "handoffrefusaluser");
  const box = await stageHandoff(page, sessionId);
  const before = await sessionCount(page, projectId);

  const writes = [];
  await refuseSessionCreates(page, writes, { status: 500, code: "internal" });

  await sendButton(page).click();
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能把这条消息交接给 ${AGENT}，本会话保持不变：${INTERNAL}`);
  // The interface's own words for that code, never the server's English message.
  await expect(line).not.toContainText("RAW");
  await expectNoToast(page);

  // Where it sits: above the card that asked, so the button pressed is still under it.
  const lineBox = await line.boundingBox();
  const cardBox = await box.boundingBox();
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(cardBox.y + 1);

  // Nothing was handed over and nothing was left behind: one attempt, no new conversation, the
  // draft and the target chip both still on the card.
  expect(writes).toHaveLength(1);
  expect(await sessionCount(page, projectId)).toBe(before);
  await expect(box).toHaveValue(MESSAGE);
  await expect(targetChip(page)).toBeVisible();
  await expect(sendButton(page)).toBeEnabled();

  // Past the six seconds a notification lived: the sentence is still above the card.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能把这条消息交接给 ${AGENT}，本会话保持不变：${INTERNAL}`);

  // The retry is the same button: this handoff goes through, and lands in a new conversation.
  await page.unrouteAll();
  await sendButton(page).click();
  await expect(page).toHaveURL(new RegExp(`/chat/(?!${sessionId}$)[\\w-]+$`));
  await expect(page.getByText(MESSAGE)).toBeVisible();
  expect(await sessionCount(page, projectId)).toBe(before + 1);
});

test("a handoff refused for a missing credential names the model the new conversation would use", async ({
  page,
}) => {
  const { sessionId } = await setUp(page, "handoffrefusalmodel");
  const box = await stageHandoff(page, sessionId);

  const writes = [];
  await refuseSessionCreates(page, writes, { status: 400, code: "model_credential_missing" });

  await sendButton(page).click();
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能把这条消息交接给 ${AGENT}，本会话保持不变：${CREDENTIAL}`);
  // One attempt, one sentence: a second refusal replaces the first rather than stacking on it.
  await expect(line).toHaveCount(1);
  await expectNoToast(page);
  await expect(box).toHaveValue(MESSAGE);
  await expect(targetChip(page)).toBeVisible();
});
