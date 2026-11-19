/**
 * A layout change brings the Files panel back to how the reader was looking at it — not just to
 * which file it had open.
 *
 * The rendered/source choice and the two scroll offsets (the preview's, the tree's) live in the
 * body too, and a crossing between the desktop side column and the narrow merged surface redraws
 * the same tab as a fresh body on the other dock — so the choice went back to "rendered" and both
 * boxes went back to the top. Measured in the browser, a reader who had switched a long Markdown
 * file to its source and scrolled halfway down came back to the rendered top of it.
 *
 * A crossing is a move, and only a move restores the place (workspace-view-memory.ts): a tab
 * closed and reopened, or a Session switched away from and back to, still starts the panel over —
 * files-switch.spec and files-place-across-layout.spec pin the two halves of that.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";
const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 900 };
/** S.files.htmlSource / S.files.htmlRendered, the two halves of the preview toggle. */
const SOURCE = "源码";
const RENDERED = "预览";

/** A Markdown file long enough that its rendered view and its source both scroll. */
const LONG_MD =
  Array.from(
    { length: 120 },
    (_, i) => `Paragraph ${i + 1}: the reader scrolled down past the top of the file.`,
  ).join("\n\n") + "\n";

/** Root files, enough of them that the tree has to be scrolled to see the last one. */
const ROOT_FILES = Array.from(
  { length: 32 },
  (_, i) => `row-${String(i + 1).padStart(2, "0")}.txt`,
);

/** Provision the user, aim the Project's model at the mock, and open one Session. */
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
    { data: {} },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;
  const files = [
    ["long.md", LONG_MD],
    ["other.md", "# other\n\nA second file, short enough to sit at its top.\n"],
    ...ROOT_FILES.map((name) => [name, `${name}\n`]),
  ];
  for (const [rel, text] of files) {
    const res = await page.request.put(
      `${BASE}/api/sessions/${sessionId}/files/content?path=${encodeURIComponent(rel)}`,
      { data: { dataBase64: Buffer.from(text).toString("base64") } },
    );
    expect(res.ok(), `upload ${rel}`).toBeTruthy();
  }
  return { sessionId };
}

/** The Files panel, open on the right dock. */
async function openFiles(page, sessionId) {
  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).waitFor();
  await page.getByTestId("dock-toggle-right").click();
  await page.getByTestId("dock-pick-workspace").click();
  await page.locator('[data-tree-path="long.md"]').waitFor();
}

/** The dock that is actually on screen (a collapsed one keeps its bodies mounted at zero size). */
const onScreenDock = (page) => page.locator('[data-testid="dock"]:visible');

/**
 * The panel's own scrolling boxes on screen, by the two things that have one: the tree
 * (`role="tree"`, which the panel's className makes the scroller) and the preview (the pane's
 * body, whose offset nothing else can name). Read from the DOM rather than from a class list,
 * which the panel is free to change.
 */
const scrollBoxes = (page) =>
  onScreenDock(page).evaluate((dock) => {
    const overflow = (el) => el.scrollHeight - el.clientHeight > 8;
    const tree = dock.querySelector('[role="tree"]');
    return {
      tree: tree !== null && overflow(tree) ? Math.round(tree.scrollTop) : 0,
      preview: [...dock.querySelectorAll("div")]
        .filter((el) => el.getAttribute("role") !== "tree" && overflow(el))
        .map((el) => Math.round(el.scrollTop)),
    };
  });

/** Scrolls one of those boxes the way a wheel would: the offset, and the scroll event it fires. */
const scrollBox = (page, which, top) =>
  onScreenDock(page).evaluate(
    (dock, { which, top }) => {
      const overflow = (el) => el.scrollHeight - el.clientHeight > 8;
      const el =
        which === "tree"
          ? dock.querySelector('[role="tree"]')
          : [...dock.querySelectorAll("div")].find(
              (node) => node.getAttribute("role") !== "tree" && overflow(node),
            );
      if (el === null || el === undefined) throw new Error(`no ${which} box to scroll`);
      el.scrollTop = top;
    },
    { which, top },
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
  // The preview's content renders into the new body before its box can be scrolled, so the
  // restore lands a frame or two later.
  await page.waitForTimeout(400);
  const narrow = await read();
  await page.setViewportSize(WIDE);
  await settle("after widening");
  await page.waitForTimeout(400);
  const wideAgain = await read();
  return { narrow, wideAgain };
}

test("a layout change comes back to the rendered/source choice the reader made", async ({
  page,
}) => {
  const { sessionId } = await openSession(page, "filereadingview");
  await openFiles(page, sessionId);

  await onScreenDock(page).locator('[data-tree-path="long.md"]').click();
  await expect(
    onScreenDock(page).getByText("Paragraph 1:", { exact: false }).first(),
  ).toBeVisible();
  await onScreenDock(page).getByRole("button", { name: SOURCE, exact: true }).click();
  await expect(
    onScreenDock(page).getByRole("button", { name: SOURCE, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const read = async () => ({
    source: await onScreenDock(page)
      .getByRole("button", { name: SOURCE, exact: true })
      .getAttribute("aria-pressed"),
    rendered: await onScreenDock(page)
      .getByRole("button", { name: RENDERED, exact: true })
      .getAttribute("aria-pressed"),
  });
  const { narrow, wideAgain } = await acrossLayouts(page, read);
  expect(narrow).toEqual({ source: "true", rendered: "false" });
  expect(wideAgain).toEqual({ source: "true", rendered: "false" });

  // The choice belongs to the file it was made on: a file opened afterwards starts rendered.
  await onScreenDock(page).locator('[data-tree-path="other.md"]').click();
  await expect(onScreenDock(page).getByText("A second file, short enough")).toBeVisible();
  expect(await read()).toEqual({ source: "false", rendered: "true" });
});

test("a layout change comes back to where the preview was scrolled", async ({ page }) => {
  const { sessionId } = await openSession(page, "filereadingscroll");
  await openFiles(page, sessionId);

  await onScreenDock(page).locator('[data-tree-path="long.md"]').click();
  await expect(
    onScreenDock(page).getByText("Paragraph 1:", { exact: false }).first(),
  ).toBeVisible();
  await scrollBox(page, "preview", 240);
  await expect
    .poll(async () => (await scrollBoxes(page)).preview[0], { message: "preview scrolled" })
    .toBeGreaterThan(100);

  const read = async () => ({ preview: (await scrollBoxes(page)).preview[0] ?? 0 });
  const { narrow, wideAgain } = await acrossLayouts(page, read);
  expect(narrow.preview, "narrow surface keeps the preview's offset").toBeGreaterThan(100);
  expect(wideAgain.preview, "and the wide surface too").toBeGreaterThan(100);
});

test("a layout change comes back to where the tree was scrolled", async ({ page }) => {
  const { sessionId } = await openSession(page, "filereadingtree");
  await openFiles(page, sessionId);

  // Nothing selected: the narrow surface shows the tree, which is the box this test is about.
  await scrollBox(page, "tree", 160);
  await expect
    .poll(async () => (await scrollBoxes(page)).tree, { message: "tree scrolled" })
    .toBeGreaterThan(50);

  const read = async () => ({ tree: (await scrollBoxes(page)).tree });
  const { narrow, wideAgain } = await acrossLayouts(page, read);
  expect(narrow.tree, "narrow surface keeps the tree's offset").toBeGreaterThan(50);
  expect(wideAgain.tree, "and the wide surface too").toBeGreaterThan(50);
});
