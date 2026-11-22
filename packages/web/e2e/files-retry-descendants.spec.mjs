/**
 * Regression: retrying a directory whose listing failed also reads again what is still open
 * under it.
 *
 * A failed listing is dropped (the reason stands under the row), so the directories open beneath
 * it are hidden but keep the listing they had before — and that listing is older than whatever
 * made the read fail in the first place. The row's click retried that one directory only, so the
 * subtree came back on screen carrying rows that were no longer true: files the reader (or an
 * Agent) had deleted stayed, new ones were missing, until every folder was collapsed and opened
 * again by hand.
 *
 * Both cases rewrite the fixture from the test itself — the directory tree changing under an open
 * tree is the usual reason the listing fails.
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
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-files-retry-desc-")), "files");
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

/**
 * Refuses one directory's listing (matched by its Workspace-relative path, not the Session).
 * Returns the matcher: `unroute` only forgets a route handed back the same way, and a nested
 * path arrives percent-encoded in the query, so a glob spelling would miss it.
 */
async function refuseDir(page, dir) {
  const match = (url) => url.pathname.endsWith("/files") && url.searchParams.get("path") === dir;
  await page.route(match, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "boom" } }),
    }),
  );
  return match;
}

async function unrefuseDir(page, match) {
  await page.unroute(match);
}

/** Opens docs, docs/api and docs/api/v1 and waits for the deepest listing to be on screen. */
async function openTheWayDown(dock) {
  await dock.locator('[data-tree-path="docs"]').click();
  await dock.locator('[data-tree-path="docs/api"]').waitFor();
  await dock.locator('[data-tree-path="docs/api"]').click();
  await dock.locator('[data-tree-path="docs/api/shallow.txt"]').waitFor();
  await dock.locator('[data-tree-path="docs/api/v1"]').click();
  await dock.locator('[data-tree-path="docs/api/v1/deep.txt"]').waitFor();
}

const REASON = "这个目录读不出来：服务器内部错误，请稍后重试。（点这一行重试）";

test("retrying a failed directory reads its open descendants again, so their rows are true", async ({
  page,
}) => {
  const { dir, sessionId } = await setUp(page, "filesretrydesc1", {
    "docs/api/shallow.txt": "shallow\n",
    "docs/api/v1/deep.txt": "deep\n",
  });
  const dock = await openFiles(page, sessionId);
  await openTheWayDown(dock);

  // docs goes unreadable while the open subtree under it stays open (a transient fault, or the
  // directory being rewritten; the root keeps answering).
  const docsRoute = await refuseDir(page, "docs");
  await dock.getByRole("button", { name: "刷新" }).click();
  const tree = dock.locator('[role="tree"]');
  await expect(tree.getByText(REASON, { exact: true })).toBeVisible();
  // With no listing behind docs, its open descendants are not drawn at all.
  await expect(dock.locator('[data-tree-path="docs/api"]')).toHaveCount(0);
  await expect(dock.locator('[data-tree-path="docs/api/shallow.txt"]')).toHaveCount(0);

  // The tree changes while it is unreadable — exactly what the open subtree's old listing cannot
  // know about.
  fs.unlinkSync(path.join(dir, "docs/api/shallow.txt"));
  fs.writeFileSync(path.join(dir, "docs/api/fresh.txt"), "fresh\n");
  fs.unlinkSync(path.join(dir, "docs/api/v1/deep.txt"));
  fs.writeFileSync(path.join(dir, "docs/api/v1/fresh-deep.txt"), "fresh deep\n");

  await unrefuseDir(page, docsRoute);
  await dock.locator('[data-tree-path="docs"]').click();

  // Both open levels under docs come back listed, not remembered: the new rows are there and the
  // deleted ones are gone, at depth 1 and depth 2 alike.
  await expect(dock.locator('[data-tree-path="docs/api/fresh.txt"]')).toBeVisible();
  await expect(dock.locator('[data-tree-path="docs/api/shallow.txt"]')).toHaveCount(0);
  await expect(dock.locator('[data-tree-path="docs/api/v1/fresh-deep.txt"]')).toBeVisible();
  await expect(dock.locator('[data-tree-path="docs/api/v1/deep.txt"]')).toHaveCount(0);
  await expect(tree.getByText(REASON, { exact: true })).toHaveCount(0);
});

test("when a re-read descendant itself fails, its row carries the reason instead of old rows", async ({
  page,
}) => {
  const { dir, sessionId } = await setUp(page, "filesretrydesc2", {
    "docs/api/shallow.txt": "shallow\n",
  });
  const dock = await openFiles(page, sessionId);
  await dock.locator('[data-tree-path="docs"]').click();
  await dock.locator('[data-tree-path="docs/api"]').click();
  await dock.locator('[data-tree-path="docs/api/shallow.txt"]').waitFor();

  // docs cannot be read; Refresh reads every open directory by itself, so api's own listing is
  // refreshed here (and still true: nothing under it has changed yet).
  const docsRoute = await refuseDir(page, "docs");
  await dock.getByRole("button", { name: "刷新" }).click();
  const tree = dock.locator('[role="tree"]');
  await expect(tree.getByText(REASON, { exact: true })).toBeVisible();
  await expect(dock.locator('[data-tree-path="docs/api"]')).toHaveCount(0);

  // From here on api cannot be read either — only the retry of docs would ever try it.
  const apiRoute = await refuseDir(page, "docs/api");
  fs.unlinkSync(path.join(dir, "docs/api/shallow.txt"));
  fs.writeFileSync(path.join(dir, "docs/api/fresh.txt"), "fresh\n");

  await unrefuseDir(page, docsRoute);
  await dock.locator('[data-tree-path="docs"]').click();

  // api comes back on screen because its parent listed — and says it could not be read itself,
  // rather than showing the rows it had before. The reason is the tree's own, under api's row.
  const apiRow = dock.locator('[data-tree-path="docs/api"]');
  await expect(apiRow).toHaveAttribute("aria-expanded", "true");
  const reasons = tree.getByText(REASON, { exact: true });
  await expect(reasons).toHaveCount(1);
  await expect(dock.locator('[data-tree-path="docs/api/shallow.txt"]')).toHaveCount(0);

  // And api's row is the retry in its turn.
  await unrefuseDir(page, apiRoute);
  await apiRow.click();
  await expect(dock.locator('[data-tree-path="docs/api/fresh.txt"]')).toBeVisible();
  await expect(reasons).toHaveCount(0);
});
