/**
 * A layout change does not take away what the subagent panel's child composer holds.
 *
 * The panel is a dock body. Crossing the breakpoint — the desktop right dock ↔ the narrow merged
 * surface — moves the active panel from one mount to the other, which unmounts this body and
 * mounts a fresh one. Measured before this spec (round 267's probe): a half-typed follow-up in the
 * child's box and the refusal line that explained the last press were both gone after the resize,
 * and gone again after coming back, while the child kept running the whole time.
 *
 * Three things have to survive it, because on screen they are still true:
 * - the draft the reader was typing (the Session's draft cache, keyed by the child);
 * - the reason a Stop did not land (it goes with the run — the child going idle takes it away,
 *   never a resize and never a timer);
 * - the reason a message never reached the child (the draft and the same Send button are the retry).
 *
 * The child is the mock's deliberately slow one ("slow subagent test" hands down a prompt whose
 * own turn runs `sleep 45`), so its run outlives every resize here; the refusals are produced by
 * `page.route`, never by the real route.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";

/** The refusal: a code the interface translates, plus a message that must not reach the page. */
const REFUSED = { code: "internal", message: "RAW ENGLISH SERVER MESSAGE" };
/** `S.subagentPanel.stopRefused` + the `internal` sentence. */
const EXPECTED_STOP = "没能停下这个子会话的这次运行，它仍在继续：服务器内部错误，请稍后重试。";

const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 900 };

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

/** Send the slow-delegation prompt from the MAIN composer and open the agents panel on the child. */
async function spawnSlowChild(page) {
  const ta = page.locator('textarea:not([data-testid="dock"] textarea)');
  await ta.waitFor();
  await ta.fill("slow subagent test");
  await page.locator('button[aria-label="发送"]:not([data-testid="dock"] *)').click();
  const chip = page.getByRole("button", { name: /子会话/ }).first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await chip.click();
  await expect(
    page.locator('[data-testid="dock-tab"][data-tab-id="agents"][data-active="true"]'),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * The child composer's box and its action button — the dock that is actually on screen, and only
 * there. Two docks can be mounted at once for the length of a collapse (`use-dock-mount` keeps the
 * closing one through its 200 ms transition), and a closed dock keeps its bodies mounted at zero
 * size after that, so a raw `[data-testid="dock"]` matches two of everything across a resize.
 */
const onScreenDock = (page) => page.locator('[data-testid="dock"]:visible');
const childBox = (page) => onScreenDock(page).locator("textarea");
const childStop = (page) => onScreenDock(page).locator('button[aria-label="停止"]');
const childSend = (page) => onScreenDock(page).locator('button[aria-label="发送"]');
/** A refusal line inside the dock that is on screen (the closed copy is not what the reader sees). */
const onScreenRefusal = (page, testId) => onScreenDock(page).getByTestId(testId);

/**
 * Walk the panel across the breakpoint and back, reading what the box holds on each side.
 *
 * Each side is read only once the move has settled: `page.setViewportSize` re-renders the layout,
 * the dock that loses the panel collapses over 200 ms and the other one grows in its place, so a
 * reading taken mid-transition would be of the dock that is leaving (it still holds the old mount).
 * The dock's own state is per scope and survives, so afterwards it is the same tab on the other
 * mount — which is exactly the remount this file pins.
 */
async function acrossLayouts(page, read) {
  const settle = async (where) => {
    await expect
      .poll(async () => onScreenDock(page).count(), { message: `one dock on screen ${where}` })
      .toBe(1);
    await page.waitForTimeout(250); // the collapse above finishes on a timer (DOCK_TRANSITION_MS)
    expect(await onScreenDock(page).count(), `still one dock ${where}`).toBe(1);
  };
  await page.setViewportSize(NARROW);
  await settle("after narrowing");
  await expect
    .poll(async () => (await childBox(page).count()) > 0, {
      message: "child box on the narrow surface",
    })
    .toBe(true);
  const narrow = await read();
  await page.setViewportSize(WIDE);
  await settle("after widening");
  await expect
    .poll(async () => (await childBox(page).count()) > 0, {
      message: "child box back on the right dock",
    })
    .toBe(true);
  const wideAgain = await read();
  return { narrow, wideAgain };
}

test("a layout change keeps the child's draft and the reason its Stop was refused", async ({
  page,
}) => {
  await openSession(page, "sublayoutstop");
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
  const refusal = onScreenRefusal(page, "subagent-stop-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).toHaveText(EXPECTED_STOP);

  // A half-typed follow-up in the child's box: the second thing a remount used to take away.
  const DRAFT = "换布局前打的这一段";
  await childBox(page).fill(DRAFT);

  const read = async () => ({
    refusal: await onScreenRefusal(page, "subagent-stop-refusal").count(),
    refusalText: (await onScreenRefusal(page, "subagent-stop-refusal").textContent()) ?? null,
    draft: await childBox(page).inputValue(),
    // Nothing went to the notification region on either side of the resize.
    toasts: await page.getByRole("region", { name: "通知" }).getByRole("button").count(),
  });
  const { narrow, wideAgain } = await acrossLayouts(page, read);

  // The sentence reports a press whose answer is still on screen: the child is still running.
  expect(narrow.refusal).toBe(1);
  expect(narrow.refusalText?.trim()).toBe(EXPECTED_STOP);
  expect(narrow.draft).toBe(DRAFT);
  expect(wideAgain.refusal).toBe(1);
  expect(wideAgain.refusalText?.trim()).toBe(EXPECTED_STOP);
  expect(wideAgain.draft).toBe(DRAFT);
  expect(narrow.toasts).toBe(0);
  expect(wideAgain.toasts).toBe(0);

  // The sentence still goes with the run rather than with the mount: clear the draft (an empty box
  // is what puts Stop back on the button), let the same button through, and it leaves with the run.
  await childBox(page).fill("");
  await page.unroute("**/api/sessions/*/subagents/*/abort");
  await childStop(page).click();
  await expect(onScreenRefusal(page, "subagent-stop-refusal")).toHaveCount(0, { timeout: 30_000 });
});

test("a layout change keeps the draft and the reason a message never reached the child", async ({
  page,
}) => {
  await openSession(page, "sublayoutsend");
  await spawnSlowChild(page);
  await expect(childStop(page)).toBeVisible({ timeout: 30_000 });

  await page.route("**/api/sessions/*/subagents/*/message", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSED }),
    }),
  );

  // While the child runs, a text in the box turns the action button into Send (a steer). The
  // refused answer leaves the text where it was — that draft plus that button is the retry.
  const DRAFT = "这条没能送到子会话";
  await childBox(page).fill(DRAFT);
  await childSend(page).click();
  const refusal = onScreenRefusal(page, "subagent-send-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).not.toContainText("RAW ENGLISH");
  const before = (await refusal.textContent())?.trim() ?? "";

  const read = async () => ({
    refusal: await onScreenRefusal(page, "subagent-send-refusal").count(),
    refusalText: (await onScreenRefusal(page, "subagent-send-refusal").textContent()) ?? null,
    draft: await childBox(page).inputValue(),
  });
  const { narrow, wideAgain } = await acrossLayouts(page, read);

  expect(narrow.refusal).toBe(1);
  expect(narrow.refusalText?.trim()).toBe(before);
  expect(narrow.draft).toBe(DRAFT);
  expect(wideAgain.refusal).toBe(1);
  expect(wideAgain.refusalText?.trim()).toBe(before);
  expect(wideAgain.draft).toBe(DRAFT);

  // The parent's own card never took this sentence, on either side of the resize.
  expect(await page.getByTestId("send-refusal").count()).toBe(0);
  expect(await page.getByTestId("stop-refusal").count()).toBe(0);
  // And the panel's Stop refusal slot stayed empty: this press was a message, not a Stop.
  expect(await onScreenRefusal(page, "subagent-stop-refusal").count()).toBe(0);
});

test("a layout change keeps the chips staged above the child's box", async ({ page }) => {
  await openSession(page, "sublayoutchips");
  await spawnSlowChild(page);
  await expect(childStop(page)).toBeVisible({ timeout: 30_000 });

  // The child's own conversation: its prompt is the only user text in it. Selecting a passage
  // there and taking 添加到对话 stages an excerpt chip in the CHILD's composer (the panel's own
  // selection menu hands it to that box) — not in the parent's.
  const EXCERPT = "Slow the TODO count down";
  const passage = onScreenDock(page).getByText(EXCERPT, { exact: true }).first();
  await expect(passage).toBeVisible({ timeout: 30_000 });
  await passage.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await passage.click({ button: "right" });
  const addRow = page.getByRole("menuitem", { name: "添加到对话", exact: true });
  await expect(addRow).toBeVisible();
  await addRow.click();

  const chip = () => onScreenDock(page).locator(`span[data-tooltip="${EXCERPT}"]`);
  await expect(chip()).toBeVisible();
  // The excerpt is a chip, not text: the draft it belongs to is still empty.
  expect(await childBox(page).inputValue()).toBe("");
  // Exactly one chip on the page: the parent's composer, which is mounted the whole time, did
  // not take this staging — the panel's own selection menu handed it to the child's box.
  expect(await page.locator(`span[data-tooltip="${EXCERPT}"]`).count()).toBe(1);

  const read = async () => ({
    chips: await chip().count(),
    // The chip's × is what unstages it, and it has to be there on both sides too.
    remove: await onScreenDock(page)
      .getByRole("button", { name: `移除引用 ${EXCERPT}` })
      .count(),
    draft: await childBox(page).inputValue(),
  });
  const { narrow, wideAgain } = await acrossLayouts(page, read);

  expect(narrow.chips).toBe(1);
  expect(narrow.remove).toBe(1);
  expect(narrow.draft).toBe("");
  expect(wideAgain.chips).toBe(1);
  expect(wideAgain.remove).toBe(1);

  // Unstaged with its own ×, it stays gone across the next layout move — the record kept it
  // only while it was staged.
  await onScreenDock(page)
    .getByRole("button", { name: `移除引用 ${EXCERPT}` })
    .click();
  await expect(chip()).toHaveCount(0);
  const after = await acrossLayouts(page, read);
  expect(after.narrow.chips).toBe(0);
  expect(after.wideAgain.chips).toBe(0);
});
