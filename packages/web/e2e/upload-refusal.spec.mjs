/**
 * Regression: an upload the Files panel cannot land keeps its reason above the listing, instead of
 * leaving only a toast that dismisses itself after six seconds.
 *
 * `features/chat/workspace-browser.tsx` wrote nothing and moved nothing on a refused upload: the
 * file never appeared in the tree, the directory still held what it held, and the picker was ready
 * for the same files again — with no word about why. Afterwards the panel looked exactly as it had
 * before the pick, and the files were still only where they were read from.
 *
 * The write is stubbed (the real route would need a Workspace that refuses writes, which a test
 * cannot arrange); everything else — the session, the directory, the write that lands — is the
 * app's own.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** The write route, query string and all (the path travels in `?path=`). */
const WRITE_ROUTE = "**/api/sessions/*/files/content**";

/** The refusal the panel paints: its code has its own Chinese copy, so its English words must not appear. */
const REFUSAL = {
  code: "dir_permission_denied",
  message: "permission denied for the workspace directory",
};
/** S.errors.byCode.dir_permission_denied, the sentence that code stands for. */
const SENTENCE = "没有访问该目录的权限。";
/** The Workspace root as the panel names it (S.files.root). */
const ROOT = ".";

/** A Project with the mock as its model, and one Session on an empty Workspace. */
async function setUp(page, user) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-upload-")), "files");
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

/** The Files panel on the session's page, with the tree loaded. */
async function openFiles(page, sessionId) {
  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).waitFor();
  await page.getByTestId("dock-toggle-right").click();
  await page.getByTestId("dock-pick-workspace").click();
  const dock = page.getByTestId("dock");
  await dock.locator('[role="tree"]').waitFor();
  return dock;
}

/** Picks files through the toolbar's own picker, as a reader would. */
async function pick(dock, files) {
  await dock.locator('input[type="file"]:not([aria-hidden])').setInputFiles(
    files.map(([name, text]) => ({
      name,
      mimeType: "text/markdown",
      buffer: Buffer.from(text),
    })),
  );
}

test("a refused upload keeps its reason above the listing, and picking again is the retry", async ({
  page,
}) => {
  const { dir, sessionId } = await setUp(page, "r201upload");
  const dock = await openFiles(page, sessionId);

  await page.route(WRITE_ROUTE, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await pick(dock, [["notes.md", "first line\n"]]);

  // The reason is above the listing and it is not a toast: the notification region never carries it.
  const line = dock.getByRole("alert");
  await expect(line).toContainText(`上传到 ${ROOT} 失败：${SENTENCE}`);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(SENTENCE);

  // Nothing was written: the directory is still empty and the tree has no row for the file.
  expect(fs.readdirSync(dir)).toEqual([]);
  await expect(dock.locator('[data-tree-path="notes.md"]')).toHaveCount(0);
  // The picker still takes the same files again.
  await expect(dock.locator('input[type="file"]:not([aria-hidden])')).toBeEnabled();

  // Still there after the toast would have gone.
  await page.waitForTimeout(7000);
  await expect(line).toContainText(SENTENCE);

  // The retry lands: the file appears, the success is the notification, and the line is gone.
  await page.unroute(WRITE_ROUTE);
  await pick(dock, [["notes.md", "first line\n"]]);
  await expect(dock.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" })).toContainText("已上传 1 个文件");
  await expect.poll(() => fs.readdirSync(dir)).toEqual(["notes.md"]);
});

test("a batch that lands halfway names only the files that did not go up", async ({ page }) => {
  const { dir, sessionId } = await setUp(page, "r201uploadpart");
  const dock = await openFiles(page, sessionId);

  let writes = 0;
  await page.route(WRITE_ROUTE, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    writes += 1;
    if (writes === 1) return route.fallback(); // the first file really lands
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await pick(dock, [
    ["a.md", "A\n"],
    ["b.md", "B\n"],
    ["c.md", "C\n"],
  ]);

  const line = dock.getByRole("alert");
  await expect(line).toContainText(`上传到 ${ROOT} 时，b.md, c.md 没有上传：${SENTENCE}`);
  // The one that landed is not named as a failure.
  await expect(line).not.toContainText("a.md");

  // a.md is really on disk; the two behind it are not, and the row for the one that landed is there.
  expect(fs.readdirSync(dir)).toEqual(["a.md"]);
  await expect(dock.locator('[data-tree-path="a.md"]')).toHaveCount(1);
  await expect(dock.locator('[data-tree-path="b.md"]')).toHaveCount(0);
  expect(writes).toBe(2);
});
