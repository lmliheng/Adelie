/**
 * Regression: the Files panel's three entry actions — New, rename/move, delete — ask in a
 * `ConfirmModal`, and a refused write keeps that question, with the server's words inside it.
 *
 * All three used to report a failure as a toast: the card stayed open (nothing was written), but
 * the reason arrived as a notification that dismissed itself after six seconds and sat above the
 * card the user was still looking at — while the entry it was about was still there. A rename
 * whose version had gone stale made that worse: the retry carried the same stale marker, so the
 * button beside the vanished reason could only fail again.
 *
 * Now the reason renders in the dialog's `refusal` slot, and a `file_changed` refusal re-reads
 * the entry's version, so the same button retries against the file as it is now.
 *
 * Every refusal here that the server cannot be asked to produce on demand (a read-only
 * Workspace, a file rewritten mid-decision) is a `page.route` answer; the taken name is the
 * server's own.
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
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-files-refusal-")), "files");
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

/** The row's context menu → one of its two entry actions. */
async function askFromRow(page, dock, treePath, item) {
  await dock.locator(`[data-tree-path="${treePath}"]`).click({ button: "right" });
  await page.getByRole("menuitem", { name: item }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a taken name keeps the New dialog with its reason, and a name that is free still creates", async ({
  page,
}) => {
  const { dir, sessionId } = await setUp(page, "filesrefusal1", { "README.md": "# hi\n" });
  const dock = await openFiles(page, sessionId);
  await dock.locator('[data-tree-path="README.md"]').waitFor();

  await dock.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("menuitem", { name: "新建文本文件" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("README.md");
  await dialog.getByRole("button", { name: "创建" }).click();

  // The server's own refusal, in the card that asked: the name is still in the field to be
  // changed, and the notification region holds nothing to dismiss.
  await expect(dialog.getByText("操作被拒绝：README.md 已存在，未做改动。")).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  await expect(dialog.getByRole("textbox")).toHaveValue("README.md");
  expect(fs.readFileSync(path.join(dir, "README.md"), "utf8")).toBe("# hi\n");

  // The same card creates once the name is free, and reopens without the old reason.
  await dialog.getByRole("textbox").fill("notes.md");
  await dialog.getByRole("button", { name: "创建" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(dock.locator('[data-tree-path="notes.md"]')).toBeVisible();
  expect(fs.readFileSync(path.join(dir, "notes.md"), "utf8")).toBe("");

  await dock.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("menuitem", { name: "新建文本文件" }).click();
  await expect(page.getByRole("dialog")).not.toContainText("操作被拒绝");
  await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
});

test("a refused move keeps the dialog, its reason and the file where it was", async ({ page }) => {
  const { dir, sessionId } = await setUp(page, "filesrefusal2", { "docs/notes.md": "notes\n" });
  const dock = await openFiles(page, sessionId);
  await dock.locator('[data-tree-path="docs"]').click();
  await dock.locator('[data-tree-path="docs/notes.md"]').waitFor();

  const REFUSAL = { code: "workspace_read_only", message: "workspace is read-only" };
  const moves = [];
  let refuse = true;
  await page.route("**/api/sessions/*/files/move", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    moves.push(route.request().postDataJSON());
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  const dialog = await askFromRow(page, dock, "docs/notes.md", "重命名 / 移动");
  const sentence = await dialog.innerText();
  await dialog.getByRole("textbox").fill("archive/notes.md");
  await dialog.getByRole("button", { name: "移动" }).click();

  await expect(dialog.getByText(`操作被拒绝：${REFUSAL.message}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(moves).toHaveLength(1);
  // The card reads as it did before the attempt, plus the one refusal line.
  expect((await dialog.innerText()).replace(/\n操作被拒绝：[^\n]*/, "")).toBe(sentence);
  expect(moves[0].to).toBe("archive/notes.md");
  expect(fs.readFileSync(path.join(dir, "docs", "notes.md"), "utf8")).toBe("notes\n");
  expect(fs.existsSync(path.join(dir, "archive"))).toBe(false);

  // The retry is the same button, and this time the move lands.
  refuse = false;
  await dialog.getByRole("button", { name: "移动" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(dock.locator('[data-tree-path="docs/notes.md"]')).toHaveCount(0);
  expect(fs.readFileSync(path.join(dir, "archive", "notes.md"), "utf8")).toBe("notes\n");
});

test("a delete refused because the file moved reads its version again, so the retry lands", async ({
  page,
}) => {
  const { dir, sessionId } = await setUp(page, "filesrefusal3", { "docs/notes.md": "notes\n" });
  const dock = await openFiles(page, sessionId);
  await dock.locator('[data-tree-path="docs"]').click();
  await dock.locator('[data-tree-path="docs/notes.md"]').waitFor();

  const deletes = [];
  let refuse = true;
  await page.route("**/api/sessions/*/files/content*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletes.push(route.request().url());
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "file_changed", message: "the file is not the one that was read" },
      }),
    });
  });

  const dialog = await askFromRow(page, dock, "docs/notes.md", "删除");
  await expect(dialog.getByRole("button", { name: "删除", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "删除", exact: true }).click();

  // The precondition refused it: the sentence names the file and says what happened, in the card
  // itself. The confirm is disabled only while the fresh version is being read.
  await expect(dialog.getByText(/操作被拒绝：notes\.md 在你决定期间被改写/)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(deletes).toHaveLength(1);
  await expect(dialog.getByRole("button", { name: "删除", exact: true })).toBeEnabled();
  expect(fs.readFileSync(path.join(dir, "docs", "notes.md"), "utf8")).toBe("notes\n");

  // Retrying is the same button and now sends the marker of the file as it is: the delete lands.
  refuse = false;
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(deletes).toHaveLength(2);
  expect(fs.existsSync(path.join(dir, "docs", "notes.md"))).toBe(false);
  await expect(dock.locator('[data-tree-path="docs/notes.md"]')).toHaveCount(0);
});
