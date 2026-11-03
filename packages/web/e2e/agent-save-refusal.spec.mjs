/**
 * Regression: the save confirmation waits for the write it asked for, and a refused one keeps the
 * card — with the server's words inside it — instead of closing on the click.
 *
 * Every settings form shares that card (`useSaveConfirm`): the Overview's name/description, the
 * System Prompt, Runtime and Tools forms, and the two prompt writers (Memory's own, and the
 * Skills / Vault / Schedules prompt sections). It used to run the write and dismiss itself in the
 * same click, so a refusal left the card gone, the form still holding the unsaved edit, and the
 * reason only in a toast that dismissed itself after six seconds — nothing left to retry from
 * except finding the Save button again. Now Confirm is that retry: it stays pressed-not-finished
 * (both card buttons locked) until the server answers, and a refusal draws `ConfirmModal`'s
 * `refusal` strip under the card's own sentence, cleared when the write finally lands.
 *
 * Two different call sites are covered, because they build the promise differently: the page's
 * shared `save` (Prompt tab) rethrows from its catch, and the Memory tab's own writer returns its
 * chain. Both are refused at `page.route`; the config the tests write to is the server's own.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** What a refused save answers: its own words prove the reason came back into the card. */
const REFUSAL = { code: "agent_state_read_only", message: "agent state is read-only" };

const configPath = (projectId) => `/api/projects/${projectId}/agents/${AGENT}/config`;

/** The notification region: a refused save must not be announced there instead of in the card. */
const notifications = (page) => page.getByRole("region", { name: "通知" });

/**
 * Provision the user and give the Project a model (the onboarding overlay covers the page without
 * one), returning the Project id and a reader for the Agent's config as the server holds it.
 */
async function projectWithModel(page, user) {
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
  const stored = async () =>
    await (await page.request.get(`${BASE}${configPath(projectId)}`)).json();
  /** Write the baseline straight to the server (before any route is stubbed) so a rerun starts even. */
  const seed = async (update) => {
    const res = await page.request.put(`${BASE}${configPath(projectId)}`, { data: update });
    expect(res.ok(), "seed the baseline").toBeTruthy();
  };
  return { projectId, stored, seed };
}

/**
 * Take over the config write: every PUT is counted, and while `state.refuse` is set it is answered
 * with the server's refusal instead of reaching the real route. Reads fall through untouched.
 */
async function interceptSave(page, state) {
  await page.route(`**/api/projects/*/agents/*/config`, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    state.sent.push(route.request().postDataJSON());
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** The card's own text with the refusal strip dropped — the only thing a refusal may change. */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused prompt save keeps the card, its sentence, and says why", async ({ page }) => {
  const { stored, seed } = await projectWithModel(page, "r188prompt");
  const NEXT = "You are a probe agent answering the save-refusal test.\n";
  // Reruns share the data root: rewind the field first so `before` is never what a past run saved.
  await seed({ config: { systemPrompt: "A prompt left by the baseline seed.\n" } });
  const before = await stored();
  expect(before.config.systemPrompt).not.toBe(NEXT);

  const state = { sent: [], refuse: true };
  await interceptSave(page, state);

  await page.goto(`/agents/${AGENT}?tab=prompt`);
  await page.getByLabel("system_prompt 模板").fill(NEXT);
  await page.getByRole("button", { name: "保存", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "保存修改" });
  await expect(dialog).toBeVisible();
  const sentence = await cardText(dialog);
  expect(sentence).not.toContain("操作被拒绝");

  await dialog.getByRole("button", { name: "保存", exact: true }).click();

  // The reason is in the card that asked, and the card is still there to retry from.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(dialog.getByText(/^操作被拒绝：agent state is read-only$/)).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);
  expect(state.sent).toHaveLength(1);
  expect(state.sent[0].config.systemPrompt).toBe(NEXT);
  // The server still holds what it held, and the toast is not the only trace of the refusal.
  expect((await stored()).config.systemPrompt).toBe(before.config.systemPrompt);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);

  // Seven seconds later the sentence is still in the card (a toast would be long gone by now).
  await page.waitForTimeout(7000);
  await expect(dialog.getByText(/^操作被拒绝：agent state is read-only$/)).toBeVisible();

  // The retry is that same Confirm button: it lands, so the card closes and the server has it.
  state.refuse = false;
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await stored()).config.systemPrompt).toBe(NEXT);
  expect(state.sent).toHaveLength(2);
});

test("a refused memory prompt save keeps the card too", async ({ page }) => {
  const { stored, seed } = await projectWithModel(page, "r188memory");
  const NEXT = "A memory prompt written by the save-refusal test.\n";
  await seed({ config: { memory: { prompt: "A memory prompt left by the baseline seed.\n" } } });
  const before = await stored();
  expect(before.config.memory.prompt).not.toBe(NEXT);

  const state = { sent: [], refuse: true };
  await interceptSave(page, state);

  await page.goto(`/agents/${AGENT}?tab=memory`);
  await page.getByLabel("主提示词").fill(NEXT);
  await page.getByRole("button", { name: "保存", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "保存修改" });
  await expect(dialog).toBeVisible();
  const sentence = await cardText(dialog);

  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/^操作被拒绝：agent state is read-only$/)).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);
  expect(state.sent).toHaveLength(1);
  expect(state.sent[0].config.memory.prompt).toBe(NEXT);
  // The Memory tab keeps its own writer, so this pins the second shape of the promise.
  expect((await stored()).config.memory.prompt).toBe(before.config.memory.prompt);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);

  state.refuse = false;
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await stored()).config.memory.prompt).toBe(NEXT);
  expect(state.sent).toHaveLength(2);
});
