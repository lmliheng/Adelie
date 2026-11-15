/**
 * Regression: a message that does not get out of an existing conversation keeps the reason above
 * the input card instead of in a notification that dismisses itself after six seconds.
 *
 * Sending is this card's only write, and a refusal changes nothing else on screen — the text, the
 * staged files and the send button all stay, so the button that asked is the retry. What used to be
 * missing was the reason: it arrived as a toast over the card, was gone six seconds later, and the
 * screen then read exactly as it had before the press. The sentence is drawn above the card now
 * (`role="alert"`, danger colour, two lines, the whole sentence on hover) and stays until the next
 * attempt starts. The draft screen's first send already worked this way (draft-send-refusal).
 *
 * The POST is stubbed with a code the interface has its own copy for, plus an English wire message —
 * that is how the tests tell the localized sentence from the raw one. Everything else stays real,
 * so the retry at the end is an ordinary send answered by the mock model.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const U = "sendrefusaluser";
const MESSAGE = "这条先发不出去";
/** The interface's own sentence for `internal`; the stubbed English message must never reach it. */
const REASON = "服务器内部错误，请稍后重试。";

const notifications = (page) => page.getByRole("region", { name: "通知" });
const refusalLine = (page) => page.getByTestId("send-refusal");
const sendButton = (page) => page.getByRole("button", { name: "发送", exact: true });
const composer = (page) => page.getByPlaceholder(/输入消息/);

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

/** Provision the user, aim the Project's model at the mock, and create the Session to talk in. */
async function sessionWithMock(page) {
  await provisionAndLogin(page.request, U, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
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
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  return (await created.json()).session.sessionId;
}

/** Refuse the next task POST with `code`, recording each attempt's body. */
async function refuseTaskPosts(page, writes) {
  const state = { code: "internal" };
  await page.route("**/api/sessions/*/tasks", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    writes.push(route.request().postDataJSON());
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: state.code, message: "RAW ENGLISH SERVER MESSAGE" } }),
    });
  });
  return state;
}

test("a refused send keeps the reason above the card, past six seconds", async ({ page }) => {
  const sessionId = await sessionWithMock(page);
  await page.goto(`${BASE}/chat/${sessionId}`);
  const box = composer(page);
  await expect(box).toBeVisible();
  await box.fill(MESSAGE);

  const writes = [];
  const stub = await refuseTaskPosts(page, writes);

  await sendButton(page).click();
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能发出这条消息：${REASON}`);
  // The interface's own words for that code, never the server's English message.
  await expect(line).not.toContainText("RAW ENGLISH");
  await expectNoToast(page);

  // Where it sits: above the card that asked, so the button pressed is still under it.
  const lineBox = await line.boundingBox();
  const cardBox = await box.boundingBox();
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(cardBox.y + 1);

  // Nothing was written, so the card still holds the message and the button that retries it.
  await expect(box).toHaveValue(MESSAGE);
  await expect(sendButton(page)).toBeEnabled();

  // Past the six seconds a notification lived: the sentence is still above the card.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能发出这条消息：${REASON}`);

  // The retry is the same button: this one goes out, and the sentence of the attempt before goes.
  await page.unrouteAll();
  await sendButton(page).click();
  await expect(page.getByText(MESSAGE).first()).toBeVisible({ timeout: 30_000 });
  await expect(refusalLine(page)).toHaveCount(0);
});

test("a second attempt replaces the sentence instead of stacking one more", async ({ page }) => {
  const sessionId = await sessionWithMock(page);
  await page.goto(`${BASE}/chat/${sessionId}`);
  const box = composer(page);
  await expect(box).toBeVisible();
  await box.fill(MESSAGE);

  const writes = [];
  const stub = await refuseTaskPosts(page, writes);

  await sendButton(page).click();
  await expect(refusalLine(page)).toHaveText(`没能发出这条消息：${REASON}`);

  // The conversation is gone elsewhere: the second attempt is refused with another code, and the
  // composer speaks that one — one line, not two.
  stub.code = "not_found";
  await sendButton(page).click();
  const line = refusalLine(page);
  await expect(line).toHaveText("没能发出这条消息：资源不存在，或你没有访问权限。");
  await expect(line).toHaveCount(1);
  await expectNoToast(page);
  await expect(box).toHaveValue(MESSAGE);
  expect(writes).toHaveLength(2);
});
