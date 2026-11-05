/**
 * Regression: a handbook edit the server refuses keeps its reason above the draft, inside the
 * editor that holds the text and the Save button that retries it — instead of leaving only a
 * toast behind.
 *
 * `features/company/handbook-page.tsx` closed nothing on a refused save (the editor stayed open
 * with the draft in it), but the reason fell into a notification that dismissed itself after a
 * few seconds: afterwards the editor looked exactly as it had before the press, with the same
 * draft and the same button, and no word about why nothing was written. The line now stays above
 * the draft until the text is edited, Save is pressed again or the edit is cancelled.
 *
 * The organization and the document are made through the API rather than through the dialogs.
 * Company mode is off on a fresh server, so the test turns the admin master switch on first
 * (idempotent), and the Project gets the mock as its model so the onboarding overlay stays off
 * the page.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "orgsaverefuse";
const MISSION = "把插件市场上线，做到搜索前三。";
const DOC = "decisions/2026-10-25-hire-plan.md";
const DOC_BODY = "# 招聘计划\n\n先招两名工程师。\n";
const DRAFT = "# 招聘计划\n\n先招三名工程师，九月前到岗。\n";

/** The refusal the page paints; a 500 with its own words proves those words came back. */
const REFUSAL = {
  code: "org_store_locked",
  message: "the organization store is mid-rewrite",
};

/** The admin master switch, off by default: turned on server-wide before the flow starts. */
async function enableCompanyMode() {
  const adminCtx = await request.newContext();
  try {
    await login(adminCtx, ADMIN_ID, ADMIN_PASSWORD);
    const res = await adminCtx.put(`${BASE}/api/admin/settings`, { data: { companyMode: true } });
    if (!res.ok()) {
      throw new Error(`enable company mode failed: ${res.status()} ${await res.text()}`);
    }
  } finally {
    await adminCtx.dispose();
  }
}

/** A fresh user with mock-model credentials, an organization, and one handbook document. */
async function setUp(page, tag) {
  await enableCompanyMode();
  const user = `${tag}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  await provisionAndLogin(page.request, user, P);
  const project = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0];
  const projectId = project.projectId;
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
  expect(put.ok(), `put models ${projectId}`).toBeTruthy();

  const orgBase = `${BASE}/api/projects/${projectId}/organizations`;
  const created = await page.request.post(orgBase, { data: { orgId: ORG, mission: MISSION } });
  expect(created.ok(), "create organization").toBeTruthy();
  const docUrl = `${orgBase}/${ORG}/handbook/files/${DOC}`;
  const written = await page.request.put(docUrl, { data: { content: DOC_BODY } });
  expect(written.ok(), "write the handbook document").toBeTruthy();

  /** The document as the server has it. */
  const read = async () => (await (await page.request.get(docUrl)).json()).content;
  return { projectId, docUrl, read };
}

/** The document's row selected, its Edit pressed, and the draft typed over. */
async function openEditor(page, projectId) {
  await page.goto(`/org/${projectId}/${ORG}/handbook`);
  // Folders start closed: the document's own folder is opened by hand, as a reader would.
  await page.locator('[data-tree-path="decisions"]').click();
  const row = page.locator(`[data-tree-path="${DOC}"]`);
  await expect(row).toBeVisible();
  await row.click();
  const pane = page.getByRole("region", { name: DOC });
  await expect(pane).toBeVisible();
  await pane.getByRole("button", { name: "编辑", exact: true }).click();
  const editor = pane.getByRole("textbox", { name: DOC });
  await expect(editor).toBeVisible();
  await editor.fill(DRAFT);
  return { pane, editor };
}

test("a refused handbook save keeps its reason above the draft", async ({ page }) => {
  const { projectId, docUrl, read } = await setUp(page, "r198hbsave");
  expect(await read()).toBe(DOC_BODY);

  const { pane, editor } = await openEditor(page, projectId);

  const saves = [];
  await page.route(docUrl, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    saves.push(route.request().postData());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await pane.getByRole("button", { name: "保存", exact: true }).click();

  // The reason is above the draft, and it is not a toast: the notification region (which may
  // still hold the company beta's own notice) never carries the server's words.
  const line = pane.getByRole("alert");
  await expect(line).toContainText(REFUSAL.message);
  await expect(line).toContainText("编辑器里的改动没有写进文件");
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(saves).toHaveLength(1);

  // Nothing was written and nothing was lost: the file still holds the old text, while the
  // editor still holds the draft and is still open — Save is the retry.
  expect(await read()).toBe(DOC_BODY);
  await expect(editor).toHaveValue(DRAFT);
  await expect(pane.getByRole("button", { name: "保存", exact: true })).toBeVisible();

  // Still there after the toast would have gone.
  await page.waitForTimeout(7000);
  await expect(line).toContainText(REFUSAL.message);

  // Editing the draft answers a new question: the line goes with the text it described.
  await editor.fill(`${DRAFT}再补一条备选方案。\n`);
  await expect(pane.getByRole("alert")).toHaveCount(0);

  // The retry lands: the editor closes, the rendered document is the new text, and the file has it.
  await page.unroute(docUrl);
  await pane.getByRole("button", { name: "保存", exact: true }).click();
  await expect(pane.getByRole("textbox", { name: DOC })).toHaveCount(0);
  await expect(pane).toContainText("再补一条备选方案");
  await expect(editor).toHaveCount(0);
  expect(await read()).toBe(`${DRAFT}再补一条备选方案。\n`);

  // And cancelling after a refusal drops the draft and the line together.
  const again = await openEditor(page, projectId);
  await page.route(docUrl, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
  await again.pane.getByRole("button", { name: "保存", exact: true }).click();
  await expect(again.pane.getByRole("alert")).toContainText(REFUSAL.message);
  await again.pane.getByRole("button", { name: "取消", exact: true }).click();
  await expect(again.pane.getByRole("alert")).toHaveCount(0);
  await expect(again.pane.getByRole("textbox", { name: DOC })).toHaveCount(0);
});
