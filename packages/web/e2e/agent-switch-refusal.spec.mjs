/**
 * Regression: the enable switch at the head of an Agent settings tab says why a flip did not
 * settle, under that switch's card — instead of leaving the card untouched with the reason in a
 * toast that dismissed itself after six seconds.
 *
 * Both switches here write nothing optimistically: the card shows the position the config the
 * server answers with holds, so a refused flip used to leave the tab exactly as it was — the switch
 * did not move — and six seconds later nothing on screen said why. The two cases are the Memory
 * tab's own card and the card the Skills / Vault / Schedules / Hooks tabs share
 * (`usePromptInjection`), which are two separate code paths behind the same sentence.
 *
 * The refusal is injected where the page's own write is: `page.route` answers the config PUT with
 * the server's words instead of forwarding it, so the reason proved to be on screen is the one the
 * failed request carried. The code is one the app has no sentence for, so the server's own words
 * are what must appear. Every user is seeded through the API; provisioning is idempotent, so a
 * rerun of this file alone shares one data root with earlier runs.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** The refused save: a 500 the app has no code for, so its own message reaches the screen. */
const REFUSAL = { code: "agent_config_read_only", message: "agent config is read-only" };

const configPath = (projectId) => `/api/projects/${projectId}/agents/${AGENT}/config`;
/** The Memory tab's own read: what the switch's real position comes from. */
const memoryPath = (projectId) => `/api/projects/${projectId}/agents/${AGENT}/memory`;

/**
 * Provision the user and give the Project a model — the onboarding overlay covers the page without
 * one, and the cards this spec presses sit under it.
 */
async function projectWithModel(page, user) {
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
  return projectId;
}

/**
 * Take over the config write: every PUT is kept in `state.seen`, and while `state.refuse` is set it
 * is answered with the server's refusal instead of reaching the real route.
 */
async function interceptConfigPut(page, projectId, state) {
  await page.route(`**${configPath(projectId)}`, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    state.seen.push(route.request().postDataJSON());
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/**
 * Put the Memory switch in a known position before the page opens. The tab renders that switch on
 * its own default while the overview is still loading, so a spec that reads it first would measure
 * whichever state happened to be on screen; seeding makes the read and the load agree — and this
 * test writes `false` at the end, so a rerun on the same (idempotently provisioned) user would
 * otherwise start from the other position.
 */
async function seedMemory(page, projectId, enabled) {
  const put = await page.request.put(`${BASE}${configPath(projectId)}`, {
    data: { config: { memory: { enabled } } },
  });
  expect(put.ok(), "seed memory switch").toBeTruthy();
}

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

/**
 * The line the card must draw, from the position the switch was in before the click: the sentence
 * names the direction that failed, and a refused flip leaves the switch where the server has it, so
 * the direction is never inferable from the screen afterwards.
 */
const refusedLine = (noun, wasOn) =>
  `${wasOn ? "关闭" : "开启"}${noun}的开关被拒：${REFUSAL.message}`;

/** The switch must still be in the position the server holds — the one it had before the click. */
async function expectUnmoved(toggle, wasOn) {
  if (wasOn) await expect(toggle).toBeChecked();
  else await expect(toggle).not.toBeChecked();
}

test("a refused flip of the Memory switch keeps the reason under the card, and the retry clears it", async ({
  page,
}) => {
  const projectId = await projectWithModel(page, "r186memory");
  await seedMemory(page, projectId, true);
  const state = { seen: [], refuse: true };
  await interceptConfigPut(page, projectId, state);

  // The switch is drawn from a default until the overview lands; that read is what proves the tab
  // has loaded, so the position read below is the server's and not the placeholder.
  const loaded = page.waitForResponse(
    (res) =>
      res.request().method() === "GET" && new URL(res.url()).pathname === memoryPath(projectId),
  );
  await page.goto(`/agents/${AGENT}?tab=memory`);
  const toggle = page.getByRole("switch", { name: "启用记忆" });
  await expect(toggle).toBeVisible();
  await loaded;
  const wasOn = await toggle.isChecked();
  expect(wasOn, "the seeded position").toBe(true);
  const line = refusedLine("记忆", wasOn);

  await toggle.click();

  // The reason is under the card that asked, drawn as one sentence and not as a toast: the
  // notification region holds no dismissible button while this line is on screen.
  await expect(page.getByRole("alert")).toHaveText(line);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  // Nothing moved, because nothing was written: the switch is still where the server has it.
  await expectUnmoved(toggle, wasOn);

  // Six seconds is how long a toast lives; this line has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(page.getByRole("alert")).toHaveText(line);

  // The same switch is the retry: this time the write lands, so the line goes and the switch moves.
  state.refuse = false;
  await toggle.click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expectUnmoved(toggle, !wasOn);
  expect(state.seen).toHaveLength(2);
  expect(state.seen[1].config.memory.enabled).toBe(!wasOn);
});

test("a refused flip of the shared Skills switch keeps the reason under that card, and only there", async ({
  page,
}) => {
  const projectId = await projectWithModel(page, "r186skills");
  const state = { seen: [], refuse: true };
  await interceptConfigPut(page, projectId, state);

  await page.goto(`/agents/${AGENT}?tab=skills`);
  const toggle = page.getByRole("switch", { name: "启用技能" });
  await expect(toggle).toBeVisible();
  const wasOn = await toggle.isChecked();
  const line = refusedLine("技能", wasOn);

  await toggle.click();

  // Same shape as the Memory card above, and the same sentence builder — but a different tab and a
  // different write path (`usePromptInjection`), which is why both are asserted.
  await expect(page.getByRole("alert")).toHaveText(line);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);
  await expectUnmoved(toggle, wasOn);

  await page.waitForTimeout(7_000);
  await expect(page.getByRole("alert")).toHaveText(line);
});
