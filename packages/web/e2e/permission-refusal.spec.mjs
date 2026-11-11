/**
 * Regression: a permission preset the write refused keeps the reason above the input card instead
 * of in a notification that dismisses itself after six seconds.
 *
 * The permission button shows the pick at once, then re-reads the Session once the PATCH settles —
 * so a refusal puts the old level back and that button is the retry. The route checks every field
 * before writing any, so a refusal stores nothing. Before this, the reason lived only in a toast:
 * the press looked as though it had never registered, and six seconds later nothing said why.
 * This is the thinking level's slot (7.95) and the same shape; the sentence says the Session kept
 * the permission it had, because a reverted button cannot show that on its own.
 *
 * The write is stubbed with a 500 carrying a code the interface has its own copy for plus an
 * English wire message — that is how the test tells the localized sentence from the raw one.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";

/** The refusal: a code the interface translates, plus a message that must not reach the page. */
const REFUSAL = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** The line the page draws for that code (S.errors.byCode), after what failed. */
const REASON = "服务器内部错误，请稍后重试。";

const notifications = (page) => page.getByRole("region", { name: "通知" });
/** The permission button: icon-only, its accessible name carries the level it reads. */
const permissionBtn = (page) => page.locator('button[aria-label^="权限: "]');
const refusalLine = (page) => page.getByTestId("permission-refusal");

/**
 * Provision a user, give the Project a model (without one the onboarding overlay covers the page),
 * and create one Session whose approval mode this file then tries to change. No model is called.
 */
async function sessionWithModel(page, userId) {
  await provisionAndLogin(page.request, userId, "password123");
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
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
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "always-ask" } },
  );
  expect(created.ok(), `create session: ${await created.text()}`).toBeTruthy();
  return (await created.json()).session.sessionId;
}

/** The Session's stored approval mode, as the server holds it. */
async function storedApprovalMode(page, sessionId) {
  const row = await (await page.request.get(`${BASE}/api/sessions/${sessionId}`)).json();
  return row.session.approvalMode;
}

test("a refused permission pick keeps the reason above the card and leaves the Session as it was", async ({
  page,
}) => {
  const sessionId = await sessionWithModel(page, "r226permrefuse");
  await page.goto(`${BASE}/chat/${sessionId}`);
  await expect(permissionBtn(page)).toHaveAttribute("aria-label", "权限: 总是询问");
  await expect(refusalLine(page)).toHaveCount(0);

  const writes = [];
  let refuse = true;
  await page.route(`**/api/sessions/${sessionId}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    writes.push(route.request().postDataJSON());
    if (!refuse) return route.fallback();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await permissionBtn(page).click();
  await page.getByRole("menuitemradio", { name: /全部放行/ }).click();

  // The sentence is above the card, in the interface's own words, and stays past the six seconds
  // an error notification lived.
  const text = `没能切换权限（会话仍是原来的权限）：${REASON}`;
  await expect(refusalLine(page)).toHaveCount(1);
  await expect(refusalLine(page)).toHaveText(text);
  await expect(refusalLine(page)).not.toContainText("RAW ENGLISH");
  await expect(notifications(page)).not.toContainText("RAW ENGLISH");
  await page.waitForTimeout(7000);
  await expect(refusalLine(page)).toHaveCount(1);
  await expect(refusalLine(page)).toHaveText(text);

  // The refusal wrote nothing: the button reads the level it read before (the retry) and the
  // Session on the server still holds the old approval mode.
  await expect(permissionBtn(page)).toHaveAttribute("aria-label", "权限: 总是询问");
  expect(await storedApprovalMode(page, sessionId)).toBe("always-ask");
  expect(writes).toHaveLength(1);

  // The retry is the same button: this time the write lands, the sentence goes, and the Session
  // carries the pick.
  refuse = false;
  await permissionBtn(page).click();
  await page.getByRole("menuitemradio", { name: /全部放行/ }).click();
  await expect(refusalLine(page)).toHaveCount(0);
  await expect(permissionBtn(page)).toHaveAttribute("aria-label", "权限: 全部放行");
  await expect.poll(async () => storedApprovalMode(page, sessionId)).toBe("allow-all");
  expect(writes).toHaveLength(2);
});
