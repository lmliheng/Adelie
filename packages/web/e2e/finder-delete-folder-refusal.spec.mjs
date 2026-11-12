/**
 * Regression: a folder the server REFUSES to delete says why inside the confirmation card that
 * asked, and that card stays standing so its own button is the retry.
 *
 * Removing a folder in the Workspace finder is asked in a confirmation card, and the rule the
 * card warns about — only an empty folder can go — is exactly the answer the server gives with
 * `dir_not_empty`. The card used to close on any outcome, so a refusal left the reason in a
 * notification that dismissed itself after six seconds while the folder it was about was still
 * in the list, looking untouched. Now the card closes only once its delete landed; a refusal is
 * drawn under the card's sentence (`ConfirmModal`'s `refusal` slot), the folder is emptied from
 * outside the card, and pressing the same button again is the retry.
 *
 * The finder is walked to a directory the test made under the system temp dir (its address bar
 * takes an absolute path), so the folders and files it touches are the test's own: `busy` holds
 * a file at first (the refusal), `empty` is there to prove the list still works after one.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The sentence the card draws: the shared lead-in plus the app's own words for the code. */
const NOT_EMPTY_REFUSED = "操作被拒绝：该文件夹不是空的，只能删除空文件夹。";

/** A directory of the test's own, with `busy` (holding a file) and `empty`. */
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-finder-rm-"));
  fs.mkdirSync(path.join(dir, "busy"));
  fs.writeFileSync(path.join(dir, "busy", "kept.txt"), "still here\n");
  fs.mkdirSync(path.join(dir, "empty"));
  return dir;
}

/**
 * Sign in as the seeded administrator (the finder's delete route asks the Project's access) and
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
 * which is a folder no test may write into.
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

/** Picks a row and asks the toolbar to remove it; the card that asks is what comes back. */
async function askToRemove(page, finder, name) {
  await finder.getByRole("option", { name }).click();
  await finder.getByRole("button", { name: "删除文件夹" }).click();
  const card = page.getByRole("dialog", { name: "删除文件夹" });
  await expect(card).toBeVisible();
  return card;
}

/** The finder's delete call, which is what a folder with content in it refuses. */
const isDelete = (res) => res.request().method() === "DELETE";

test("a folder with content keeps its reason in the card, past the toast it used to be", async ({
  page,
}) => {
  const dir = tempDir();
  await ready(page);
  const finder = await openFinder(page, dir, "busy", "empty");
  const notices = page.getByRole("region", { name: "通知" });
  const card = await askToRemove(page, finder, "busy");
  await expect(card).toContainText("删除文件夹「busy」？");

  // The server's own answer: the folder still holds a file.
  const refused = page.waitForResponse(isDelete);
  await card.getByRole("button", { name: "删除" }).click();
  expect((await refused).status(), "folder with content").toBe(409);
  // The card says why, under the sentence that asked, and no notification is left standing.
  await expect(card.getByRole("alert")).toHaveText(NOT_EMPTY_REFUSED);
  await expect(card.getByRole("button", { name: "删除" })).toBeEnabled();
  await expect(notices.getByRole("button")).toHaveCount(0);

  // Six seconds is how long a toast lives; this card and its sentence have to still be there.
  await page.waitForTimeout(7_000);
  await expect(card).toBeVisible();
  await expect(card.getByRole("alert")).toHaveText(NOT_EMPTY_REFUSED);
  await expect(notices.getByRole("button")).toHaveCount(0);
  expect(fs.existsSync(path.join(dir, "busy", "kept.txt")), "nothing was removed").toBe(true);

  // Emptying the folder happens behind the card, without losing it; the same button is the retry.
  fs.rmSync(path.join(dir, "busy", "kept.txt"));
  const landed = page.waitForResponse(isDelete);
  await card.getByRole("button", { name: "删除" }).click();
  expect((await landed).status(), "empty folder").toBe(200);
  await expect(card).toHaveCount(0);
  await expect(finder.getByRole("option", { name: "busy" })).toHaveCount(0);
  await expect(finder.getByRole("option", { name: "empty" })).toBeVisible();
  expect(fs.existsSync(path.join(dir, "busy")), "the folder is gone from disk").toBe(false);
});

test("cancelling after a refusal leaves the next card clean", async ({ page }) => {
  const dir = tempDir();
  await ready(page);
  const finder = await openFinder(page, dir, "busy", "empty");
  const card = await askToRemove(page, finder, "busy");

  const refused = page.waitForResponse(isDelete);
  await card.getByRole("button", { name: "删除" }).click();
  expect((await refused).status(), "folder with content").toBe(409);
  await expect(card.getByRole("alert")).toHaveText(NOT_EMPTY_REFUSED);

  // Escape closes the card; the sentence belonged to that question, so the next one is clean.
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(finder).toBeVisible();
  const again = await askToRemove(page, finder, "busy");
  await expect(again.getByRole("alert")).toHaveCount(0);
  await expect(again).toContainText("删除文件夹「busy」？");
});
