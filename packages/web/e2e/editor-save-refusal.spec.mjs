/**
 * Regression: a save the Files panel's editor cannot land keeps its reason under the panel's
 * header, beside the Save button that retries it — instead of leaving only a toast behind.
 *
 * `features/chat/workspace-browser.tsx` wrote nothing and closed nobody on a refused save: the
 * editor stayed open with the draft in it, the header still carried Save, and the reason fell into
 * a notification that dismissed itself after six seconds. Afterwards the panel looked exactly as
 * it had before the press, the file on disk still held the old text, and the text the reader had
 * typed was nowhere but the textarea — with no word about why.
 *
 * The write is stubbed (the real route would need a Workspace that refuses writes, which a test
 * cannot arrange); everything else — the session, the file, the editor, the draft — is the app's
 * own.
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
const DRAFT = "first line\n第二行：先跑起来。\n";

/** The write route, query string and all (the path travels in `?path=`). */
const WRITE_ROUTE = "**/api/sessions/*/files/content**";

/** The refusal the panel paints: its code has its own Chinese copy, so its English words must not appear. */
const REFUSAL = {
  code: "dir_permission_denied",
  message: "permission denied for the workspace directory",
};
/** S.errors.byCode.dir_permission_denied, the sentence that code stands for. */
const SENTENCE = "没有访问该目录的权限。";

/** A Project with the mock as its model, and one Session whose Workspace holds one file. */
async function setUp(page, user) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-editor-save-")), "files");
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

/** The file opened in the editor with the draft typed over. */
async function openEditor(page, dock) {
  await dock.locator(`[data-tree-path="${FILE}"]`).click();
  await dock.getByRole("button", { name: "编辑", exact: true }).click();
  const editor = dock.getByRole("textbox", { name: `编辑 ${FILE}` });
  await expect(editor).toBeVisible();
  await editor.fill(DRAFT);
  return editor;
}

/** Save is behind a confirmation whose own button is the write. */
async function pressSave(page, dock) {
  await dock.getByRole("button", { name: "保存", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
}

test("a refused save keeps its reason under the header, and Save is the retry", async ({
  page,
}) => {
  const { dir, sessionId } = await setUp(page, "r200edsave");
  const dock = await openFiles(page, sessionId);
  const editor = await openEditor(page, dock);

  const writes = [];
  await page.route(WRITE_ROUTE, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    writes.push(route.request().postDataJSON());
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await pressSave(page, dock);

  // The reason is under the header and it is not a toast: the notification region never carries it.
  const line = dock.getByRole("alert");
  await expect(line).toContainText(SENTENCE);
  await expect(line).toContainText("编辑器里的改动没有写进文件");
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(SENTENCE);
  expect(writes).toHaveLength(1);

  // Nothing was written and nothing was lost: the file holds the old text, the editor the draft,
  // and the Save that retried is still in the header.
  expect(fs.readFileSync(path.join(dir, FILE), "utf8")).toBe(STORED);
  await expect(editor).toHaveValue(DRAFT);
  await expect(dock.getByRole("button", { name: "保存", exact: true })).toBeVisible();

  // Still there after the toast would have gone.
  await page.waitForTimeout(7000);
  await expect(line).toContainText(SENTENCE);

  // Typing answers the question the line described: it goes with the text it was about.
  await editor.fill(`${DRAFT}再补一句。\n`);
  await expect(dock.getByRole("alert")).toHaveCount(0);

  // The retry lands: the file takes the new text and the line stays gone.
  await page.unroute(WRITE_ROUTE);
  await pressSave(page, dock);
  await expect(dock.getByRole("alert")).toHaveCount(0);
  // What did land is the write's own success notification — nothing left to keep on the panel.
  await expect(page.getByRole("region", { name: "通知" })).toContainText("已保存");
  expect(fs.readFileSync(path.join(dir, FILE), "utf8")).toBe(`${DRAFT}再补一句。\n`);
});

test("leaving the editor takes a refused save's reason with it", async ({ page }) => {
  const { sessionId } = await setUp(page, "r200edsave2");
  const dock = await openFiles(page, sessionId);
  await openEditor(page, dock);

  await page.route(WRITE_ROUTE, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
  await pressSave(page, dock);
  await expect(dock.getByRole("alert")).toContainText(SENTENCE);

  // × asks first (the draft is unsaved), and answering it drops the draft and the line together.
  await dock.getByRole("button", { name: "退出编辑", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "放弃", exact: true }).click();
  await expect(dock.getByRole("alert")).toHaveCount(0);
  await expect(dock.getByRole("textbox", { name: `编辑 ${FILE}` })).toHaveCount(0);
});
