/**
 * The in-session model switch's escape hatch: "switch even if it cannot be compacted".
 *
 * A switch always compacts the context on the model being left, and that model is the one that
 * has to write the summary — so a model whose every request fails (quota exhausted, credential
 * rejected) could never be left, and the in-session picker is the only way to change the model
 * of an existing conversation. The confirm dialog therefore offers one extra choice, off by
 * default, that drops the context when the compaction cannot complete.
 *
 * What this pins, in a real browser against the mock model:
 * - the box is offered only where a compaction really runs (not on an empty conversation, whose
 *   switch is immediate and whose dialog reads "切换") and starts off;
 * - the dialog's own sentence follows the box — unticked it promises to stay on the current
 *   model, ticked it says the conversation moves anyway (two promises in one dialog would be
 *   the defect the box itself was meant to remove);
 * - the request the page sends carries `onCompactionFailure: "discard"` only when the box was
 *   ticked, which is the whole effect the user sees: the server does the discarding.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const FROM = "claude-4-8";
const TO = "claude-4-7";
/** The mock's turn-2 answer (mock-llm.mjs): the conversation is over and the Session idle. */
const REPLY = "Command finished; the result looks as expected.";

/** Log in, and give the new user's Project the two mock models this spec switches between. */
async function setUp(page, user) {
  await provisionAndLogin(page.request, user, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: "custom", modelId: FROM },
      models: [
        {
          provider: "custom",
          modelId: FROM,
          apiKey: "sk-mock",
          baseUrl: MOCK,
          contextWindow: 200000,
        },
        {
          provider: "custom",
          modelId: TO,
          apiKey: "sk-mock",
          baseUrl: MOCK,
          contextWindow: 100000,
        },
      ],
    },
  });
  expect(put.ok(), "put models").toBeTruthy();
  return projectId;
}

async function createSession(page, projectId) {
  const sess = await (
    await page.request.post(`${BASE}/api/projects/${projectId}/agents/default_agent/sessions`, {
      data: { provider: "custom", modelId: FROM, approvalMode: "allow-all" },
    })
  ).json();
  return sess.session.sessionId;
}

/** A Session with one finished round, so a switch has something to compact. */
async function sessionWithConversation(page, projectId) {
  const sessionId = await createSession(page, projectId);
  await page.goto(`${BASE}/chat/${sessionId}`);
  const composer = page.getByPlaceholder(/输入消息/);
  await composer.waitFor();
  await composer.fill("hello");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText(REPLY).first()).toBeVisible();
  return sessionId;
}

/** Open the composer's model picker, pick the other model, and hand back the confirm dialog. */
async function askToSwitch(page) {
  // Disabled while the round runs and while a compaction is under way: waiting for it to be
  // enabled is waiting for the Session to be idle, without reading any internal state.
  const trigger = page.getByRole("button", { name: "选择模型" }).first();
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "选择模型" });
  await expect(picker).toBeVisible();
  await picker.locator('li[role="option"]').filter({ hasText: TO }).locator("button").click();
  const dialog = page.getByRole("dialog", { name: "切换模型" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Every `/switch-model` body the page posted, in order. */
function recordSwitches(page) {
  const bodies = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/switch-model")) {
      bodies.push(req.postDataJSON() ?? {});
    }
  });
  return bodies;
}

test("unticked, the dialog promises to stay and the request says nothing about compaction", async ({
  page,
}) => {
  const projectId = await setUp(page, "swdiscardoff");
  await sessionWithConversation(page, projectId);
  const bodies = recordSwitches(page);

  const dialog = await askToSwitch(page);
  const box = dialog.getByRole("checkbox", { name: "压缩失败就直接切换（放弃摘要）" });
  await expect(box).not.toBeChecked();
  await expect(dialog).toContainText(`压缩失败则保持「${FROM}」`);

  await dialog.getByRole("button", { name: "压缩并切换" }).click();
  await expect(page.getByText(`正在用「${FROM}」压缩上下文`).first()).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toEqual({ provider: "custom", modelId: TO });
});

test("ticked, the body says the conversation moves anyway and the request carries the discard", async ({
  page,
}) => {
  const projectId = await setUp(page, "swdiscardon");
  await sessionWithConversation(page, projectId);
  const bodies = recordSwitches(page);

  const dialog = await askToSwitch(page);
  const box = dialog.getByRole("checkbox", { name: "压缩失败就直接切换（放弃摘要）" });
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(box).toBeChecked();
  // The body follows the box: the plain sentence's "stays on the current model" is gone, and
  // the dialog says what will happen instead.
  await expect(dialog).not.toContainText(`压缩失败则保持「${FROM}」`);
  await expect(dialog).toContainText(`压缩失败则放弃摘要，直接以「${TO}」继续`);

  await dialog.getByRole("button", { name: "压缩并切换" }).click();
  await expect(page.getByText(`正在用「${FROM}」压缩上下文`).first()).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toEqual({ provider: "custom", modelId: TO, onCompactionFailure: "discard" });
});

test("a conversation with no context to compact offers no escape hatch at all", async ({
  page,
}) => {
  const projectId = await setUp(page, "swdiscardempty");
  const sessionId = await createSession(page, projectId);
  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).waitFor();

  const dialog = await askToSwitch(page);
  // Nothing is compacted, so the switch is immediate and there is nothing to fail at.
  await expect(dialog.getByRole("button", { name: "切换" })).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog).not.toContainText("放弃摘要");
});
