/**
 * Regression: a draft's first message that does not go out keeps the reason under the input card
 * instead of in a notification that dismisses itself after six seconds.
 *
 * Sending from /chat/new is the page's only write: it creates the Session and posts its first
 * task, and when either half is refused nothing is persisted — an empty Session the first half
 * created is deleted again — while the text and the staged files stay in the composer, whose send
 * button is the retry. What used to be missing was the reason: it arrived as a toast over the
 * card, was gone six seconds later, and the screen then read exactly as it had before the press.
 * The sentence is drawn under the card now (`role="alert"`, danger colour, two lines, the whole
 * sentence on hover) and stays until the next attempt starts.
 *
 * Both writes are stubbed (a 500 carrying a code the interface has its own copy for, plus an
 * English wire message — that is how the tests tell the localized sentence from the raw one);
 * everything else stays real, including the Session the second case creates and deletes.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The refusal: a code the interface translates, plus a message that must not reach the page. */
const REFUSAL = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** The line the page draws for that code (S.errors.byCode), after what failed. */
const REASON = "服务器内部错误，请稍后重试。";
const MESSAGE = "第一条消息：这条发不出去";

const notifications = (page) => page.getByRole("region", { name: "通知" });
const refusalLine = (page) => page.getByRole("alert").filter({ hasText: "没能发出这条消息" });
const sendButton = (page) => page.getByRole("button", { name: "发送" });

/**
 * Provision a user, give the Project a model (without one the onboarding overlay covers the draft
 * page), and open /chat/new with a message typed into the composer. No model is ever called: the
 * writes measured here are stubbed.
 */
async function openDraft(page, userId) {
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

  await page.goto(`${BASE}/chat/new`);
  const box = page.locator("textarea");
  await expect(box).toBeVisible();
  await box.fill(MESSAGE);
  return { projectId, box };
}

/** What one refusal looks like on the page, at the moment it lands and past the six seconds. */
async function expectRefusalKept(page) {
  const line = refusalLine(page);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能发出这条消息：${REASON}`);
  // The interface's own words for that code, never the server's English message.
  await expect(line).not.toContainText("RAW ENGLISH");
  // The reason is the card's, not a notification's.
  await expect(notifications(page)).not.toContainText("RAW ENGLISH");

  // Past the six seconds an error notification lived: the sentence is still under the card.
  await page.waitForTimeout(7000);
  await expect(line).toBeVisible();
  await expect(line).toHaveText(`没能发出这条消息：${REASON}`);
  return line;
}

test("a refused first send keeps the reason under the card, past six seconds", async ({ page }) => {
  const { box } = await openDraft(page, "draftsendrefusal");
  const writes = [];
  let refuse = true;
  await page.route("**/api/projects/*/agents/*/sessions", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    writes.push(route.request().postDataJSON());
    if (!refuse) return route.fallback();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await sendButton(page).click();
  await expectRefusalKept(page);

  // Nothing was written, so the card still holds the message and the button that retries it.
  await expect(box).toHaveValue(MESSAGE);
  await expect(sendButton(page)).toBeEnabled();

  // The retry is the same button: the sentence of the attempt before it goes, and this one lands.
  refuse = false;
  await sendButton(page).click();
  await page.waitForURL(/\/chat\/session-/);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(writes).toHaveLength(2);
});

test("a first message refused after the Session was created leaves the reason and no empty Session", async ({
  page,
}) => {
  const { box } = await openDraft(page, "draftsendrefusal2");
  let createdId = null;
  await page.route("**/api/sessions/*/tasks", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    createdId = new URL(route.request().url()).pathname.split("/")[3];
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await sendButton(page).click();
  await expectRefusalKept(page);
  await expect(box).toHaveValue(MESSAGE);

  // The Session the first half created is deleted again: resending must not pile up empty ones.
  await expect
    .poll(() => page.request.get(`${BASE}/api/sessions/${createdId}`).then((r) => r.status()))
    .toBe(404);
  // Still a draft: nobody was taken to a conversation that never got its message.
  await expect(page).toHaveURL(/\/chat\/new$/);
  await expect(sendButton(page)).toBeEnabled();
});
