/**
 * A layout change does not replay the page's one-shot commands into a dock panel.
 *
 * Each command the chat page hands its panel bodies is a fresh object per click, kept standing
 * until the next click, a Session switch or the panel's tab closing: "locate this file in the
 * tree", "land on this memory". The bodies that obey them are remounted whenever the layout
 * moves the panel between the desktop side column and the narrow merged surface, so a guard held
 * inside the body forgets the command and the fresh mount runs it again — reopening the file the
 * reader had closed and moved away from, or pulling the Memory panel back to the memory (or the
 * list) they had walked out of. The child-conversation pick is the third of the family and is
 * pinned by subagent-panel-selection-across-layout.spec.
 *
 * Both tests read the panel on both sides of the crossing, so a pass says the command ran once
 * and the reader's own navigation stands.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";
const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 900 };
/** S.chat.memoryBack / S.files.backToList — the memory detail's own way back to the list. */
const MEMORY_BACK = "返回列表";
/** S.memory.userScope: the list's User-scope group header. */
const USER_SCOPE = "用户记忆";
/** S.chat.memoryChangesTitle(1): the summary card's header once the Task kept one note. */
const MEMORY_CARD = "1 条记忆更新";
/** The note the mock's "memory write test" branch keeps (MOCK note body, verbatim). */
const NOTE_BODY = "The note the Memory panel was landed on.";
/** The HTML the Files test writes into the Workspace beforehand. */
const PAGE_HTML = "<html><body><h1>Session A page</h1></body></html>";

/** Provision the user, aim the Project's model at the mock, and open one allow-all Session. */
async function openSession(page, user) {
  await provisionAndLogin(page.request, user, "password123");
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
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions`,
    {
      data: {
        provider: "custom",
        modelId: "claude-4-8",
        approvalMode: "allow-all",
        // The note is kept behind the Workspace (in the Agent's own state), and the default
        // workspace-write sandbox bounds the file tools to the Workspace.
        sandbox: { mode: "danger-full-access" },
      },
    },
  );
  expect(created.ok(), "create session").toBeTruthy();
  const sessionId = (await created.json()).session.sessionId;
  return { projectId, sessionId };
}

/** The dock that is actually on screen (a collapsed one keeps its bodies mounted at zero size). */
const onScreenDock = (page) => page.locator('[data-testid="dock"]:visible');

/** The composer of the conversation itself, not a dock panel's. */
const composer = (page) => page.locator('textarea:not([data-testid="dock"] textarea)');

/** Send one prompt from the main composer. */
async function say(page, text) {
  const ta = composer(page);
  await ta.waitFor();
  await ta.fill(text);
  await page.locator('button[aria-label="发送"]:not([data-testid="dock"] *)').click();
}

/**
 * Cross the breakpoint and read the panel on both sides, once the move has settled (the dock
 * that loses the panel collapses over 200 ms and the other one grows in its place).
 */
async function acrossLayouts(page, read) {
  const settle = async (where) => {
    await expect
      .poll(async () => onScreenDock(page).count(), { message: `one dock on screen ${where}` })
      .toBe(1);
    await page.waitForTimeout(250); // DOCK_TRANSITION_MS
    expect(await onScreenDock(page).count(), `still one dock ${where}`).toBe(1);
  };
  await page.setViewportSize(NARROW);
  await settle("after narrowing");
  const narrow = await read();
  await page.setViewportSize(WIDE);
  await settle("after widening");
  const wideAgain = await read();
  return { narrow, wideAgain };
}

test("a layout change does not reopen the file the Files panel had moved away from", async ({
  page,
}) => {
  const { sessionId } = await openSession(page, "filecommandlayout");
  const upload = await page.request.put(
    `${BASE}/api/sessions/${sessionId}/files/content?path=demo.html`,
    {
      data: { dataBase64: Buffer.from(PAGE_HTML).toString("base64") },
    },
  );
  expect(upload.ok(), "upload demo.html").toBeTruthy();
  const other = await page.request.put(
    `${BASE}/api/sessions/${sessionId}/files/content?path=note.txt`,
    {
      data: { dataBase64: Buffer.from("the note the reader moved to\n").toString("base64") },
    },
  );
  expect(other.ok(), "upload note.txt").toBeTruthy();

  await page.goto(`${BASE}/chat/${sessionId}`);
  await say(page, "files card test");

  // The card row's click is the command: the Workspace panel opens on demo.html.
  await expect(page.getByText(/Report generated/)).toBeVisible();
  await page.locator('button[data-tooltip="demo.html"]').filter({ hasText: "点击预览" }).click();
  await expect(page.frameLocator("iframe").getByText("Session A page")).toBeVisible();

  // The reader then opens another file from the tree. The page still holds "demo.html", and it
  // does so until the next click or the tab closing — a crossing is neither.
  await onScreenDock(page).getByRole("treeitem").filter({ hasText: "note.txt" }).click();
  await expect(page.getByText("the note the reader moved to")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);

  const read = async () => ({
    stalePreview: await onScreenDock(page).locator("iframe").count(),
  });
  const { narrow, wideAgain } = await acrossLayouts(page, read);
  expect(narrow).toMatchObject({ stalePreview: 0 });
  expect(wideAgain).toMatchObject({ stalePreview: 0 });
});

test("a layout change does not pull the Memory panel back to the note it was landed on", async ({
  page,
}) => {
  // The mock writes the note at an absolute path, so the spec computes it from the data root
  // the server was started on (e2e/run.sh exports it).
  const home = process.env.ADELIE_HOME;
  expect(home, "ADELIE_HOME (e2e/run.sh exports the data root)").toBeTruthy();

  const { projectId, sessionId } = await openSession(page, "memcommandlayout");
  const notePath = path.join(
    home,
    projectId,
    "agents",
    AGENT,
    "agent_state",
    "memory",
    "user",
    "probe-layout.md",
  );

  await page.goto(`${BASE}/chat/${sessionId}`);
  // Warm the conversation up and reload: the model only classifies memory writes once a
  // session_meta has told it where the Memory root is, and that record reaches the page with
  // the Trace — a page loaded onto an empty Session holds none until it is loaded again. (The
  // card is a Task summary; the reply the warm-up leaves behind is not read.)
  await say(page, "warm up");
  await expect(page.getByRole("button", { name: /运行完毕/ })).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await composer(page).waitFor();

  await say(page, `memory write test ${notePath}`);

  // The Task's summary card grows the memory row; clicking it is the command.
  await expect(page.getByText(MEMORY_CARD)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /probe-layout\.md/ }).click();
  await expect(onScreenDock(page).getByText(NOTE_BODY)).toBeVisible({ timeout: 15_000 });
  const back = onScreenDock(page).getByRole("button", { name: MEMORY_BACK });
  await expect(back).toHaveCount(1);

  // Back to the list — the reader's own navigation, after the command has done its job.
  await back.click();
  await expect(onScreenDock(page).getByRole("button", { name: MEMORY_BACK })).toHaveCount(0);
  await expect(onScreenDock(page).getByText(USER_SCOPE)).toBeVisible();

  const read = async () => ({
    detail: await onScreenDock(page).getByRole("button", { name: MEMORY_BACK }).count(),
    noteBody: await onScreenDock(page).getByText(NOTE_BODY).count(),
  });
  const { narrow, wideAgain } = await acrossLayouts(page, read);
  expect(narrow).toMatchObject({ detail: 0, noteBody: 0 });
  expect(wideAgain).toMatchObject({ detail: 0, noteBody: 0 });
});
