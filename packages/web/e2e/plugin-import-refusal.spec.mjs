/**
 * Regression: a plugin import the server refuses keeps its reason inside the dialog that asked,
 * under the source field it names — instead of leaving only a toast behind.
 *
 * `features/plugins/plugin-import-dialog.tsx` refused nothing on screen and closed nothing: the
 * dialog stayed open with the URL typed and the confirm button in place, and the reason fell
 * into a notification that dismissed itself after six seconds. Afterwards the dialog looked
 * exactly as it had before the press — same address, same button — with no word about why
 * nothing was imported, while the address is precisely the thing that has to be fixed.
 *
 * Both halves of the failure rule are measured here, because they are two different places:
 * an answer that arrives while the dialog is still open stays under the URL field, and one that
 * arrives after Cancel was pressed (Cancel stays live during a request) keeps the notification
 * it always had — a sentence drawn into a closed dialog is a sentence nobody reads.
 *
 * The import write is stubbed: the real route would fetch the address over the network, and what
 * this test measures is where the refusal is drawn, not what the registry answers. The library
 * read is the page's own real one.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

/** The route's own refusal code for a failed fetch, so the sentence on screen is its localized copy. */
const REFUSAL = { code: "download_failed", message: "the archive host answered 502" };
/** S.plugins.importErrors.download_failed, the copy that code stands for in a zh-CN interface. */
const SENTENCE = "下载失败，请确认该地址可以访问。";
const URL_TEXT = "https://example.com/probe-plugin.zip";

/** The dialog's own openers and fields, by their visible labels. */
const openButton = (page) => page.getByRole("button", { name: "远程下载", exact: true });
const urlField = (dialog) => dialog.getByRole("textbox", { name: "插件地址或 npm 包名" });
const importButton = (dialog) => dialog.getByRole("button", { name: "下载并导入", exact: true });

/**
 * Take over the import write. `state.refuse` is what the retry flips; `state.delay` holds the
 * answer back far enough for a test to close the dialog before it lands.
 */
async function stubImportWrite(page, state) {
  await page.route("**/api/plugins/download", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.posts.push(route.request().postDataJSON());
    if (state.delay > 0) await new Promise((resolve) => setTimeout(resolve, state.delay));
    if (state.refuse) {
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: REFUSAL }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        plugin: {
          source: "user",
          name: "probe-plugin",
          version: "2026.11.5.1",
          skills: [],
          hooks: [],
        },
        path: "/tmp/probe-plugin",
      }),
    });
  });
}

/** The plugins page with the download dialog open on one typed address. */
async function openDownloadDialog(page) {
  await page.goto("/plugins");
  await openButton(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await urlField(dialog).fill(URL_TEXT);
  return dialog;
}

test("a refused import keeps its reason under the address, and is not a toast", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = { refuse: true, delay: 0, posts: [] };
  await stubImportWrite(page, state);

  const dialog = await openDownloadDialog(page);
  await importButton(dialog).click();

  // The reason is under the URL field, in the dialog that asked — the notification region
  // (which may still hold the page's own notices) never carries it.
  const line = dialog.getByRole("alert");
  await expect(line).toHaveText(SENTENCE);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(SENTENCE);
  expect(state.posts).toEqual([{ url: URL_TEXT }]);

  // Nothing was imported and nothing was lost: the dialog, the address and the button that
  // retries it are all still there.
  await expect(dialog).toBeVisible();
  await expect(urlField(dialog)).toHaveValue(URL_TEXT);
  await expect(importButton(dialog)).toBeEnabled();

  // Still there after the toast would have gone.
  await page.waitForTimeout(7000);
  await expect(dialog.getByRole("alert")).toHaveText(SENTENCE);

  // Editing the address answers a new question: the line goes with the address it described.
  await urlField(dialog).fill(`${URL_TEXT}?v=2`);
  await expect(dialog.getByRole("alert")).toHaveCount(0);

  // The retry lands: the dialog closes and the import is reported.
  state.refuse = false;
  await importButton(dialog).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" })).toContainText("已导入插件 probe-plugin");
  expect(state.posts).toHaveLength(2);

  // Closing and reopening does not carry the old reason over.
  const reopened = await openDownloadDialog(page);
  await expect(reopened.getByRole("alert")).toHaveCount(0);
});

test("an import refused after the dialog was closed still reports itself", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = { refuse: true, delay: 1500, posts: [] };
  await stubImportWrite(page, state);

  const dialog = await openDownloadDialog(page);
  await importButton(dialog).click();
  // Cancel stays live during a request, so the dialog can be gone before the answer: there is
  // no surface left to keep the sentence in, and the notification is what the reader gets.
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByRole("region", { name: "通知" })).toContainText(SENTENCE);
  expect(state.posts).toHaveLength(1);
});
