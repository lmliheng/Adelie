/**
 * Regression: a New folder that was REFUSED says why under the name box itself, in the Workspace
 * finder, and the sentence outlives the six seconds a toast lives.
 *
 * The box keeps everything on a refusal — the name that was typed, the caret in it — because the
 * name is the thing to change, and pressing Enter again is the retry. The reason used to arrive as
 * a notification over that box, so a reader who looked away was left with a box that looked
 * untouched and no way to tell a taken name from one the system will not hold.
 *
 * Both cases run against the real server: a name the folder already holds is the route's own 409
 * `dir_exists`, and a name that is a path is refused before any request is sent — the second test
 * counts the create requests to prove nothing was asked. The finder is walked to a directory the
 * test made under the system temp dir (its address bar takes an absolute path), so the folders it
 * makes are the test's own.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The lines the box draws: the shared lead-in plus the app's sentence for the code. */
const TAKEN_REFUSED = "操作被拒绝：这个名称已被占用。";
const NOT_A_NAME_REFUSED =
  "操作被拒绝：文件夹名称不能是路径、`.` 或 `..`，也不能含有系统不接受的字符。";

/** A directory of the test's own under the system temp dir, holding the names it is given. */
function tempDir(...names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-finder-"));
  for (const name of names) fs.mkdirSync(path.join(dir, name));
  return dir;
}

/**
 * Sign in as the seeded administrator (the finder's create route asks the Project's access) and
 * give the Project a model — the onboarding card covers the page without one.
 */
async function ready(page) {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
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
}

/**
 * The finder, opened the way a person opens it — the sidebar's new-workspace button — then walked
 * to `dir` through its address bar (Ctrl+L, the path, Enter). It opens at this server's home,
 * which is a folder no test may write into. The field is typed into rather than filled: it puts
 * the segments back the moment focus leaves it, and a locator that re-resolves mid-chord is a
 * different element.
 */
async function openFinder(page, dir, ...listed) {
  await page.goto("/");
  await page.getByRole("button", { name: "新建工作区" }).click();
  const finder = page.getByRole("dialog", { name: "Workspace" });
  await expect(finder).toBeVisible();
  await expect(finder.getByRole("listbox")).toBeVisible();
  await finder.getByRole("listbox").focus();
  await page.keyboard.press("ControlOrMeta+l");
  await page.keyboard.type(dir);
  await page.keyboard.press("Enter");
  // The folder on screen is the test's own: what it lists is what the test put there.
  for (const name of listed) {
    await expect(finder.getByRole("option", { name })).toBeVisible();
  }
  return finder;
}

/** The name box at the head of the list, opened from the toolbar. */
async function openNameBox(finder) {
  await finder.getByRole("button", { name: "新建文件夹" }).click();
  const box = finder.getByRole("textbox", { name: "新建文件夹" });
  await expect(box).toBeVisible();
  return box;
}

/** The finder's create call, which is what a taken name refuses. */
const isCreate = (res) => res.request().method() === "POST" && res.url().endsWith("/dirs");

test("a taken folder name keeps its reason under the box, past the toast it used to be", async ({
  page,
}) => {
  const dir = tempDir("taken");
  await ready(page);
  const finder = await openFinder(page, dir, "taken");
  const notices = page.getByRole("region", { name: "通知" });
  const box = await openNameBox(finder);

  // A name the folder on screen already holds.
  const refused = page.waitForResponse(isCreate);
  await box.fill("taken");
  await box.press("Enter");
  expect((await refused).status(), "taken name").toBe(409);
  // The box says why, keeps what was typed (that is what to change), and no notification is left
  // standing over it.
  await expect(finder.getByRole("alert")).toHaveText(TAKEN_REFUSED);
  await expect(box).toHaveValue("taken");
  await expect(notices.getByRole("button")).toHaveCount(0);

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(finder.getByRole("alert")).toHaveText(TAKEN_REFUSED);
  await expect(box).toHaveValue("taken");
  await expect(notices.getByRole("button")).toHaveCount(0);

  // Typing another name is the retry: the sentence about the taken one goes with the first
  // keystroke, and Enter makes the folder where the box was.
  await box.fill("made-here");
  await expect(finder.getByRole("alert")).toHaveCount(0);
  const landed = page.waitForResponse(isCreate);
  await box.press("Enter");
  expect((await landed).status(), "free name").toBe(201);
  await expect(finder.getByRole("option", { name: "made-here", selected: true })).toBeVisible();
  await expect(finder.getByRole("textbox", { name: "新建文件夹" })).toHaveCount(0);
  expect(fs.existsSync(path.join(dir, "made-here")), "the folder is on disk").toBe(true);
});

test("a name that is a path is refused in place, without asking the server", async ({ page }) => {
  const dir = tempDir();
  /** Every create the finder attempted: a name refused on its own face must not add one. */
  const creates = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/dirs")) creates.push(req.url());
  });

  await ready(page);
  const finder = await openFinder(page, dir);
  const notices = page.getByRole("region", { name: "通知" });
  const box = await openNameBox(finder);

  // A separator makes the name a path — the server's own rule, asked before the request, since
  // what it would make would land outside the folder on screen.
  await box.fill("a/b");
  await box.press("Enter");
  await expect(finder.getByRole("alert")).toHaveText(NOT_A_NAME_REFUSED);
  await expect(box).toHaveValue("a/b");
  await expect(notices.getByRole("button")).toHaveCount(0);
  expect(creates, "a refused name asks the server nothing").toHaveLength(0);

  // The sentence belongs to the box: Escape closes the box, and the sentence goes with it while
  // the finder stays open.
  await box.press("Escape");
  await expect(finder.getByRole("textbox", { name: "新建文件夹" })).toHaveCount(0);
  await expect(finder.getByRole("alert")).toHaveCount(0);
  await expect(finder).toBeVisible();
  expect(creates).toHaveLength(0);
});
