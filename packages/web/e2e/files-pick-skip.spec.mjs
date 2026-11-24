/**
 * Regression: files the Files panel refuses to hand over at pick time — over the upload ceiling, or
 * a folder a drop cannot turn into a file — keep their names above the listing, instead of leaving
 * only a toast that dismisses itself after six seconds.
 *
 * `features/chat/workspace-browser.tsx` reads nothing and sends nothing in that branch: the panel's
 * own measurement decides, so the tree still holds the directory it held and the pick leaves no
 * trace at all. Afterwards the reader is looking at the same panel as before the pick, with the file
 * still only where it was picked from. The names go where a refused upload's reason goes, and the
 * next pick answers them.
 *
 * No route is stubbed: the refusal is the panel's own, and the uploads that do run are the app's.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** Every write the panel could make (the path travels in `?path=`); counted, never intercepted. */
const WRITE_ROUTE = "**/api/sessions/*/files/content**";

/** WORKSPACE_UPLOAD_LIMIT_MB, the ceiling the panel measures against. */
const LIMIT_MB = 14;
/** One byte over it: the boundary itself is legal. */
const OVER_LIMIT = LIMIT_MB * 1024 * 1024 + 1;

/** A Project with the mock as its model, and one Session on an empty Workspace. */
async function setUp(page, user) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-pickskip-")), "files");
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
    files.map(([name, buffer]) => ({
      name,
      mimeType: "application/octet-stream",
      buffer,
    })),
  );
}

test("a pick over the ceiling names the file above the listing and sends nothing", async ({
  page,
}) => {
  const { dir, sessionId } = await setUp(page, "r318pickskip");
  const dock = await openFiles(page, sessionId);

  let writes = 0;
  await page.route(WRITE_ROUTE, async (route) => {
    if (route.request().method() === "PUT") writes += 1;
    await route.fallback();
  });

  await pick(dock, [["big.bin", Buffer.alloc(OVER_LIMIT)]]);

  // The names are above the listing, and the notification region never carries them.
  const line = dock.getByRole("alert");
  await expect(line).toContainText(`超过 ${LIMIT_MB}MB 上传上限，已跳过：big.bin`);
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText("上传上限");

  // Nothing was read or sent: no write went out, and the directory is still empty.
  expect(writes).toBe(0);
  expect(fs.readdirSync(dir)).toEqual([]);
  await expect(dock.locator('[data-tree-path="big.bin"]')).toHaveCount(0);

  // Still there after the toast would have gone.
  await page.waitForTimeout(7000);
  await expect(line).toContainText("big.bin");
});

test("a mixed pick uploads what it can and keeps naming what it skipped", async ({ page }) => {
  const { dir, sessionId } = await setUp(page, "r318pickskipmix");
  const dock = await openFiles(page, sessionId);

  await pick(dock, [
    ["big.bin", Buffer.alloc(OVER_LIMIT)],
    ["notes.md", Buffer.from("first line\n")],
  ]);

  // The file inside the ceiling really lands; the one over it is named and stays named, while the
  // success arrives as the notification it always was.
  const line = dock.getByRole("alert");
  await expect(line).toContainText(`超过 ${LIMIT_MB}MB 上传上限，已跳过：big.bin`);
  await expect(page.getByRole("region", { name: "通知" })).toContainText("已上传 1 个文件");
  await expect.poll(() => fs.readdirSync(dir)).toEqual(["notes.md"]);
  await expect(dock.locator('[data-tree-path="notes.md"]')).toHaveCount(1);
  await expect(dock.locator('[data-tree-path="big.bin"]')).toHaveCount(0);

  // Still there after the toast would have gone: the skip is the only lasting trace of big.bin.
  await page.waitForTimeout(7000);
  await expect(line).toContainText("已跳过：big.bin");

  // The next pick answers it: nothing was skipped, so the sentence goes away.
  await pick(dock, [["second.md", Buffer.from("second\n")]]);
  await expect(dock.getByRole("alert")).toHaveCount(0);
  await expect.poll(() => fs.readdirSync(dir).sort()).toEqual(["notes.md", "second.md"]);
});
