/**
 * A layout change brings the Trace panel back to the rounds the reader had open, where they were
 * scrolled — not to the newest round, at the top.
 *
 * The panel's place is the reader's: which rounds of the file are open and how far down it they
 * had scrolled. Both live in the body's state, and a crossing between the desktop side column and
 * the narrow merged surface redraws the same tab as a fresh body on the other dock — so the place
 * went with the old mount: measured in the browser, a reader who had closed the newest round and
 * opened the first one, then scrolled down, came back on the newest round with the first one
 * closed and the panel back at the round it opens on.
 *
 * A crossing is a move, and only a move restores the place (trace-place.ts): a tab closed and
 * reopened brings the body back on the surface the place was left on and still starts the panel
 * over. The fixtures are three ordinary turns against the repository's mock model, so the file
 * really has three rounds — one per Task — with a timeline, a tool call and a reply in each.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";
const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 900 };
/** The mock's second-turn answer (the string it says once a tool call has run); one per turn. */
const REPLY = "Command finished; ";
/** The panel's global summary heading — the marker the scrolling box is walked up from. */
const SUMMARY = "全局统计";
/** Three turns, so the Trace file holds three rounds (one per Task). */
const TURNS = ["First probe turn", "Second probe turn", "Third probe turn"];

/** Provision the user, aim the Project's model at the mock, open one Session and run three turns. */
async function openSessionWithRounds(page, user) {
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
          pricing: { cacheRead: 1, cacheWrite: 5, output: 10 },
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;

  await page.goto(`${BASE}/chat/${sessionId}`);
  const box = page.getByPlaceholder(/输入消息/);
  await box.waitFor();
  for (const text of TURNS) {
    const done = await page.getByText(REPLY).count();
    await box.fill(text);
    await page.getByRole("button", { name: "发送" }).click();
    await page.getByText(REPLY).nth(done).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(300);
  }
  return { sessionId };
}

/** The dock that is actually on screen (a collapsed one keeps its bodies mounted at zero size). */
const onScreenDock = (page) => page.locator('[data-testid="dock"]:visible');

/** The Trace panel, open on the right dock, with its analysis in. */
async function openTracePanel(page, sessionId) {
  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).waitFor();
  await page.getByTestId("dock-toggle-right").click();
  await page.getByTestId("dock-pick-trace").click();
  await expect(onScreenDock(page).getByText(SUMMARY)).toBeVisible();
  // The panel opens on the file's newest round; every round below is a card of its own.
  await expect
    .poll(() => roundStates(page), { message: "the file's rounds are drawn" })
    .toEqual(["0:false", "1:false", "2:true"]);
}

/** Each round card's taskIndex and whether it is open, oldest first. */
const roundStates = (page) =>
  onScreenDock(page)
    .locator("[data-round]")
    .evaluateAll((cards) =>
      cards.map(
        (card) =>
          `${card.getAttribute("data-round")}:${
            card.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded") ?? "?"
          }`,
      ),
    );

/** Opens or closes one round, by its taskIndex (the card's header button carries the state). */
const toggleRound = (page, taskIndex) =>
  onScreenDock(page).locator(`[data-round="${taskIndex}"] button[aria-expanded]`).first().click();

/** The offset of the box that actually scrolls the panel, read from the DOM. */
const boxTop = (page) =>
  page.evaluate((text) => {
    const node = [...document.querySelectorAll("p,div,span")].find((el) => el.textContent === text);
    if (node === undefined) return null;
    for (let el = node.parentElement; el !== null; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== "visible") {
        return Math.round(el.scrollTop);
      }
    }
    return null;
  }, SUMMARY);

/** Scrolls that box to `top` and returns what it landed on. */
const setBoxTop = (page, top) =>
  page.evaluate(
    ({ text, value }) => {
      const node = [...document.querySelectorAll("p,div,span")].find(
        (el) => el.textContent === text,
      );
      if (node === undefined) return null;
      for (let el = node.parentElement; el !== null; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== "visible") {
          el.scrollTop = value;
          return Math.round(el.scrollTop);
        }
      }
      return null;
    },
    { text: SUMMARY, value: top },
  );

/**
 * Cross the breakpoint and read the panel on both sides, once the move has settled (the dock that
 * loses the panel collapses over 200 ms and the other one grows in its place).
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

test("a layout change comes back to the rounds the Trace panel had open", async ({ page }) => {
  const { sessionId } = await openSessionWithRounds(page, "traceplacesrounds");
  await openTracePanel(page, sessionId);

  // The reader closes the newest round and opens the first one: that is the place.
  await toggleRound(page, 2);
  await toggleRound(page, 0);
  await expect.poll(() => roundStates(page)).toEqual(["0:true", "1:false", "2:false"]);

  const { narrow, wideAgain } = await acrossLayouts(page, () => roundStates(page));
  expect(narrow).toEqual(["0:true", "1:false", "2:false"]);
  expect(wideAgain).toEqual(["0:true", "1:false", "2:false"]);
});

test("a layout change comes back to where the Trace panel was scrolled", async ({ page }) => {
  const { sessionId } = await openSessionWithRounds(page, "traceplacesscroll");
  await openTracePanel(page, sessionId);

  // The panel is taller than the dock: the reader had scrolled it down with nothing else changed.
  await expect.poll(() => boxTop(page)).not.toBeNull();
  const scrolled = await setBoxTop(page, 320);
  expect(scrolled, "the panel box scrolls").toBe(320);
  await expect.poll(() => boxTop(page)).toBe(320);

  const { narrow, wideAgain } = await acrossLayouts(page, async () => {
    // The offset comes back a moment after the move: the body re-reads the file, opens the rounds
    // and only then applies the place (an earlier offset would be clamped short).
    await expect.poll(() => boxTop(page)).toBe(320);
    return boxTop(page);
  });
  expect(narrow).toBe(320);
  expect(wideAgain).toBe(320);
});

test("a Trace tab closed and reopened still starts the panel over", async ({ page }) => {
  const { sessionId } = await openSessionWithRounds(page, "traceplacesreopen");
  await openTracePanel(page, sessionId);

  // Put the panel somewhere only a move should bring back.
  await toggleRound(page, 2);
  await toggleRound(page, 0);
  await expect.poll(() => roundStates(page)).toEqual(["0:true", "1:false", "2:false"]);
  const scrolled = await setBoxTop(page, 320);
  expect(scrolled).toBe(320);

  // Closing the tab and picking it again mounts the body afresh on the surface the place was left
  // on: that is not a move, so the panel opens on the file's newest round again. (Closing the last
  // tab puts the dock away; its toggle pulls it back up on the picker.)
  const dock = onScreenDock(page);
  await dock.locator('[data-tab-id="trace"]').getByTestId("dock-tab-close").click();
  await expect(dock).toHaveCount(0);
  await page.getByTestId("dock-toggle-right").click();
  await page.getByTestId("dock-pick-trace").click();
  await expect(onScreenDock(page).getByText(SUMMARY)).toBeVisible();
  await expect
    .poll(() => roundStates(page), { message: "the reopened panel starts over" })
    .toEqual(["0:false", "1:false", "2:true"]);
});
