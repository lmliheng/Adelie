/**
 * Regression: a draft the Files panel refuses to save because it is over the write limit keeps its
 * reason under the panel's header, beside the Save button that retries it — instead of leaving only
 * a toast behind.
 *
 * `features/chat/workspace-browser.tsx` measured the draft itself and sent nothing at all, yet the
 * words fell into a notification that dismissed itself after six seconds: afterwards the panel
 * looked exactly as it had before the press, the file on disk still held the old text, and the
 * fifteen megabytes the reader had typed were sitting in the textarea with no word about why they
 * were not in the file. Nothing was written here, so there is no server answer to read — the
 * sentence is the panel's own, and it belongs in the same slot as a refused write's.
 *
 * No route is stubbed: the point of this refusal is that no request leaves the browser, which the
 * test asserts by watching the write route.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const FILE = "notes.md";
const STORED = "first line\n";
/** The panel's own write limit (`WORKSPACE_UPLOAD_LIMIT_MB`); the draft has to be over it. */
const LIMIT_MB = 14;
const BIG_DRAFT = "x".repeat((LIMIT_MB + 1) * 1024 * 1024);

/** The write route, query string and all (the path travels in `?path=`). */
const WRITE_ROUTE = "**/api/sessions/*/files/content**";

/** A Project with the mock as its model, and one Session whose Workspace holds one file. */
async function setUp(page, user) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-editor-toolarge-")), "files");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FILE), STORED);
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

/** The file opened in the editor with the too-large draft typed into it. */
async function openEditorWithBigDraft(page, dock) {
  await dock.locator(`[data-tree-path="${FILE}"]`).click();
  await dock.getByRole("button", { name: "编辑", exact: true }).click();
  const editor = dock.getByRole("textbox", { name: `编辑 ${FILE}` });
  await expect(editor).toBeVisible();
  await editor.fill(BIG_DRAFT);
  return editor;
}

/** Save is behind a confirmation whose own button is the write. */
async function pressSave(page, dock) {
  await dock.getByRole("button", { name: "保存", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
}

test("a draft over the write limit keeps its reason under the header, and nothing is sent", async ({
  page,
}) => {
  const { dir, sessionId } = await setUp(page, "r283toolarge");
  const dock = await openFiles(page, sessionId);
  const editor = await openEditorWithBigDraft(page, dock);

  // Every write that would leave the browser, watched rather than stubbed: this refusal happens
  // before any of them, so the count stays at zero.
  const writes = [];
  await page.route(WRITE_ROUTE, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    writes.push(route.request().postDataJSON());
    await route.fallback();
  });

  await pressSave(page, dock);

  // The reason is under the header and it is not a toast: the notification region never carries it.
  const line = dock.getByRole("alert");
  await expect(line).toContainText("保存失败");
  await expect(line).toContainText(`内容超过 ${LIMIT_MB}MB 写入上限`);
  await expect(line).toContainText("编辑器里的改动没有写进文件");
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText("写入上限");
  expect(writes).toHaveLength(0);

  // Nothing was written and nothing was lost: the file holds the old text, the editor the draft,
  // and the Save that retried is still in the header.
  expect(fs.readFileSync(path.join(dir, FILE), "utf8")).toBe(STORED);
  expect((await editor.inputValue()).length).toBe(BIG_DRAFT.length);
  await expect(dock.getByRole("button", { name: "保存", exact: true })).toBeVisible();

  // Still there after the toast would have gone.
  await page.waitForTimeout(7000);
  await expect(line).toContainText("写入上限");

  // Typing answers the question the line described: it goes with the text it was about.
  await editor.fill("first line\n短一点，就能存了。\n");
  await expect(dock.getByRole("alert")).toHaveCount(0);

  // The retry lands: the file takes the new text and the line stays gone.
  await pressSave(page, dock);
  await expect(dock.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "通知" })).toContainText("已保存");
  expect(fs.readFileSync(path.join(dir, FILE), "utf8")).toBe("first line\n短一点，就能存了。\n");
});

test("leaving the editor takes the too-large reason with it", async ({ page }) => {
  const { sessionId } = await setUp(page, "r283toolarge2");
  const dock = await openFiles(page, sessionId);
  await openEditorWithBigDraft(page, dock);

  await pressSave(page, dock);
  await expect(dock.getByRole("alert")).toContainText("写入上限");

  // × asks first (the draft is unsaved), and answering it drops the draft and the line together.
  await dock.getByRole("button", { name: "退出编辑", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "放弃", exact: true }).click();
  await expect(dock.getByRole("alert")).toHaveCount(0);
  await expect(dock.getByRole("textbox", { name: `编辑 ${FILE}` })).toHaveCount(0);
});
