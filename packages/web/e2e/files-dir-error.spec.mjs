/**
 * Regression: the Files panel's tree keeps a directory row whose listing failed, and says why
 * under that row — and the row itself is the retry.
 *
 * The nested branch of `loadDir` used to toast the reason and drop the directory from the tree
 * (un-expanding it). Six seconds later nothing on screen said the directory existed or what had
 * gone wrong; the reader had to guess that Refresh would help. Now the row stays where it was —
 * the reader's place in the tree is not the failure's to take — with the reason drawn under it,
 * and a click on that row reads it again (7.19's rule: the sentence stays where the attempt was).
 *
 * The directory vanishing under an open tree is real: an Agent cleaning up, or the user in a
 * shell. The fixture is a temporary Workspace, and the spec deletes the entry itself.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** The mock model the Project needs before the page is usable (the onboarding overlay). */
async function setUp(page, user, files) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-files-dir-error-")), "files");
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  fs.mkdirSync(dir, { recursive: true });
  await provisionAndLogin(page.request, user, P);
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
  const res = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { workspace: dir } },
  );
  expect(res.ok(), "create session").toBeTruthy();
  return { dir, sessionId: (await res.json()).session.sessionId };
}

async function openFiles(page, sessionId) {
  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).waitFor();
  await page.getByTestId("dock-toggle-right").click();
  await page.getByTestId("dock-pick-workspace").click();
  const dock = page.getByTestId("dock");
  await dock.locator('[role="tree"]').waitFor();
  return dock;
}

/** Removes one entry from the fixture: an empty directory, or a file inside one. */
function removeDir(dir, relative) {
  const target = path.join(dir, relative);
  for (const name of fs.readdirSync(target)) fs.unlinkSync(path.join(target, name));
  fs.rmdirSync(target);
}

const REASON = "这个目录读不出来：该路径不存在。（点这一行重试）";

test("a directory that could not be listed keeps its row with the reason, and clicking it retries", async ({
  page,
}) => {
  const { dir, sessionId } = await setUp(page, "filesdirerror1", { "gone/note.txt": "hello\n" });
  const dock = await openFiles(page, sessionId);
  await dock.locator('[data-tree-path="gone"]').waitFor();

  // The directory goes away before it is ever opened (an Agent cleaned it up mid-turn).
  removeDir(dir, "gone");

  await dock.locator('[data-tree-path="gone"]').click();
  const tree = dock.locator('[role="tree"]');
  const reason = tree.getByText(REASON, { exact: true });
  await expect(reason).toBeVisible();
  // The row is still a row, still open, and still the place the click landed. The reason is the
  // tree's own (looked up inside the tree), not a toast floating over it.
  await expect(dock.locator('[data-tree-path="gone"]')).toHaveAttribute("aria-expanded", "true");

  // It stays: nothing takes it away on a timer. (The old toast left after six seconds.)
  await page.waitForTimeout(7000);
  await expect(reason).toBeVisible();

  // The row itself is the retry: the directory comes back, the click reads it again.
  fs.mkdirSync(path.join(dir, "gone"));
  fs.writeFileSync(path.join(dir, "gone", "note.txt"), "back\n");
  await dock.locator('[data-tree-path="gone"]').click();
  await expect(dock.locator('[data-tree-path="gone/note.txt"]')).toBeVisible();
  await expect(reason).toHaveCount(0);
});

test("an open directory whose re-read fails says so on refresh, its stale rows go, and the row retries", async ({
  page,
}) => {
  const { sessionId } = await setUp(page, "filesdirerror2", { "gone/note.txt": "hello\n" });
  const dock = await openFiles(page, sessionId);
  await dock.locator('[data-tree-path="gone"]').click();
  await dock.locator('[data-tree-path="gone/note.txt"]').waitFor();

  // That one directory's listing fails while the root still answers (a transient server fault):
  // the row the root lists stays, the listing behind it does not come back.
  const listing = "**/files?path=gone";
  await page.route(listing, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "boom" } }),
    }),
  );
  await dock.getByRole("button", { name: "刷新" }).click();

  const tree = dock.locator('[role="tree"]');
  const reason = tree.getByText("这个目录读不出来：服务器内部错误，请稍后重试。（点这一行重试）", {
    exact: true,
  });
  await expect(reason).toBeVisible();
  // What the earlier read found is not what the directory holds now.
  await expect(dock.locator('[data-tree-path="gone/note.txt"]')).toHaveCount(0);
  await expect(dock.locator('[data-tree-path="gone"]')).toHaveAttribute("aria-expanded", "true");

  // With the server answering again, the same row is the retry.
  await page.unroute(listing);
  await dock.locator('[data-tree-path="gone"]').click();
  await expect(dock.locator('[data-tree-path="gone/note.txt"]')).toBeVisible();
  await expect(reason).toHaveCount(0);
});
