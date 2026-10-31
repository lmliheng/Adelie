/**
 * Regression: the MCP Server row's on/off switch says why a flip did not settle — in a band under
 * the row that asked — instead of leaving the table untouched with the reason in a toast that
 * dismissed itself after six seconds.
 *
 * The switch writes nothing optimistically: it sends the whole `mcpServers` list through the one
 * config PUT every edit in this block uses, and the rows keep the state the server has until that
 * write lands. So a refused flip used to leave the table exactly as it was — the switch did not
 * move — and six seconds later nothing on screen said why.
 *
 * The refusal is injected where the page's own write is: `page.route` answers the config PUT with
 * the server's words instead of forwarding it, so the reason proved to be on screen is the one the
 * failed request carried. The rows are seeded through the API; an entry is not connected until a
 * Session starts, so a plain http entry is enough.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
const AGENT = "default_agent";

/** The row under test, and its neighbour (which must stay quiet). */
const NAME = "probe-mcp";
const QUIET = "quiet-mcp";

/** The refused save: a 500 the app has no code for, so its own message reaches the screen. */
const REFUSAL = { code: "agent_config_read_only", message: "agent config is read-only" };
/** The line the row draws: the shared lead-in plus the server's words. */
const REFUSED_LINE = `操作被拒绝：${REFUSAL.message}`;

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and put two MCP servers on the Agent. The `PUT` replaces the whole list, so a rerun of
 * this file alone shares one data root with earlier runs without accumulating probe rows.
 */
async function projectWithServers(page, user, servers) {
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

  const seeded = await putServers(page, projectId, servers);
  expect(seeded.ok(), "seed the MCP servers").toBeTruthy();

  /** The Agent's list as the server holds it: what the page reads and writes back. */
  const listed = async () => (await readConfig(page, projectId)).config?.mcpServers ?? [];
  return { projectId, listed };
}

/** The config write the page makes for every MCP edit (whole list, vault-style). */
const putServers = (page, projectId, mcpServers) =>
  page.request.put(`${BASE}/api/projects/${projectId}/agents/${AGENT}/config`, {
    data: { config: { mcpServers } },
  });

const readConfig = async (page, projectId) =>
  (await page.request.get(`${BASE}/api/projects/${projectId}/agents/${AGENT}/config`)).json();

/**
 * Take over the config write: every PUT is kept in `state.seen`, and while `state.refuse` is set
 * it is answered with the server's refusal instead of reaching the real route.
 */
async function interceptConfigPut(page, state) {
  await page.route("**/api/projects/*/agents/*/config", async (route) => {
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

/** One row of the Tools tab's MCP table, by its server name. */
const row = (page, name) => page.getByRole("row", { name: new RegExp(name) });

/** That row's switch — labelled `<server> enabled`, the same label the table's column uses. */
const switchOf = (page, name) => row(page, name).getByRole("switch", { name: `${name} enabled` });

/**
 * The band under one row: the table's next `<tr>` after that row. A refused flip's sentence is
 * drawn there rather than inside a cell — the switch's own cell is one control wide, and a long
 * server sentence in it would squeeze the columns beside it (the name column would wrap on every
 * row, including rows that were never written to).
 */
const refusalBand = (page, name) => row(page, name).locator("xpath=following-sibling::tr[1]");

/** The notification region: a refusal must not be announced there (that is the old toast). */
const notifications = (page) => page.getByRole("region", { name: "通知" });

const seed = () => [
  { name: NAME, config: { url: "https://example.com/mcp" } },
  { name: QUIET, config: { url: "https://quiet.example.com/mcp" } },
];

test("a refused flip keeps the reason under that row, and only that row", async ({
  page,
}) => {
  const { listed } = await projectWithServers(page, "r171refuse", seed());
  const before = await listed();

  const state = { seen: [], refuse: true };
  await interceptConfigPut(page, state);

  await page.goto(`/agents/${AGENT}?tab=tools`);
  await expect(switchOf(page, NAME)).toBeVisible();
  await expect(switchOf(page, NAME)).toBeChecked();

  await switchOf(page, NAME).click();

  // The reason is under the row that asked, and it is not a toast: the notification region holds
  // no dismissible button, the neighbouring row has no band under it, and the table draws this
  // sentence exactly once.
  await expect(refusalBand(page, NAME).getByRole("alert")).toHaveText(REFUSED_LINE);
  await expect(refusalBand(page, QUIET).getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("table").last().getByRole("alert")).toHaveCount(1);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.seen).toHaveLength(1);

  // The switch did not move, because the server did not move: it is still on there.
  await expect(switchOf(page, NAME)).toBeChecked();
  expect(await listed()).toEqual(before);

  // Six seconds is how long a toast lives; this line has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(refusalBand(page, NAME).getByRole("alert")).toHaveText(REFUSED_LINE);
});

test("the retry after a refused flip lands, clears the line, and turning it back on drops the key", async ({
  page,
}) => {
  const { listed } = await projectWithServers(page, "r171retry", seed());

  const state = { seen: [], refuse: true };
  await interceptConfigPut(page, state);

  await page.goto(`/agents/${AGENT}?tab=tools`);
  await expect(switchOf(page, NAME)).toBeVisible();

  await switchOf(page, NAME).click();
  await expect(refusalBand(page, NAME).getByRole("alert")).toHaveText(REFUSED_LINE);

  // Same switch, second click: this time the write lands, so the sentence goes and the switch
  // moves to the position the server now has.
  state.refuse = false;
  await switchOf(page, NAME).click();
  await expect(refusalBand(page, NAME).getByRole("alert")).toHaveCount(0);
  await expect(switchOf(page, NAME)).not.toBeChecked();
  expect(state.seen).toHaveLength(2);
  // The write says `false` on that row and leaves the other one exactly as it was.
  const off = state.seen[1].config.mcpServers;
  expect(off.find((s) => s.name === NAME)?.config.enabled).toBe(false);
  expect(off.find((s) => s.name === QUIET)?.config).toEqual({
    url: "https://quiet.example.com/mcp",
  });
  expect((await listed()).find((s) => s.name === NAME)?.config.enabled).toBe(false);

  // And back on: the entry drops the key rather than storing `true`, so it keeps following the
  // default — the same normalization the form does.
  await switchOf(page, NAME).click();
  await expect(switchOf(page, NAME)).toBeChecked();
  expect(state.seen).toHaveLength(3);
  const on = state.seen[2].config.mcpServers.find((s) => s.name === NAME)?.config;
  expect(on).toBeDefined();
  expect("enabled" in on).toBe(false);
  expect((await listed()).find((s) => s.name === NAME)?.config.enabled).toBeUndefined();
});
