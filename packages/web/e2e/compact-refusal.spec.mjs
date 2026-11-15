/**
 * Regression: a `/compact` the server will not start keeps the reason above the input card, instead
 * of in a notification that dismisses itself after six seconds.
 *
 * `/compact` is the one press in the composer that posts nothing: it asks the server to close the
 * context. The route answers 202 when it starts and 409 when it will not (this Agent has no
 * compaction configured, there is nothing to compact yet, it was just compacted) — and then nothing
 * was written either: the slash token is gone from the box because running a command consumes it,
 * and the conversation is the same one with the same context. A notification over an unchanged
 * screen said nothing six seconds later (7.19's rule), so the reason is drawn above the card now —
 * the slot a refused send uses (`role="alert"`, danger colour, two lines, the whole sentence on
 * hover), scoped to this Session and cleared when the next attempt starts.
 *
 * The first case stubs the route with an English wire message, so the test can tell the interface's
 * own sentence from the raw one; the second drives the real refusal (`nothing_to_compact` on a
 * conversation that never ran) and checks the code's own sentence reaches the card.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const MODEL = "claude-4-8";
/** The interface's own sentence for `internal`; the stubbed English message must never reach it. */
const INTERNAL = "服务器内部错误，请稍后重试。";
/** The interface's own words for the real refusal a conversation that never ran gets. */
const NOTHING_TO_COMPACT = "当前上下文还没有可压缩的内容（尚未完成一轮对话）。";
/** A message that must not reach the page: only the interface's own words may. */
const RAW = "RAW ENGLISH SERVER MESSAGE";

const notifications = (page) => page.getByRole("region", { name: "通知" });
const refusalLine = (page) => page.getByTestId("send-refusal");
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

/**
 * Provision the user, aim the Project's model at the mock, and create the conversation that will be
 * asked to compact. Provisioning is idempotent, so a rerun of this file alone shares one data root
 * with earlier runs.
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
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: MODEL, approvalMode: "allow-all" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  return { projectId, sessionId: (await created.json()).session.sessionId };
}

/** Open the conversation on the card this file presses Send on. */
async function openConversation(page, sessionId) {
  await page.goto(`${BASE}/chat/${sessionId}`);
  const box = composer(page);
  await expect(box).toBeVisible();
  return box;
}

/**
 * Run the real `/compact` command: the slash menu opens on the token, and Enter runs the command,
 * which consumes the token before it asks the server.
 */
async function askForCompaction(page, box) {
  await box.fill("/compact");
  await box.press("Enter");
}

test("a refused compaction keeps the reason above the card, past six seconds", async ({ page }) => {
  const { sessionId } = await setUp(page, "compactrefusaluser");
  const box = await openConversation(page, sessionId);

  const writes = [];
  await page.route("**/api/sessions/*/compact", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    writes.push(route.request().url());
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: RAW } }),
    });
  });

  await askForCompaction(page, box);
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能压缩这段上下文，本会话保持不变：${INTERNAL}`);
  // The interface's own words for that code, never the server's English message.
  await expect(line).not.toContainText("RAW");
  await expectNoToast(page);

  // Where it sits: above the card that asked, so the press is still under it.
  const lineBox = await line.boundingBox();
  const cardBox = await box.boundingBox();
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(cardBox.y + 1);

  // One press, one request: the command asked once and drew one sentence.
  expect(writes).toHaveLength(1);
  await expect(line).toHaveCount(1);
  // The token was consumed; nothing else was typed into the card.
  await expect(box).toHaveValue("");

  // Past the six seconds a notification lived: the sentence is still above the card.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能压缩这段上下文，本会话保持不变：${INTERNAL}`);
});

test("the real refusal names its own reason in the interface's words", async ({ page }) => {
  const { sessionId } = await setUp(page, "compactrefusalreal");
  const box = await openConversation(page, sessionId);

  // Nothing is stubbed: the conversation never ran, so the server answers 409 `nothing_to_compact`.
  await askForCompaction(page, box);
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能压缩这段上下文，本会话保持不变：${NOTHING_TO_COMPACT}`);
  await expect(line).toHaveCount(1);
  await expectNoToast(page);
  await expect(box).toHaveValue("");
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();
});
