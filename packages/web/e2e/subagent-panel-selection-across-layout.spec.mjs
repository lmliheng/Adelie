/**
 * A layout change does not take away WHICH conversation the agents panel is showing.
 *
 * The panel is a dock body. Crossing the breakpoint — the desktop right dock ↔ the narrow merged
 * surface — moves the active panel from one mount to the other, which unmounts this body and
 * mounts a fresh one, so the pick held in the body's own state dies there. Round 268/269 gave the
 * child composer's text, the refusal lines and the staged chips a record to live in across that
 * mount; the pick itself was not in it, so a resize put the panel back on the auto-focus (the
 * displayed Task's first child) and the reader landed in a different conversation than the one
 * they were reading.
 *
 * The graph node's `aria-pressed` IS the shown conversation, and the root node is the cheapest
 * form of "a pick the auto-focus would not make": picking it shows the main-session note instead
 * of the child's conversation. The child is the mock's ordinary one ("run a subagent"), which
 * finishes at once — nothing here depends on a running child.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";
const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 900 };
/** S.subagentPanel.mainSessionNote: what the panel shows when the ROOT node is the pick. */
const ROOT_NOTE = "主会话请在对话区查看";

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

/** Send the delegation prompt from the MAIN composer, then open the agents panel from its chip. */
async function openPanel(page) {
  const ta = page.locator('textarea:not([data-testid="dock"] textarea)');
  await ta.waitFor();
  await ta.fill("run a subagent");
  await page.locator('button[aria-label="发送"]:not([data-testid="dock"] *)').click();
  const chip = page.getByRole("button", { name: /子会话/ }).first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await chip.click();
  await expect(
    page.locator('[data-testid="dock-tab"][data-tab-id="agents"][data-active="true"]'),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * The dock that is actually on screen: two docks can be mounted for the length of a collapse, and
 * a closed dock keeps its bodies mounted at zero size after that.
 */
const onScreenDock = (page) => page.locator('[data-testid="dock"]:visible');

/** The graph nodes in layout order (root first): the pressed one is the shown conversation. */
async function nodeStates(page) {
  return onScreenDock(page)
    .locator('[role="group"] button[aria-pressed]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-pressed") === "true"));
}

/**
 * Cross the breakpoint and read the panel on both sides, once the move has settled (the dock that
 * loses the panel collapses over 200 ms and the other one grows in its place — a reading taken
 * mid-transition would be of the dock that is leaving).
 */
async function acrossLayouts(page, read) {
  const settle = async (where) => {
    await expect
      .poll(async () => onScreenDock(page).count(), { message: `one dock on screen ${where}` })
      .toBe(1);
    await page.waitForTimeout(250); // DOCK_TRANSITION_MS
    expect(await onScreenDock(page).count(), `still one dock ${where}`).toBe(1);
  };
  await page.setViewportSize(NARROW);
  await settle("after narrowing");
  const narrow = await read();
  await page.setViewportSize(WIDE);
  await settle("after widening");
  const wideAgain = await read();
  return { narrow, wideAgain };
}

/** What the panel shows: the pressed node, and whether the root note (the root pick) is up. */
const read = async (page) => ({
  pressed: await nodeStates(page),
  rootNote: await onScreenDock(page).getByText(ROOT_NOTE).count(),
  childBox: await onScreenDock(page).locator("textarea").count(),
});

test("a layout change keeps the root pick the panel was showing", async ({ page }) => {
  await openSession(page, "sublayoutpick");
  await openPanel(page);
  await expect.poll(async () => (await nodeStates(page)).length).toBe(2);

  // The auto-focus is the child; picking the root is the one thing a remount cannot re-derive.
  expect(await read(page)).toMatchObject({ pressed: [false, true], rootNote: 0, childBox: 1 });
  await onScreenDock(page).locator('[role="group"] button[aria-pressed]').first().click();
  const picked = await read(page);
  expect(picked).toMatchObject({ pressed: [true, false], rootNote: 1, childBox: 0 });

  const { narrow, wideAgain } = await acrossLayouts(page, () => read(page));
  expect(narrow).toMatchObject({ pressed: [true, false], rootNote: 1, childBox: 0 });
  expect(wideAgain).toMatchObject({ pressed: [true, false], rootNote: 1, childBox: 0 });
});

test("picking a child back is what the next mount shows, not the first pick ever made", async ({
  page,
}) => {
  await openSession(page, "sublayoutpickback");
  await openPanel(page);
  await expect.poll(async () => (await nodeStates(page)).length).toBe(2);

  const nodes = onScreenDock(page).locator('[role="group"] button[aria-pressed]');
  await nodes.first().click();
  await expect(onScreenDock(page).getByText(ROOT_NOTE)).toBeVisible();
  // Back to the child: the record follows the last pick, so the next mount shows the child.
  await nodes.nth(1).click();
  const picked = await read(page);
  expect(picked).toMatchObject({ pressed: [false, true], rootNote: 0, childBox: 1 });

  const { narrow, wideAgain } = await acrossLayouts(page, () => read(page));
  expect(narrow).toMatchObject({ pressed: [false, true], rootNote: 0, childBox: 1 });
  expect(wideAgain).toMatchObject({ pressed: [false, true], rootNote: 0, childBox: 1 });
});
