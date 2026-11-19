/**
 * A layout change brings the Files panel back to its own place — not to the start of the tree.
 *
 * The panel's place is the reader's: which file is in the preview, which folders they unfolded on
 * the way to it, which directory the breadcrumbs name. All three live in the body's state, and a
 * crossing between the desktop side column and the narrow merged surface redraws the same tab as
 * a fresh body on the other dock — so the place went with the old mount: measured in the browser,
 * the narrow surface came back to the tree's root with nothing open, and the folders the reader
 * had opened were shut again.
 *
 * A crossing is a move, and only a move restores the place (workspace-view-memory.ts): a tab
 * closed and reopened, or a Session switched away from and back to, brings the body back on the
 * surface the place was left on and still starts the panel over — files-switch.spec pins the
 * Session half of that.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";
const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 900 };
/** What the file the tests open says (its preview is the text itself). */
const HELPER_TEXT = "the helper the reader had opened\n";
/** S.files.backToList, the narrow surface's way back to the tree. */
const BACK_TO_TREE = "返回列表";

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
  // A file in the root, and one a folder down: the folder is what the reader unfolds.
  for (const [rel, text] of [
    ["notes.md", "# notes\n"],
    ["util/helper.txt", HELPER_TEXT],
  ]) {
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
  await page.locator('[data-tree-path="util"]').waitFor();
}

/** The dock that is actually on screen (a collapsed one keeps its bodies mounted at zero size). */
const onScreenDock = (page) => page.locator('[data-testid="dock"]:visible');

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

test("a layout change comes back to the file the Files panel had open", async ({ page }) => {
  const { sessionId } = await openSession(page, "fileplacefile");
  await openFiles(page, sessionId);

  // The reader unfolds the folder and opens the file in it: that is the place.
  await onScreenDock(page).locator('[data-tree-path="util"]').click();
  await onScreenDock(page).locator('[data-tree-path="util/helper.txt"]').click();
  await expect(onScreenDock(page).getByText(HELPER_TEXT.trim())).toBeVisible();

  const read = async () => ({
    preview: await onScreenDock(page).getByText(HELPER_TEXT.trim()).count(),
    selectedRow: await onScreenDock(page).locator('[data-tree-path="util/helper.txt"]').count(),
  });
  const { narrow, wideAgain } = await acrossLayouts(page, read);
  // On the narrow surface the panel shows one pane at a time, and what it shows is the file the
  // reader had open — not the tree's root it used to fall back to.
  expect(narrow).toMatchObject({ preview: 1, selectedRow: 0 });
  // Back on the wide surface both panes are there again, on the same file.
  expect(wideAgain).toMatchObject({ preview: 1, selectedRow: 1 });
});

test("a layout change comes back to the folders the Files panel had unfolded", async ({ page }) => {
  const { sessionId } = await openSession(page, "fileplacefolders");
  await openFiles(page, sessionId);

  // A folder unfolded with nothing selected is a place too: the reader was on their way down.
  await onScreenDock(page).locator('[data-tree-path="util"]').click();
  await expect(onScreenDock(page).locator('[data-tree-path="util/helper.txt"]')).toBeVisible();

  const read = async () => ({
    helperRow: await onScreenDock(page).locator('[data-tree-path="util/helper.txt"]').count(),
  });
  const { narrow, wideAgain } = await acrossLayouts(page, read);
  // Nothing is selected, so the narrow surface shows the tree — the unfolded folder still open.
  expect(narrow).toMatchObject({ helperRow: 1 });
  expect(wideAgain).toMatchObject({ helperRow: 1 });
});

test("a layout change after the reader walked back to the tree leaves the tree as they left it", async ({
  page,
}) => {
  const { sessionId } = await openSession(page, "fileplaceback");
  await openFiles(page, sessionId);

  // Open a file, then walk back to the tree on the narrow surface (the panel's own way back).
  await onScreenDock(page).locator('[data-tree-path="util"]').click();
  await onScreenDock(page).locator('[data-tree-path="util/helper.txt"]').click();
  await expect(onScreenDock(page).getByText(HELPER_TEXT.trim())).toBeVisible();
  await page.setViewportSize(NARROW);
  await expect
    .poll(async () => onScreenDock(page).count(), { message: "one dock on screen" })
    .toBe(1);
  await onScreenDock(page).getByRole("button", { name: BACK_TO_TREE }).click();
  await expect(onScreenDock(page).locator('[data-tree-path="util/helper.txt"]')).toBeVisible();

  // Coming back to the wide surface must not reopen the file the reader had closed: the place is
  // the tree they went back to — folder unfolded, nothing open.
  await page.setViewportSize(WIDE);
  await expect
    .poll(async () => onScreenDock(page).count(), { message: "one dock on screen" })
    .toBe(1);
  await page.waitForTimeout(250); // DOCK_TRANSITION_MS
  expect(await onScreenDock(page).getByText(HELPER_TEXT.trim()).count()).toBe(0);
  expect(await onScreenDock(page).locator('[data-tree-path="util/helper.txt"]').count()).toBe(1);
});
