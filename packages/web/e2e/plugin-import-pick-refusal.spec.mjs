/**
 * Regression: a zip the upload dialog refuses BY ITSELF keeps its reason beside the picker,
 * inside the dialog — instead of leaving only a six-second notification behind.
 *
 * Two ways a pick never becomes an import request, and neither is an answer from the server: the
 * file is over the 14 MB decoded-archive cap (refused before a byte is read), or the browser
 * cannot read it at all. Both left the picker naming no file and the confirm button held back,
 * and the sentence fell into a notification over the open dialog — afterwards the dialog looked
 * exactly as it had before the pick, with nothing saying the file had been refused or why.
 *
 * The size refusal is the app's own check on a real file, so it needs no stub. A read failure
 * cannot be provoked on a healthy temporary file, so `FileReader` itself is stubbed to fail —
 * the subject of this test is where the sentence is drawn, not whether a browser can fail.
 *
 * The dialog is opened from the plugins page as the seeded admin (the import actions are
 * admin-only), and nothing is sent: no route is stubbed, because neither case reaches the wire.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

/** S.plugins.importTooLarge(14) and S.plugins.importUnreadable, the copy each cause stands for. */
const TOO_LARGE = "插件包不能超过 14 MB，请压缩后重试";
const UNREADABLE = "这个 zip 读不出来，请换一个文件";

/** The dialog's own opener, picker and confirm, by their visible labels. */
const uploadButton = (page) => page.getByRole("button", { name: "上传插件", exact: true });
const picker = (dialog) => dialog.locator('input[type="file"]');
const confirmButton = (dialog) => dialog.getByRole("button", { name: "上传并导入", exact: true });
const notices = (page) => page.getByRole("region", { name: "通知" });

/** A zip of `bytes` bytes: only its SIZE is judged before reading, so the bytes need no structure. */
const zipOf = (name, bytes) => ({
  name,
  mimeType: "application/zip",
  buffer: Buffer.alloc(bytes),
});

/** The plugins page with the local-upload dialog open. */
async function openUploadDialog(page) {
  await page.goto("/plugins");
  await uploadButton(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a zip over the cap keeps its reason beside the picker, and is not a toast", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const dialog = await openUploadDialog(page);

  // One byte past the cap: refused before reading, exactly as the server would (see
  // pluginZipTooLarge — the boundary itself is legal, which the unit test pins).
  await picker(dialog).setInputFiles(zipOf("probe-big.zip", 14 * 1024 * 1024 + 1));

  // The reason is beside the picker, in the dialog that refused it — the notification region
  // never carries it.
  const line = dialog.getByRole("alert");
  await expect(line).toHaveText(TOO_LARGE);
  await expect(notices(page)).not.toContainText(TOO_LARGE);

  // Nothing was picked, so nothing may look picked: no file named, and the confirm that would
  // send one is held back.
  await expect(dialog).not.toContainText("已选择");
  await expect(confirmButton(dialog)).toBeDisabled();

  // Still there after the notification would have gone.
  await page.waitForTimeout(7000);
  await expect(dialog.getByRole("alert")).toHaveText(TOO_LARGE);

  // Picking a file that fits answers the sentence: it goes, the file is named, the confirm
  // returns.
  await picker(dialog).setInputFiles(zipOf("probe-small.zip", 1024));
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog).toContainText("已选择 probe-small.zip");
  await expect(confirmButton(dialog)).toBeEnabled();

  // Closing and reopening starts clean: the sentence described that pick and went with it.
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  const reopened = await openUploadDialog(page);
  await expect(reopened.getByRole("alert")).toHaveCount(0);
  await expect(reopened).not.toContainText("已选择");
});

test("a zip the browser cannot read keeps its reason beside the picker", async ({ page }) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  // The reader fails for every read on this page: the app's own onerror branch is what runs, and
  // a file picker that cannot read its file is a real thing (a locked file, a dead mount).
  await page.addInitScript(() => {
    window.FileReader = class {
      result = null;
      onload = null;
      onerror = null;
      readAsDataURL() {
        setTimeout(() => this.onerror?.(new Event("error")), 0);
      }
    };
  });
  const dialog = await openUploadDialog(page);

  await picker(dialog).setInputFiles(zipOf("probe-unreadable.zip", 1024));

  // The other cause has its own sentence — not the blanket "unknown error" a bare refusal would
  // have said — in the same slot, and the notification region stays empty.
  await expect(dialog.getByRole("alert")).toHaveText(UNREADABLE);
  await expect(notices(page)).not.toContainText(UNREADABLE);
  await expect(dialog).not.toContainText("已选择");
  await expect(confirmButton(dialog)).toBeDisabled();

  // And it outlives the toast's six seconds like the size one does.
  await page.waitForTimeout(7000);
  await expect(dialog.getByRole("alert")).toHaveText(UNREADABLE);
});
