/**
 * Regression: a memory that did not open leaves its reason in the row that asked, instead of only
 * in a notification that dismisses itself after six seconds.
 *
 * Opening a memory is a plain read of one file — the view panel simply never comes up when it
 * fails, nothing is written, and the row keeps its eye button as the retry. Before this, that read
 * answered with `toastError`: the person asked for a panel, got none, and the only account of why
 * left the screen after six seconds. The Skills (7.101), Hooks (7.103) and memory-group (7.109 /
 * 7.110) twins are the same family; this one hangs off a list row, so its reason sits inside that
 * row (`ListRow`'s `notice`) — under the memory it is about, above the rule that closes the row.
 *
 * The memory is seeded through the export document the import route accepts (the tab has no "new
 * file" form by design: a memory's text is the model's document). The refused read is the page's
 * own request as seen by `page.route`; both halves are the page's contract with the server.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";
const FILE = "probe-view-memory.md";
const TITLE = "Probe view memory";
const OTHER_FILE = "probe-other-memory.md";
const OTHER_TITLE = "Probe other memory";

/** The refused read: its code's own localized sentence is what the row has to draw. */
const REFUSAL = { code: "internal", message: "the memory could not be read" };
/** S.errors.byCode.internal — the copy that code stands for in a zh-CN interface. */
const REASON = "服务器内部错误，请稍后重试。";

/** Two memory documents as the export route writes them (the import route's own shape). */
function documentWith(content, otherContent) {
  return {
    format: "penguin-memory-scope",
    version: 1,
    scopeKey: "user",
    kind: "user",
    exportedAt: new Date().toISOString(),
    index: `- [${TITLE}](${FILE}) — seeded by the e2e run\n- [${OTHER_TITLE}](${OTHER_FILE}) — seeded by the e2e run\n`,
    files: [
      {
        name: FILE,
        content: `---\nname: ${TITLE}\ndescription: A memory the view refusal test opens.\n---\n\n${content}\n`,
      },
      {
        name: OTHER_FILE,
        content: `---\nname: ${OTHER_TITLE}\ndescription: The other row, which no attempt was made for.\n---\n\n${otherContent}\n`,
      },
    ],
  };
}

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and seed two user-scope memories so the group has more than one row. Rerunning this file
 * shares one data root with earlier runs, so the seed overwrites what a previous run left.
 */
async function projectWithMemories(page, user, content, otherContent) {
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
    data: { mode: "overwrite", confirm: true, payload: documentWith(content, otherContent) },
  });
  expect(seeded.ok(), "seed the memories").toBeTruthy();

  /** The scope's topic files as the server holds them: what the page reads. */
  const files = async () => (await (await page.request.get(`${scopeBase}/files`)).json()).files;

  return { projectId, files };
}

/** A memory row's own eye button (accessible name: the verb plus that memory's title). */
const eyeButton = (page, title) => page.getByRole("button", { name: `查看 ${title}`, exact: true });

/** That memory's row: the list item holding the eye button. */
const rowOf = (page, title) => page.getByRole("listitem").filter({ has: eyeButton(page, title) });

/** The reason line inside that row (one slot, the row that asked). */
const refusalLine = (page, title) => rowOf(page, title).getByTestId("memory-file-refusal");

/**
 * The view panel's own action row: the drawer's "Edit" is the one button whose whole accessible
 * name is the verb (the row's icons are named "<verb> <title>"). Present only when a panel opened.
 */
const panelEdit = (page) => page.getByRole("button", { name: "编辑", exact: true });

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

/**
 * Nothing was raised in the notification region for this refusal, read at once.
 *
 * `toHaveCount(0)` retries for the whole expect timeout, so it also passes against a toast that
 * simply expired after six seconds — the very behaviour this file is about.
 */
async function expectNoToast(page) {
  await page.waitForTimeout(400);
  expect(await notifications(page).getByRole("button").count()).toBe(0);
}

/** Take over one memory's read: every GET is kept in `seen`, refused while `state.refuse` is set. */
async function interceptFile(page, state) {
  await page.route("**/api/projects/*/agents/*/memory/scopes/*/files/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!pathname.endsWith(`/${FILE}`)) return route.fallback();
    state.seen.push(pathname);
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

test("a memory that did not open keeps its reason in its own row, and nothing else changes", async ({
  page,
}) => {
  const { files } = await projectWithMemories(
    page,
    "r225memviewrefuse",
    "What the memory held.",
    "The other row's text.",
  );
  const before = await files();

  const state = { seen: [], refuse: true };
  await interceptFile(page, state);

  await page.goto(`/agents/${AGENT}?tab=memory`);
  await expect(rowOf(page, TITLE)).toHaveCount(1);
  await expect(rowOf(page, OTHER_TITLE)).toHaveCount(1);
  await expect(page.getByTestId("memory-file-refusal")).toHaveCount(0);

  await eyeButton(page, TITLE).click();

  // The reason is in the row that asked, and it is not a toast: the notification region holds no
  // dismissible button, and the row still has the eye button that retries it.
  await expect(refusalLine(page, TITLE)).toHaveCount(1);
  await expect(refusalLine(page, TITLE)).toHaveText(
    `记忆「${TITLE}」没有打开，打开只是读取，记忆一条都没有被改动：${REASON}`,
  );
  await expect(eyeButton(page, TITLE)).toBeVisible();
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  expect(state.seen[0]).toMatch(/\/memory\/scopes\/user\/files\/probe-view-memory\.md$/);

  // One row, one sentence: no other row grew one, and no panel opened.
  await expect(page.getByTestId("memory-file-refusal")).toHaveCount(1);
  await expect(panelEdit(page)).toHaveCount(0);

  // Six seconds is where the old toast gave up; the sentence is still there.
  await page.waitForTimeout(7000);
  await expect(refusalLine(page, TITLE)).toHaveCount(1);

  // The read changed neither side: the memories are listed and on disk exactly as before.
  await expect(rowOf(page, TITLE)).toHaveCount(1);
  expect(await files()).toEqual(before);

  // The retry is the same eye button; this time the memory really comes back: the sentence goes and
  // the panel opens with that memory in it.
  state.refuse = false;
  await eyeButton(page, TITLE).click();
  await expect(page.getByTestId("memory-file-refusal")).toHaveCount(0);
  await expect(panelEdit(page)).toHaveCount(1);
  expect(state.seen).toHaveLength(2);
  expect(await files()).toEqual(before);
});

test("a later attempt clears the reason, even when it is another memory that opened", async ({
  page,
}) => {
  await projectWithMemories(page, "r225memviewretry", "The refused one.", "The one that opens.");

  const state = { seen: [], refuse: true };
  await interceptFile(page, state);

  await page.goto(`/agents/${AGENT}?tab=memory`);
  await expect(rowOf(page, TITLE)).toHaveCount(1);
  await eyeButton(page, TITLE).click();
  await expect(refusalLine(page, TITLE)).toHaveCount(1);
  await expectNoToast(page);

  // Only `FILE` is refused, so the other row's eye opens its panel — and that attempt supersedes
  // the reason the first one left: one refusal, the last one.
  await eyeButton(page, OTHER_TITLE).click();
  await expect(panelEdit(page)).toHaveCount(1);
  await expect(page.getByTestId("memory-file-refusal")).toHaveCount(0);
});
