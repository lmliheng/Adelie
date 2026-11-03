/**
 * Regression: the MCP server modal's "test connection" button says why a probe did not get through
 * — in the card, under that button — instead of leaving the form exactly as it was with the reason
 * in a notification that dismissed itself after six seconds.
 *
 * The button runs the form's unsaved values through the server's connect-and-discover route and
 * saves nothing, so every failed probe is a form that looks untouched plus one sentence the reader
 * has to keep while fixing it (a command that is not on PATH, a URL that times out, a stderr tail
 * naming a certificate). Six seconds later that sentence used to be gone, and nothing on the card
 * said the button had been pressed at all.
 *
 * The probe route is stubbed rather than travelled: what this spec is about is what the page does
 * with the answer, and a real probe would spawn a child process for the test's own curiosity. The
 * refusal is the app's own sentence for the code the server would send (`internal`), and the
 * connecting answer is the shape the route sends (a tool list plus a latency).
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";
const NAME = "probe-mcp";

/** The line the card draws for a refused probe: the sentence's lead-in plus the code's words. */
const REFUSED_LINE = "连接失败：服务器内部错误，请稍后重试。";

/** Provision the user, give the Project a model (the onboarding overlay covers the page without one), and put one MCP server on the Agent. */
async function projectWithServer(page, user) {
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
  const seeded = await page.request.put(
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/config`,
    {
      data: {
        config: { mcpServers: [{ name: NAME, config: { url: "https://example.com/mcp" } }] },
      },
    },
  );
  expect(seeded.ok(), "seed the MCP server").toBeTruthy();
}

/**
 * Take over the probe route: every POST is counted (the body, so the spec can check it carried the
 * form's values), answered with the server's refusal until `state.refuse` is cleared, and then
 * with a connecting answer of the shape the route sends.
 */
async function stubProbe(page, state) {
  await page.route("**/api/projects/*/agents/*/config/mcp-test", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    state.seen.push(route.request().postDataJSON());
    if (state.refuse) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "internal", message: "RAW ENGLISH MESSAGE" } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, tools: ["mcp__probe-mcp__ping"], latencyMs: 1200 }),
    });
  });
}

/** The edit card, opened the way a person opens it: the row's 编辑 button. */
async function openEditCard(page) {
  await page.goto(`/agents/${AGENT}?tab=tools`);
  const row = page.getByRole("row", { name: new RegExp(NAME) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "编辑" }).click();
  const card = page.getByRole("dialog", { name: "编辑 MCP Server" });
  await expect(card).toBeVisible();
  return card;
}

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

test("a refused probe keeps the reason under the button, and only there", async ({ page }) => {
  await projectWithServer(page, "r189refuse");
  const state = { seen: [], refuse: true };
  await stubProbe(page, state);

  const card = await openEditCard(page);
  await card.getByRole("button", { name: "测试连接" }).click();

  // The sentence is in the card, under the button that asked, and it is not a toast: the
  // notification region holds nothing to dismiss, and the card draws it exactly once.
  await expect(card.getByRole("alert")).toHaveText(REFUSED_LINE);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  await expect(card.getByRole("alert")).toHaveCount(1);

  // The probe carried the form's own values — the unsaved ones — as the modal promises.
  expect(state.seen).toHaveLength(1);
  expect(state.seen[0].config.url).toBe("https://example.com/mcp");
  expect(state.seen[0].name).toBe(NAME);

  // The form is untouched: nothing was saved, and the card still says what it said.
  await expect(card.getByLabel("url")).toHaveValue("https://example.com/mcp");
  // By placeholder rather than by label: the name field's accessible name carries its hint
  // ("name 工具名前缀：mcp__<name>__<tool…"), which also matches the headers textarea's.
  await expect(card.getByPlaceholder("filesystem")).toHaveValue(NAME);

  // Six seconds is how long a toast lives; this line has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(card.getByRole("alert")).toHaveText(REFUSED_LINE);
});

test("an edit drops the sentence, and the same button is the retry", async ({ page }) => {
  await projectWithServer(page, "r189retry");
  const state = { seen: [], refuse: true };
  await stubProbe(page, state);

  const card = await openEditCard(page);
  await card.getByRole("button", { name: "测试连接" }).click();
  await expect(card.getByRole("alert")).toHaveText(REFUSED_LINE);

  // The probe sent exactly the values that were on screen, so changing one of them makes the
  // sentence describe a connection nothing asked about any more.
  await card.getByLabel("url").fill("https://other.example.com/mcp");
  await expect(card.getByRole("alert")).toHaveCount(0);

  // Same button, second press: this time the probe connects, so the sentence stays away and the
  // numbers arrive as the toast every connecting probe uses.
  state.refuse = false;
  await card.getByRole("button", { name: "测试连接" }).click();
  await expect(notifications(page).getByText("连接成功，发现 1 个工具（1.2s）")).toBeVisible();
  await expect(card.getByRole("alert")).toHaveCount(0);
  expect(state.seen).toHaveLength(2);
  // The second probe travelled to the edited URL, not the one the first sentence was about.
  expect(state.seen[1].config.url).toBe("https://other.example.com/mcp");
});
