/**
 * A layout change brings the Memory panel back to its own place — not to the top of the list.
 *
 * The panel's place is the reader's: which level they were at (the list, or one memory's text) and
 * how far down it they had scrolled. Both live in the body's state, and a crossing between the
 * desktop side column and the narrow merged surface redraws the same tab as a fresh body on the
 * other dock — so the place went with the old mount: measured in the browser, a memory being read
 * came back to the list, and both levels came back scrolled to the top.
 *
 * A crossing is a move, and only a move restores the place (memory-place.ts): a tab closed and
 * reopened, or a Session switched away from and back to, brings the body back on the surface the
 * place was left on and still starts the panel over.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";
const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 900 };
/** S.chat.memoryBack, the detail level's way back to the list. */
const MEMORY_BACK = "返回列表";
/** The long memory's first paragraph — the marker the detail scroller is read from. */
const FIRST_PARAGRAPH = "第一段：这条记忆够长，长到要往下滚。";
/** How many short memories make the list taller than the panel. */
const SHORT_COUNT = 24;

/** One memory file, in the shape the export document carries (the import route's own shape). */
function memoryFile(name, title, body) {
  return {
    name,
    content: `---\nname: ${title}\ndescription: A memory the place test seeds.\n---\n\n${body}\n`,
  };
}

/** A user-scope document: one long memory, then enough short ones to overflow the list. */
function documentWithLongMemory() {
  const paragraphs = [
    FIRST_PARAGRAPH,
    ...Array.from({ length: 40 }, (_, i) => `第 ${i + 2} 段：接着往下写一点。`),
  ];
  const long = memoryFile("probe-long.md", "Probe long memory", paragraphs.join("\n\n"));
  const short = Array.from({ length: SHORT_COUNT }, (_, i) =>
    memoryFile(`probe-short-${String(i + 1).padStart(2, "0")}.md`, `Probe short ${i + 1}`, "短"),
  );
  const index = [
    `- [Probe long memory](${long.name}) — seeded by the e2e run\n`,
    ...short.map((f, i) => `- [Probe short ${i + 1}](${f.name}) — seeded by the e2e run\n`),
  ].join("");
  return {
    format: "penguin-memory-scope",
    version: 1,
    scopeKey: "user",
    kind: "user",
    exportedAt: new Date().toISOString(),
    index,
    files: [long, ...short],
  };
}

/** Provision the user, aim the Project's model at the mock, open one Session and seed the memories. */
async function openSessionWithMemories(page, user) {
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
  const seeded = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/memory/scopes/user/import`,
    { data: { mode: "overwrite", confirm: true, payload: documentWithLongMemory() } },
  );
  expect(seeded.ok(), "seed the memories").toBeTruthy();
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions`,
    { data: {} },
  );
  expect(created.ok(), "create session").toBeTruthy();
  return { sessionId: (await created.json()).session.sessionId };
}

/** The dock that is actually on screen (a collapsed one keeps its bodies mounted at zero size). */
const onScreenDock = (page) => page.locator('[data-testid="dock"]:visible');

/** The Memory panel, open on the right dock, on its list level. */
async function openMemoryPanel(page, sessionId) {
  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).waitFor();
  await page.getByTestId("dock-toggle-right").click();
  await page.getByTestId("dock-pick-memory").click();
  await expect(onScreenDock(page).getByText("Probe short 24")).toBeVisible();
}

/**
 * The offset of the box that actually scrolls above a marker text, read from the DOM: the panel
 * draws the list in one scroller and a memory's text in another ($null when the marker is absent).
 */
async function scrollAbove(page, marker) {
  return page.evaluate((text) => {
    const node = [...document.querySelectorAll("p")].find((p) =>
      (p.textContent ?? "").startsWith(text),
    );
    if (node === undefined) return null;
    for (let el = node.parentElement; el !== null; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight && style.overflowY !== "visible") {
        return Math.round(el.scrollTop);
      }
    }
    return null;
  }, marker);
}

/** Whether the detail level is the one on screen (its back button is the level's own). */
const inDetail = (page) => onScreenDock(page).getByRole("button", { name: MEMORY_BACK }).count();

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

test("a layout change comes back to the memory the panel had open, where it was scrolled", async ({
  page,
}) => {
  const { sessionId } = await openSessionWithMemories(page, "memoryplacedetail");
  await openMemoryPanel(page, sessionId);

  // The reader opens the long memory and scrolls down it: that is the place.
  await onScreenDock(page)
    .getByRole("button", { name: /Probe long memory/ })
    .click();
  await expect(onScreenDock(page).getByText(FIRST_PARAGRAPH)).toBeVisible();
  await onScreenDock(page)
    .getByText(FIRST_PARAGRAPH)
    .evaluate((el) => {
      for (let box = el.parentElement; box !== null; box = box.parentElement) {
        if (box.scrollHeight > box.clientHeight) {
          box.scrollTop = 600;
          return;
        }
      }
    });
  await expect.poll(() => scrollAbove(page, FIRST_PARAGRAPH)).toBeGreaterThan(200);
  const scrolled = await scrollAbove(page, FIRST_PARAGRAPH);

  const read = async () => ({
    detail: await inDetail(page),
    scroll: await scrollAbove(page, FIRST_PARAGRAPH),
  });
  const { narrow, wideAgain } = await acrossLayouts(page, read);
  // On the narrow surface the panel is still on that memory, still where the reader had it.
  expect(narrow).toMatchObject({ detail: 1, scroll: scrolled });
  expect(wideAgain).toMatchObject({ detail: 1, scroll: scrolled });
});

test("a layout change comes back to how far down the memory list the reader was", async ({
  page,
}) => {
  const { sessionId } = await openSessionWithMemories(page, "memoryplacelist");
  await openMemoryPanel(page, sessionId);

  // The list alone is a place: the reader had scrolled down it with nothing opened.
  await onScreenDock(page)
    .getByText("Probe short 24")
    .evaluate((el) => {
      for (let box = el.parentElement; box !== null; box = box.parentElement) {
        if (box.scrollHeight > box.clientHeight) {
          box.scrollTop = 400;
          return;
        }
      }
    });
  await expect.poll(() => scrollAbove(page, "Probe short 24")).toBeGreaterThan(100);
  const scrolled = await scrollAbove(page, "Probe short 24");

  const read = async () => ({
    detail: await inDetail(page),
    scroll: await scrollAbove(page, "Probe short 24"),
  });
  const { narrow, wideAgain } = await acrossLayouts(page, read);
  expect(narrow).toMatchObject({ detail: 0, scroll: scrolled });
  expect(wideAgain).toMatchObject({ detail: 0, scroll: scrolled });
});

test("a layout change after the reader walked back to the list leaves the list, as they left it", async ({
  page,
}) => {
  const { sessionId } = await openSessionWithMemories(page, "memoryplaceback");
  await openMemoryPanel(page, sessionId);

  // Open the long memory, then walk back to the list: the place is the list afterwards.
  await onScreenDock(page)
    .getByRole("button", { name: /Probe long memory/ })
    .click();
  await expect(onScreenDock(page).getByText(FIRST_PARAGRAPH)).toBeVisible();
  await onScreenDock(page).getByRole("button", { name: MEMORY_BACK }).click();
  await expect(onScreenDock(page).getByRole("button", { name: /Probe long memory/ })).toBeVisible();

  const { narrow, wideAgain } = await acrossLayouts(page, () => inDetail(page));
  expect(narrow).toBe(0);
  expect(wideAgain).toBe(0);
});
