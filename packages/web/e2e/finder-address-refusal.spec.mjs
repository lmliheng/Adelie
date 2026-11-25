/**
 * Regression: a path the address bar cannot reach is answered IN the bar that typed it, not by a
 * notification dismissed over a bar already back to the old path.
 *
 * The Workspace finder's address bar turns into a path field (⌘⇧G / Ctrl+Shift+G, or a click).
 * A path that is not there is almost always a typo in it, so the field is where the fix goes —
 * yet the field used to close on Enter whatever happened, leaving the old path on screen, the
 * typed text gone and the reason in a toast that lives six seconds: retyping a long path to fix
 * one letter was the whole cost of getting it wrong. Now the field comes back holding what was
 * typed, the server's own sentence for the code stays right under the bar, and no notification
 * is left standing.
 *
 * The finder is walked to a directory the test made under the system temp dir (its address bar
 * takes an absolute path), so the folders it touches are the test's own.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** The sentence the bar draws: the app's own words for `dir_not_found`. */
const NOT_FOUND = "该目录不存在或不可访问。";

/** A directory of the test's own, with `real` (holding a file) inside it. */
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-finder-path-"));
  fs.mkdirSync(path.join(dir, "real"));
  fs.writeFileSync(path.join(dir, "real", "kept.txt"), "still here\n");
  return dir;
}

/**
 * Sign in as the seeded administrator and give the Project a model — the onboarding card covers
 * the page without one.
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
 * to `dir` through its address bar (Ctrl+L, the path, Enter).
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
  for (const name of listed) {
    await expect(finder.getByRole("option", { name })).toBeVisible();
  }
  return finder;
}

/** Types a path into the address field, from the list, and asks the finder to go there. */
async function goTo(page, finder, target) {
  await finder.getByRole("listbox").focus();
  await page.keyboard.press("ControlOrMeta+l");
  const field = finder.getByRole("textbox", { name: "路径" });
  await expect(field).toBeVisible();
  // The field selects what it holds when it opens, so typing replaces the path.
  await page.keyboard.type(target);
  await page.keyboard.press("Enter");
  return field;
}

test("a path that is not there keeps the field that typed it, and the reason under the bar", async ({
  page,
}) => {
  const dir = tempDir();
  const missing = path.join(dir, "typo");
  await ready(page);
  const finder = await openFinder(page, dir, "real");
  const notices = page.getByRole("region", { name: "通知" });
  const field = await goTo(page, finder, missing);

  // The field is back, holding what was typed, with the server's answer under the bar.
  await expect(field).toBeVisible();
  await expect(field).toHaveValue(missing);
  await expect(finder.getByTestId("finder-address-refusal")).toHaveText(NOT_FOUND);
  await expect(notices.getByRole("button")).toHaveCount(0);
  // The list still shows the folder the finder stood in; nothing claims the one asked for.
  await expect(finder.getByRole("option", { name: "real" })).toBeVisible();

  // Six seconds is how long a toast lives; this sentence has to still be there.
  await page.waitForTimeout(7_000);
  await expect(finder.getByTestId("finder-address-refusal")).toHaveText(NOT_FOUND);
  await expect(field).toHaveValue(missing);
  await expect(notices.getByRole("button")).toHaveCount(0);

  // The fix goes in the same field: typing over the selection walks the finder there.
  await page.keyboard.type(path.join(dir, "real"));
  await page.keyboard.press("Enter");
  await expect(finder.getByTestId("finder-address-refusal")).toHaveCount(0);
  await expect(finder.getByRole("textbox", { name: "路径" })).toHaveCount(0);
  await expect(finder.getByRole("option", { name: "kept.txt" })).toBeVisible();
});

test("Escape and leaving the field put the bar back, and the sentence goes with it", async ({
  page,
}) => {
  const dir = tempDir();
  const missing = path.join(dir, "typo");
  await ready(page);
  const finder = await openFinder(page, dir, "real");

  // Escape: the segments come back, and the sentence belonged to the attempt.
  await goTo(page, finder, missing);
  await expect(finder.getByTestId("finder-address-refusal")).toHaveText(NOT_FOUND);
  await page.keyboard.press("Escape");
  await expect(finder.getByTestId("finder-address-refusal")).toHaveCount(0);
  await expect(finder.getByRole("textbox", { name: "路径" })).toHaveCount(0);
  await expect(finder).toBeVisible();

  // Leaving the field (blur) does the same, and the next attempt starts clean.
  await goTo(page, finder, missing);
  await expect(finder.getByTestId("finder-address-refusal")).toHaveText(NOT_FOUND);
  await page.keyboard.press("Tab");
  await expect(finder.getByTestId("finder-address-refusal")).toHaveCount(0);
  await expect(finder.getByRole("textbox", { name: "路径" })).toHaveCount(0);
  await expect(finder.getByRole("option", { name: "real" })).toBeVisible();
});
