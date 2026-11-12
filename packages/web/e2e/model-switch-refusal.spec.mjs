/**
 * Regression: a model switch the server refused keeps the confirm card open with the reason in it,
 * instead of closing the card and leaving a notification that dismisses itself after six seconds.
 *
 * The card is what asked for the write, and its button is the retry: the conversation is still on
 * the model it was on, so a card that closed itself plus a toast nobody read is the whole account of
 * a press that changed nothing. The sentence is drawn in the card's `refusal` slot (`role="alert"`,
 * the app's shared `操作被拒绝：<reason>` lead) and stays until the next attempt, a new pick, cancel.
 *
 * Both refusals here are stubbed with an English wire message: the first carries a code the
 * interface translates generically, the second a code it has its own words for (the target model is
 * unavailable) — so the test also pins that the user never reads the server's raw English.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const FROM = "claude-4-8";
const TO = "claude-4-7";
/** The mock's turn-2 answer (mock-llm.mjs): the conversation is over and the Session idle. */
const REPLY = "Command finished; the result looks as expected.";
/** A message that must not reach the page: only the interface's own words may. */
const RAW = "RAW ENGLISH SERVER MESSAGE";

const notifications = (page) => page.getByRole("region", { name: "通知" });

/** Log in, and give the new user's Project the two mock models this spec switches between. */
async function setUp(page, user) {
  await provisionAndLogin(page.request, user, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: FROM },
      models: [
        {
          provider: "custom",
          modelId: FROM,
          apiKey: "sk-mock",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
        {
          provider: "custom",
          modelId: TO,
          apiKey: "sk-mock",
          baseUrl: MOCK,
          contextWindow: 100000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  return projectId;
}

async function createSession(page, projectId) {
  const sess = await (
    await page.request.post(`${BASE}/api/projects/${projectId}/agents/default_agent/sessions`, {
      data: { provider: "custom", modelId: FROM, approvalMode: "allow-all" },
    })
  ).json();
  return sess.session.sessionId;
}

/** A Session with one finished round, so a switch has something to compact. */
async function sessionWithConversation(page, projectId) {
  const sessionId = await createSession(page, projectId);
  await page.goto(`${BASE}/chat/${sessionId}`);
  const composer = page.getByPlaceholder(/输入消息/);
  await composer.waitFor();
  await composer.fill("hello");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText(REPLY).first()).toBeVisible();
  return sessionId;
}

/** Open the composer's model picker, pick the other model, and hand back the confirm dialog. */
async function askToSwitch(page) {
  const trigger = page.getByRole("button", { name: "选择模型" }).first();
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "选择模型" });
  await expect(picker).toBeVisible();
  await picker.locator('li[role="option"]').filter({ hasText: TO }).locator("button").click();
  const dialog = page.getByRole("dialog", { name: "切换模型" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The Session's own model, read from the server rather than from the page. */
async function sessionModel(page, projectId, sessionId) {
  const body = await (
    await page.request.get(`${BASE}/api/projects/${projectId}/agents/default_agent/sessions`)
  ).json();
  const row = body.sessions.find((s) => s.sessionId === sessionId);
  return row?.modelId ?? null;
}

test("a refused switch keeps the card and the reason inside it, and the retry is the same button", async ({
  page,
}) => {
  const projectId = await setUp(page, "swrefusal1");
  const sessionId = await sessionWithConversation(page, projectId);

  const posted = [];
  let refuse = true;
  await page.route("**/api/sessions/*/switch-model", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posted.push(route.request().postDataJSON());
    if (!refuse) return route.fallback();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: RAW } }),
    });
  });

  const dialog = await askToSwitch(page);
  await dialog.getByRole("button", { name: "压缩并切换" }).click();

  const reason = "操作被拒绝：服务器内部错误，请稍后重试。";
  const line = dialog.getByRole("alert");
  await expect(line).toBeVisible();
  await expect(line).toHaveText(reason);
  // The interface's words for that code, never the server's English — and in the card, not in
  // the notification region.
  await expect(line).not.toContainText("RAW ENGLISH");
  await expect(notifications(page)).not.toContainText("RAW ENGLISH");

  // Past the six seconds an error notification lived, the card and its sentence are still there.
  await page.waitForTimeout(7500);
  await expect(dialog).toBeVisible();
  await expect(line).toHaveText(reason);
  // Nothing moved: the Session is still on the model the dialog promised to leave.
  expect(await sessionModel(page, projectId, sessionId)).toBe(FROM);

  // The retry is the same button: the sentence of the attempt before it goes, this one lands.
  refuse = false;
  await dialog.getByRole("button", { name: "压缩并切换" }).click();
  await expect(page.getByText(`正在用「${FROM}」压缩上下文`).first()).toBeVisible();
  await expect(page.getByRole("dialog", { name: "切换模型" })).toHaveCount(0);
  expect(posted).toHaveLength(2);
});

test("the refusal names the target model, and cancel takes it away for the next pick", async ({
  page,
}) => {
  const projectId = await setUp(page, "swrefusal2");
  await sessionWithConversation(page, projectId);

  await page.route("**/api/sessions/*/switch-model", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "model_unavailable", message: RAW } }),
    });
  });

  const dialog = await askToSwitch(page);
  await dialog.getByRole("button", { name: "压缩并切换" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "操作被拒绝：所选模型暂不可用（例如还没有 API key），请先在「模型」页配置。",
  );

  // Cancel closes it, and the next pick opens a clean card: that sentence answered that attempt.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("dialog", { name: "切换模型" })).toHaveCount(0);
  const again = await askToSwitch(page);
  await expect(again.getByRole("alert")).toHaveCount(0);
  await expect(again.getByRole("button", { name: "压缩并切换" })).toBeEnabled();
});
