/**
 * Regression: pressing Edit in the Files panel when the editor cannot open — a file over the
 * preview ceiling, or a source read that fails — keeps its reason on the panel instead of leaving
 * only a notification that dismisses itself after six seconds.
 *
 * An isolated HTML preview mounts its iframe without the text, so the Edit click is what reads
 * the source; that read is where an oversize file or a failed fetch turns the press into nothing
 * at all. Nothing else on screen moves either way: the preview is still there and Edit is still
 * the button under the pointer. The sentence is drawn above the preview (edit-open-refusal.ts),
 * where the next press replaces it.
 *
 * The oversize half is the panel's own measurement and no route is stubbed for it; the failed half
 * answers the content route with a 500, because that is the one thing the panel cannot produce by
 * itself.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** One byte over TEXT_PREVIEW_LIMIT (1MB): the preview still renders, the source can never be edited in place. */
const OVER_LIMIT = 1024 * 1024 + 4096;

/** A Project with the mock as its model, and one Session on a Workspace holding both files. */
async function setUp(page, user) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-editopen-")), "files");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "big.html"),
    `<html><body><h1>Big page</h1>${"<p>filler</p>".repeat(OVER_LIMIT / 13)}</body></html>`,
  );
  fs.writeFileSync(path.join(dir, "small.html"), "<html><body><h1>Small page</h1></body></html>");
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
  return (await res.json()).session.sessionId;
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

/** Opens a file from the tree and waits for its isolated preview to render. */
async function openPreview(dock, name, heading) {
  await dock
    .getByRole("treeitem", { name: new RegExp(name) })
    .first()
    .click();
  await dock.frameLocator("iframe").getByText(heading).waitFor();
}

/** The panel's Edit button: icon-only, named by the shared label rather than the file. */
const editButton = (dock) => dock.getByRole("button", { name: "编辑", exact: true });

/** The notification area's entries, one close button each. */
const notifications = (page) => page.getByRole("region", { name: "通知" }).getByRole("button");

test("an oversize HTML file: Edit says why on the panel and the button stays the retry", async ({
  page,
}) => {
  const sessionId = await setUp(page, "e2eeditbig");
  const dock = await openFiles(page, sessionId);
  await openPreview(dock, "big.html", "Big page");

  await editButton(dock).click();

  // The read the click starts is a stream, so the line lands a moment later — and stays.
  const line = dock.getByRole("alert").filter({ hasText: "1024KB" });
  await expect(line).toHaveCount(1);
  await expect(notifications(page)).toHaveCount(0);
  // Nothing else moved: the preview and its Edit button are exactly where the click found them.
  await expect(dock.frameLocator("iframe").getByText("Big page")).toBeVisible();
  await expect(editButton(dock)).toBeVisible();
  // The sentence is about this press, not a leftover: it is still there well after a toast would
  // have gone. (Six seconds is the toast's own lifetime; this waits past it.)
  await page.waitForTimeout(7000);
  await expect(line).toHaveCount(1);
  await expect(notifications(page)).toHaveCount(0);
});

test("a failed source read: Edit says why on the panel, not in a toast", async ({ page }) => {
  const sessionId = await setUp(page, "e2eeditfail");
  const dock = await openFiles(page, sessionId);
  await openPreview(dock, "small.html", "Small page");

  // The source read the Edit click starts is the one that fails.
  await page.route("**/sessions/*/files/content**", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"internal"}' }),
  );
  await editButton(dock).click();

  const line = dock.getByRole("alert").filter({ hasText: "无法打开编辑器" });
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("HTTP 500");
  await expect(notifications(page)).toHaveCount(0);
  await expect(editButton(dock)).toBeVisible();
});
