/**
 * Regression: the "insert the placeholder" strip at the head of a prompt section says why the
 * write it asked for did not land, under that strip — instead of leaving the template untouched
 * with the reason in a toast that dismissed itself after six seconds.
 *
 * The strip stays either way: nothing is written until the server writes it, so a refused insert
 * leaves the template without its placeholder, and the button that asked is still there to ask
 * again. Six seconds later it used to look as though it had never been pressed. The two cases are
 * Memory's own strip and the one the Skills / Vault / Schedules tabs share
 * (`usePromptInjection`) — two different code paths behind the same sentence.
 *
 * A plain template is written first: the default template already carries every placeholder, so
 * there would be no strip to press. The refusal is injected where the page's own write is —
 * `page.route` answers the placeholder POST with the server's words instead of forwarding it — and
 * the code is one the app has no sentence for, so what must appear on screen is the server's own
 * message. Every user is seeded through the API; provisioning is idempotent, so a rerun of this
 * file alone shares one data root with earlier runs.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** The refused write: a code the app has no sentence for, so its own message reaches the screen. */
const REFUSAL = { code: "agent_config_read_only", message: "agent config is read-only" };

/** A template carrying no placeholder and no legacy hardcoded section: every strip would show. */
const PLAIN_TEMPLATE = "You are a probe agent. Answer briefly.";

const agentBase = (projectId) => `/api/projects/${projectId}/agents/${AGENT}`;
const placeholderPath = (projectId, feature) =>
  `${agentBase(projectId)}/${feature}/template-placeholder`;

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and replace the Agent's prompt template with a plain one so the strips have something to
 * offer this agent.
 */
async function projectWithPlainTemplate(page, user) {
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
  const template = await page.request.put(`${BASE}${agentBase(projectId)}/config`, {
    data: { config: { systemPrompt: PLAIN_TEMPLATE } },
  });
  expect(template.ok(), "plain template").toBeTruthy();
  return projectId;
}

/**
 * Take over the placeholder write: every POST is counted in `state.seen`, and while `state.refuse`
 * is set it is answered with the server's refusal instead of reaching the real route.
 */
async function interceptInsert(page, projectId, feature, state) {
  await page.route(`**${placeholderPath(projectId, feature)}`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.seen.push(route.request().method());
    if (!state.refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

test("a refused Memory placeholder insert keeps the reason under the strip, and the button retries", async ({
  page,
}) => {
  const projectId = await projectWithPlainTemplate(page, "r187memory");
  const state = { seen: [], refuse: true };
  await interceptInsert(page, projectId, "memory", state);

  await page.goto(`/agents/${AGENT}?tab=memory`);
  const insert = page.getByRole("button", { name: "插入 {{MEMORY}} 占位符" });
  await expect(insert).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);

  await insert.click();

  // The sentence names the placeholder and carries the server's words; the strip and the button
  // that asked are untouched, which is what makes that same button the retry.
  const line = `插入 {{MEMORY}} 占位符被拒：${REFUSAL.message}`;
  await expect(page.getByRole("alert")).toHaveText(line);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  await expect(insert).toBeVisible();
  expect(state.seen).toHaveLength(1);

  // Six seconds is how long a toast lives; this line has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(page.getByRole("alert")).toHaveText(line);
  await expect(insert).toBeVisible();

  // The same button is the retry: this time the write lands, so the line goes and the strip goes
  // with the placeholder it was offering.
  state.refuse = false;
  await insert.click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(insert).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
});

test("a refused Skills placeholder insert keeps the reason under that strip, and only there", async ({
  page,
}) => {
  const projectId = await projectWithPlainTemplate(page, "r187skills");
  const state = { seen: [], refuse: true };
  await interceptInsert(page, projectId, "skills", state);

  await page.goto(`/agents/${AGENT}?tab=skills`);
  const insert = page.getByRole("button", { name: "插入 {{SKILLS}} 占位符" });
  await expect(insert).toBeVisible();

  await insert.click();

  // Same shape as Memory's strip above and the same sentence builder, but a different tab and a
  // different write path (`usePromptInjection`), which is why both are asserted.
  const line = `插入 {{SKILLS}} 占位符被拒：${REFUSAL.message}`;
  await expect(page.getByRole("alert")).toHaveText(line);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  await expect(insert).toBeVisible();
  expect(state.seen).toHaveLength(1);

  await page.waitForTimeout(7_000);
  await expect(page.getByRole("alert")).toHaveText(line);

  state.refuse = false;
  await insert.click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(insert).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
});
