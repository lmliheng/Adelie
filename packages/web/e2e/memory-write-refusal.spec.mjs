/**
 * Regression: deleting a memory and importing a memory document both ask first, and a refused
 * write keeps that question — with the server's words inside it — instead of closing on the way
 * out of the request.
 *
 * The delete confirmation used to close itself before the request even left, and the import ran
 * behind a toast: when the server refused, the memory (and the document's target files) were
 * still there, on the page and on disk, while the reason arrived as a toast that dismissed itself
 * after six seconds and sat above the modal. Both surfaces now close only once the write landed:
 * the delete confirmation keeps the server's words in `ConfirmModal`'s `refusal` slot, and an
 * import reports inside whichever surface asked — the plan confirmation when one was shown, the
 * import modal when nothing would have been lost — so the retry is the same button.
 *
 * The memory files are seeded through the export document the import route accepts, because the
 * tab has no "new file" form by design (a memory's text is the model's document; the tab bridges
 * to a chat). Only the owner may import, and provisioning makes this user the owner.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";
const FILE = "probe-memory.md";
const TITLE = "Probe memory";

/** The refused write: a 500 with its own words proves the reason came back into the surface. */
const REFUSAL = { code: "memory_store_closed", message: "memory store is closed" };

/** One memory document as the export route writes it (the import route's own shape). */
function documentFor(content) {
  return {
    format: "penguin-memory-scope",
    version: 1,
    scopeKey: "user",
    kind: "user",
    exportedAt: new Date().toISOString(),
    index: `- [${TITLE}](${FILE}) — seeded by the e2e run\n`,
    files: [
      {
        name: FILE,
        content: `---\nname: ${TITLE}\ndescription: A memory the refusal tests act on.\n---\n\n${content}\n`,
      },
    ],
  };
}

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and seed one user-scope memory through the import route. Rerunning this file shares one
 * data root with earlier runs, so the seed overwrites what a previous run left.
 */
async function projectWithMemory(page, user, content) {
  await provisionAndLogin(page.request, user, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const models = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
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
  expect(models.ok(), "put models").toBeTruthy();

  const scopeBase = `${BASE}/api/projects/${projectId}/agents/${AGENT}/memory/scopes/user`;
  const seeded = await page.request.post(`${scopeBase}/import`, {
    data: { mode: "overwrite", confirm: true, payload: documentFor(content) },
  });
  expect(seeded.ok(), "seed the memory").toBeTruthy();

  /** The scope's topic files as the server holds them: what the page reads. */
  const files = async () => (await (await page.request.get(`${scopeBase}/files`)).json()).files;

  return { projectId, files };
}

/** The seeded memory's row, addressed by its title rather than by position. */
function rowOf(page) {
  return page
    .locator("li")
    .filter({ has: page.getByText(TITLE, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: `删除 ${TITLE}` }) })
    .last();
}

/** The row's trash button → the shared confirmation. */
async function openDeleteDialog(page) {
  await rowOf(page)
    .getByRole("button", { name: `删除 ${TITLE}` })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("a refused delete keeps the confirmation, its sentence and the memory", async ({ page }) => {
  const { files } = await projectWithMemory(page, "r116mem1", "The first version of the probe.");
  const before = await files();

  await page.goto(`/agents/${AGENT}?tab=memory`);
  await expect(page.getByText(TITLE, { exact: true })).toBeVisible();
  const dialog = await openDeleteDialog(page);
  const sentence = await dialog.innerText();
  expect(sentence).toContain(TITLE);

  const deletes = [];
  await page.route("**/api/projects/*/agents/*/memory/scopes/*/files/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletes.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
  await dialog.getByRole("button", { name: "删除", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region holds
  // no dismissible button, and the card reads exactly as it did before the attempt plus the one
  // refusal line.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(deletes).toHaveLength(1);
  await expect(dialog).toBeVisible();
  expect((await dialog.innerText()).replace(/\n操作被拒绝：[^\n]*/, "")).toBe(sentence);

  // Nothing was deleted anywhere: the row is still on the page and the server still holds it.
  await expect(rowOf(page)).toBeVisible();
  expect(await files()).toEqual(before);

  // Closing the card decides nothing.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rowOf(page)).toBeVisible();
});

test("the retry after a refused delete removes it, and only a written one closes the card", async ({
  page,
}) => {
  const { files } = await projectWithMemory(page, "r116mem2", "A memory kept until it is removed.");

  const deletes = [];
  let refuse = true;
  await page.route("**/api/projects/*/agents/*/memory/scopes/*/files/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletes.push(route.request().url());
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await page.goto(`/agents/${AGENT}?tab=memory`);
  await expect(page.getByText(TITLE, { exact: true })).toBeVisible();
  const dialog = await openDeleteDialog(page);
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(deletes).toHaveLength(1);

  // The retry is the same card, and this time the write lands: card gone, memory gone.
  refuse = false;
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(deletes).toHaveLength(2);
  await expect(rowOf(page)).toHaveCount(0);
  expect((await files()).some((f) => f.name === FILE)).toBe(false);
});

test("a refused import keeps the plan confirmation and the memories it named", async ({ page }) => {
  const { files } = await projectWithMemory(page, "r116mem3", "What the scope held first.");

  const imports = [];
  await page.route("**/api/projects/*/agents/*/memory/scopes/*/import", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    imports.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await page.goto(`/agents/${AGENT}?tab=memory`);
  await expect(page.getByText(TITLE, { exact: true })).toBeVisible();
  // The user scope is the first group, so its header's file input is the first on the page.
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "probe-scope.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(documentFor("What the document brought."))),
    });

  const importModal = page.getByRole("dialog").filter({ hasText: "导入记忆" });
  await expect(importModal).toBeVisible();
  // A mode that would overwrite the same-named memory: the plan confirmation sits on top.
  await importModal.getByRole("radio", { name: "改用文件里的版本" }).click();
  await importModal.getByRole("button", { name: "导入", exact: true }).click();
  // ConfirmModal renders no title bar: its name lives on the dialog's accessible name only.
  const plan = page.getByRole("dialog", { name: "确认导入" });
  await expect(plan).toBeVisible();

  const sentence = await plan.innerText();
  await plan.getByRole("button", { name: "导入", exact: true }).click();
  await expect(plan.getByText(REFUSAL.message)).toBeVisible();
  await expect(plan).toBeVisible();
  expect(imports).toHaveLength(1);
  // The card's own sentence is untouched apart from the refusal line.
  expect((await plan.innerText()).replace(/\n操作被拒绝：[^\n]*/, "")).toBe(sentence);

  // The scope still holds what it held: nothing was written.
  const held = await files();
  expect(held).toHaveLength(1);
  expect(held[0].name).toBe(FILE);

  // Cancelling the plan comes back to the import modal — which now carries the same reason, so
  // the sentence is still on screen when the mode choice returns.
  await plan.getByRole("button", { name: "取消" }).click();
  await expect(plan).toHaveCount(0);
  await expect(importModal.getByText(REFUSAL.message)).toBeVisible();

  // Choosing another mode starts clean: that reason named the attempt before it.
  await importModal.getByRole("radio", { name: "保留现有的这条" }).click();
  await expect(importModal.getByText(REFUSAL.message)).toHaveCount(0);
});
