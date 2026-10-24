/**
 * Regression: deleting a handbook document is asked in a confirmation card, and a refused
 * delete keeps that question — with the server's words inside it — instead of leaving only a
 * toast behind.
 *
 * The card in `features/company/handbook-page.tsx` (the selected document's own Delete button)
 * already stayed open on a refusal, but its reason fell into a toast that dismissed itself after
 * a few seconds and sat over the card rather than in it. It now closes only once its delete
 * landed; a refusal leaves the card standing with the reason drawn under its sentence
 * (`ConfirmModal`'s `refusal` slot), so the retry is the button that was pressed and cancelling
 * decides nothing.
 *
 * The organization and the document are made through the API rather than through the dialogs:
 * this spec is about the confirmation, not about creation. Company mode is off on a fresh
 * server, so the test turns the admin master switch on first (idempotent), and the Project gets
 * the mock as its model so the onboarding overlay stays off the page.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const ORG = "orgdelrefuse";
const MISSION = "把插件市场上线，做到搜索前三。";
/** The document the flow deletes; the index (README.md) is the one the server never lets go. */
const DOC = "decisions/2026-10-25-hire-plan.md";
const DOC_BODY = "# 招聘计划\n\n先招两名工程师。\n";

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

/**
 * A fresh user with mock-model credentials, an organization whose CEO the server makes on
 * creation, and one handbook document written straight through the API.
 */
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

  /** The document as the server has it: null once it is really gone. */
  const read = async () => {
    const res = await page.request.get(docUrl);
    return res.ok() ? (await res.json()).content : null;
  };
  return { projectId, docUrl, read };
}

/** The selected document's Delete button → the confirmation card (a dialog of its own). */
async function openDeleteCard(page, projectId) {
  await page.goto(`/org/${projectId}/${ORG}/handbook`);
  // Folders start closed: the document's own folder is opened by hand, as a reader would.
  await page.locator('[data-tree-path="decisions"]').click();
  const row = page.locator(`[data-tree-path="${DOC}"]`);
  await expect(row).toBeVisible();
  await row.click();
  // The document's path heads its pane once the row is the selection.
  await expect(page.getByRole("region", { name: DOC })).toBeVisible();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  const card = page.getByRole("dialog", { name: "删除文档" });
  await expect(card).toBeVisible();
  return card;
}

/**
 * The card's own text with the refusal line dropped: a refused write adds one line under the
 * sentence ("操作被拒绝：…"), and that line is the only thing the refusal may change.
 */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused handbook deletion keeps the card, its sentence and the document", async ({
  page,
}) => {
  const { projectId, docUrl, read } = await setUp(page, "r126hbdel");
  expect(await read()).toBe(DOC_BODY);

  const card = await openDeleteCard(page, projectId);
  const sentence = await cardText(card);
  expect(sentence).toContain(DOC);

  const deletes = [];
  await page.route(docUrl, async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletes.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await card.getByRole("button", { name: "删除", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region (which
  // may still hold the company beta's own notice) never carries the server's words, and the card
  // reads exactly as before plus the one line.
  await expect(card.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" })).not.toContainText(REFUSAL.message);
  expect(deletes).toHaveLength(1);
  await expect(card).toBeVisible();
  expect(await cardText(card)).toBe(sentence);

  // Nothing was written: the document still reads, and its row is still in the tree.
  expect(await read()).toBe(DOC_BODY);
  await expect(page.locator(`[data-tree-path="${DOC}"]`)).toBeVisible();

  // Closing the card decides nothing, and reopening it does not carry the old reason.
  await card.getByRole("button", { name: "取消" }).click();
  await expect(card).toHaveCount(0);
  const again = await openDeleteCard(page, projectId);
  await expect(again.getByText(REFUSAL.message)).toHaveCount(0);
  expect(await again.innerText()).toBe(sentence);

  // The retry lands: the card goes, the document is gone, and the pane falls back to the index.
  await page.unroute(docUrl);
  await again.getByRole("button", { name: "删除", exact: true }).click();
  await expect(again).toHaveCount(0);
  await expect(page.locator(`[data-tree-path="${DOC}"]`)).toHaveCount(0);
  expect(await read()).toBeNull();
  await expect(page.getByRole("region", { name: "README.md" })).toBeVisible();
});
