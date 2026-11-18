/**
 * A Stop pressed in the subagent panel's composer that the server did not take says why above that
 * box.
 *
 * The panel's child composer aborts only the child's CURRENT run (its route answers 202, or 204
 * when there is nothing left to stop), and the catch behind it was `catch(() => undefined)`: a 500
 * left the panel exactly as it looked before the press — the child still running, the same Stop
 * button — with no word anywhere, not even the six-second notification the chat card's own Stop
 * used to raise (7.19's rule).
 *
 * Now the reason is drawn above that box (`subagent-stop-refusal`), in the panel's own words: this
 * line sits next to the parent conversation's card, so it names WHICH run is still going. It goes
 * with the run — the child going idle takes it away — never by a timer. A 404 says nothing: it is
 * the parent Session that is gone, and the run went with it.
 *
 * The child is the mock's deliberately slow one: the prompt "slow subagent test" hands down a
 * prompt whose own turn runs `sleep 45` in the foreground, so the run is up when Stop is pressed
 * and stays up for the whole check (the refused abort never reaches the server). The POST is
 * refused at `page.route`.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";

/** The refusal: a code the interface translates, plus a message that must not reach the page. */
const REFUSED = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** The line the page draws for that code (S.subagentPanel.stopRefused + the `internal` sentence). */
const EXPECTED = "没能停下这个子会话的这次运行，它仍在继续：服务器内部错误，请稍后重试。";

/** The notification region: a refused Stop must be said above the box, not announced up here. */
const notifications = (page) => page.getByRole("region", { name: "通知" });

/**
 * Nothing was raised in the notification region, read at once.
 *
 * `toHaveCount(0)` retries for the whole expect timeout, so it would also pass against a toast that
 * expired after six seconds — the behaviour this file exists to rule out. This reads the count once,
 * after a short settle so the refusal's own render has landed.
 */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notifications(page).getByRole("button").count()).toBe(0);
}

/** Provision the user, aim the Project's model at the mock, and open a fresh allow-all Session. */
async function openSession(page, user) {
  await provisionAndLogin(page.request, user, "password123");
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
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
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;
  await page.goto(`${BASE}/chat/${sessionId}`);
  return sessionId;
}

/**
 * Send the slow-delegation prompt from the MAIN composer and open the agents panel on the child.
 *
 * The panel carries a second `ChatInput` (the same component in its subagent variant), so every
 * one of the main composer's parts is "outside the dock" — the rule subagent.spec.mjs uses.
 */
async function spawnSlowChild(page) {
  const ta = page.locator('textarea:not([data-testid="dock"] textarea)');
  await ta.waitFor();
  await ta.fill("slow subagent test");
  await page.locator('button[aria-label="发送"]:not([data-testid="dock"] *)').click();

  // The chip is visible while the child runs; the group around it only collapses once the turn is
  // over, and this child runs for 45 s, so a plain wait for it is enough.
  const chip = page.getByRole("button", { name: /子会话/ }).first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await chip.click();
  await expect(
    page.locator('[data-testid="dock-tab"][data-tab-id="agents"][data-active="true"]'),
  ).toBeVisible({ timeout: 15_000 });
}

/** The child composer's action button while its run is up — inside the dock, and only there. */
const childStop = (page) => page.locator('[data-testid="dock"] button[aria-label="停止"]');

test("a refused Stop in the subagent panel says why above that box, stays there, and the same button is the retry", async ({
  page,
}) => {
  await openSession(page, "substoprefused");
  await spawnSlowChild(page);
  const stop = childStop(page);
  await expect(stop).toBeVisible({ timeout: 30_000 });

  await page.route("**/api/sessions/*/subagents/*/abort", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSED }),
    }),
  );

  await stop.click();
  const refusal = page.getByTestId("subagent-stop-refusal");
  await expect(refusal).toBeVisible();
  // The panel's sentence, not the wire's English, and it names the run that is still going.
  await expect(refusal).toHaveText(EXPECTED);
  await expect(refusal).toHaveAttribute("role", "alert");
  await expect(refusal).not.toContainText("RAW ENGLISH");
  // Nothing was stopped: the child is still up, and that same button is the retry.
  await expect(stop).toBeVisible();
  await expectNoToast(page);

  // It does not dismiss itself: four seconds later the run is still going and so is the sentence.
  await page.waitForTimeout(4000);
  await expect(refusal).toBeVisible();
  await expect(stop).toBeVisible();
  // It never took either slot the main card owns.
  expect(await page.getByTestId("stop-refusal").count()).toBe(0);
  expect(await page.getByTestId("send-refusal").count()).toBe(0);
  expect(await page.getByTestId("subagent-send-refusal").count()).toBe(0);

  // Let the same button through: the child's run is aborted, and the sentence goes with the run.
  await page.unroute("**/api/sessions/*/subagents/*/abort");
  await stop.click();
  await expect(stop).toHaveCount(0, { timeout: 30_000 });
  await expect(refusal).toHaveCount(0);
});

test("a Stop answered 404 says nothing at all — the Session it asked about is gone", async ({
  page,
}) => {
  await openSession(page, "substopgone");
  await spawnSlowChild(page);
  const stop = childStop(page);
  await expect(stop).toBeVisible({ timeout: 30_000 });

  await page.route("**/api/sessions/*/subagents/*/abort", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "session_not_found", message: "RAW ENGLISH" } }),
    }),
  );

  await stop.click();
  // Read once, after the press has had time to render: a sentence about a stop without a subject
  // would outlive the Session, so nothing is drawn where a refusal of anything else would be.
  await page.waitForTimeout(800);
  expect(await page.getByTestId("subagent-stop-refusal").count()).toBe(0);
  expect(await page.getByTestId("subagent-send-refusal").count()).toBe(0);
  expect(await page.getByTestId("stop-refusal").count()).toBe(0);
  await expectNoToast(page);
  // The run itself is untouched by the refused press: Stop is still the button on the box.
  await expect(stop).toBeVisible();
});
