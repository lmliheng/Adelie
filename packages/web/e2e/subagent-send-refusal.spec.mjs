/**
 * Regression: a message the subagent panel could not deliver leaves its reason above the box that
 * still holds the text, instead of in a six-second toast.
 *
 * The child composer deliberately keeps what was typed when `onSend` answers `false` — so after a
 * refusal the reader is still looking at the message they meant to send, with the same button to
 * retry it. The reason used to be a notification: it floated over the panel, dismissed itself after
 * six seconds, and left a composer that read exactly as it did before the press.
 *
 * The message POST is stubbed at `page.route` for the refusal half, so the child's own run is not
 * what is being measured; the second half lets the same route through again and watches the line
 * go, because it belongs to the attempt that produced it.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** The child's route: one message into one subagent child of one session. */
const MESSAGE_ROUTE = /\/api\/sessions\/[^/]+\/subagents\/[^/]+\/message$/;

/** The refusal the stub answers with: a 500 whose words must come back into the panel. */
const REFUSAL = { code: "subagent_busy", message: "the subagent is mid-rewrite" };

/** Register a user, wire the mock model into their auto-provisioned Project, create one session. */
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
  const sessRes = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8" } },
  );
  expect(sessRes.ok(), `create session: ${await sessRes.text()}`).toBeTruthy();
  return (await sessRes.json()).session.sessionId;
}

test("a message the child composer cannot deliver says why above the box, and keeps saying it", async ({
  page,
}) => {
  const sessionId = await provisionSession(page, "subsendfail");

  await page.goto(`${BASE}/chat/${sessionId}`);
  // The MAIN composer: the panel brings a second ChatInput once the agents tab is up.
  const main = page.locator('textarea:not([data-testid="dock"] textarea)');
  await main.waitFor();
  await main.fill("run a subagent");
  await page.locator('button[aria-label="发送"]:not([data-testid="dock"] *)').click();

  // The panel opens itself on the live spawn; this spec needs the child composer, not the chip.
  await expect(
    page.locator('[data-testid="dock"] [data-tab-id="agents"][data-active="true"]'),
  ).toBeVisible();
  // The parent's turn ends, so the child is idle and the send below is an ordinary send.
  await expect(page.getByText("Command finished; the result looks as expected.")).toBeVisible();
  const child = page.locator('[data-testid="dock"] textarea').first();
  await child.waitFor();

  await page.route(MESSAGE_ROUTE, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    }),
  );

  const refusal = page.getByTestId("subagent-send-refusal");
  await child.fill("one more thing");
  await child.press("Enter");

  // The sentence names the action and carries the server's own words, right where the retry is.
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText("消息没有送到子会话");
  await expect(refusal).toContainText(REFUSAL.message);
  // It is not a toast: the notification region never carries that sentence, and the draft is
  // still in the box.
  const notifications = page.getByRole("region", { name: "通知" });
  await expect(notifications.getByText(REFUSAL.message)).toHaveCount(0);
  await expect(child).toHaveValue("one more thing");

  // Past the six seconds an error notification lives: the line is still there.
  await page.waitForTimeout(7000);
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText(REFUSAL.message);
  await expect(child).toHaveValue("one more thing");

  // The next attempt clears it before it leaves — and a delivery that lands leaves nothing behind.
  await page.unroute(MESSAGE_ROUTE);
  await page.route(MESSAGE_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ outcome: "started" }),
    }),
  );
  await child.press("Enter");
  await expect(refusal).toHaveCount(0);
});
