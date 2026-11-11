/**
 * Regression: a memory group's "Export" that the download refused leaves its reason inside the
 * group that asked, instead of only in a notification that dismisses itself after six seconds.
 *
 * The export is a plain fetch of one scope's transfer document: nothing is written on the server,
 * no memory moves and no client state changes, so a refusal leaves the group, its export button and
 * every memory on screen. That is exactly where the reason belongs (7.19's rule) — before this,
 * `exportScope` answered with `toastError`, and a reader who looked away had no file and nothing
 * saying why. The Skills (7.101), Hooks (7.103) and plugin card (7.107) twins are the same family;
 * this one hangs off a folded section, so its reason sits in `CollapsibleSection`'s `notice` slot —
 * inside the card, under the head strip, and visible while the group is folded.
 *
 * The memory is seeded through the export document the import route accepts (the tab has no "new
 * file" form by design: a memory's text is the model's document). The refused download is the
 * page's own request as seen by `page.route`; both halves are the page's contract with the server.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";
const FILE = "probe-export-memory.md";
const TITLE = "Probe export memory";
const SCOPE = "用户记忆";

/** The refused download: its code's own localized sentence is what the group has to draw. */
const REFUSAL = { code: "internal", message: "the scope could not be read" };
/** S.errors.byCode.internal — the copy that code stands for in a zh-CN interface. */
const REASON = "服务器内部错误，请稍后重试。";

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
        content: `---\nname: ${TITLE}\ndescription: A memory the export refusal test reads.\n---\n\n${content}\n`,
      },
    ],
  };
}

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and seed one user-scope memory so the group has something to export. Rerunning this file
 * shares one data root with earlier runs, so the seed overwrites what a previous run left.
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

/** The user group's head strip export button (accessible name: the verb plus the group's title). */
const exportButton = (page) => page.getByRole("button", { name: `导出${SCOPE}`, exact: true });

/** The group's card: the export button's head strip, then the section itself. */
const groupCard = (page) => exportButton(page).locator("xpath=../../..");

/** The reason line inside that card. */
const refusalLine = (page) => page.getByTestId("export-refusal");

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

/** Take over the scope export: every GET is kept in `seen`, and while `state.refuse` is set it is
 * answered with the server's refusal instead of reaching the real route. */
async function interceptExport(page, state) {
  await page.route("**/api/projects/*/agents/*/memory/scopes/*/export", async (route) => {
    state.seen.push(new URL(route.request().url()).pathname);
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

test("a refused export keeps its reason in the group, folded or not, and nothing else changes", async ({
  page,
}) => {
  const { files } = await projectWithMemory(page, "r222memexportrefuse", "What the scope held.");
  const before = await files();

  const state = { seen: [], refuse: true };
  await interceptExport(page, state);

  await page.goto(`/agents/${AGENT}?tab=memory`);
  await expect(page.getByText(TITLE, { exact: true })).toBeVisible();
  await expect(refusalLine(page)).toHaveCount(0);
  const headLine = await groupCard(page).locator('[data-slot="head"]').innerText();

  await exportButton(page).click();

  // The reason is in the group that asked, and it is not a toast: the notification region holds no
  // dismissible button, and the head strip reads exactly as it did before the attempt.
  await expect(refusalLine(page)).toHaveCount(1);
  await expect(refusalLine(page)).toHaveText(
    `记忆组「${SCOPE}」没有导出成文档，导出只是读取，记忆一条都没有被改动：${REASON}`,
  );
  await expect(groupCard(page).getByTestId("export-refusal")).toHaveCount(1);
  expect(await groupCard(page).locator('[data-slot="head"]').innerText()).toBe(headLine);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  expect(state.seen[0]).toMatch(/\/memory\/scopes\/user\/export$/);

  // One group, one sentence: no other card grew one.
  await expect(page.getByTestId("export-refusal")).toHaveCount(1);

  // Six seconds is where the old toast gave up; the sentence is still there.
  await page.waitForTimeout(7000);
  await expect(refusalLine(page)).toHaveCount(1);

  // Folded, the head strip is all that shows — and the reason stays readable rather than folding
  // into an `inert`, zero-height body with the rows it is about.
  await groupCard(page).getByRole("button", { expanded: true }).first().click();
  await expect(groupCard(page).getByRole("button", { expanded: false }).first()).toBeVisible();
  await expect(groupCard(page).locator('[data-slot="body"]')).toHaveClass(/grid-rows-\[0fr\]/);
  await expect(refusalLine(page)).toBeVisible();

  // Nothing was exported and nothing was touched: the memory is still there, on both sides.
  expect(await files()).toEqual(before);
});

test("the retry after a refused export lands, and only a new attempt clears the reason", async ({
  page,
}) => {
  const { files } = await projectWithMemory(
    page,
    "r222memexportretry",
    "Kept until it is exported.",
  );
  const before = await files();

  const state = { seen: [], refuse: true };
  await interceptExport(page, state);

  await page.goto(`/agents/${AGENT}?tab=memory`);
  await expect(page.getByText(TITLE, { exact: true })).toBeVisible();
  await exportButton(page).click();
  await expect(refusalLine(page)).toHaveCount(1);
  expect(state.seen).toHaveLength(1);

  // The retry is the same button; this time the document really comes back: the sentence goes, and
  // the file is handed to the browser as a download.
  state.refuse = false;
  const download = page.waitForEvent("download");
  await exportButton(page).click();
  await expect(refusalLine(page)).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^default_agent-user-memory(-\d{8}-\d{4})?\.json$/);

  // A refused export changed neither side: the memory is still listed and still on disk.
  await expect(page.getByText(TITLE, { exact: true })).toBeVisible();
  expect(await files()).toEqual(before);
});
