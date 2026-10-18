/**
 * Regression: switching to another Project never shows — or asks about — the previous
 * Project's Agents (upstream #1165, landed in this fork as the 79th round; `docs/
 * FORK-PROGRESS.md` §5.49).
 *
 * Old bug: the Agent list was one unlabeled array, so a Project switch kept rendering the
 * old rows until the new answer arrived. The other Project's Agent cards appeared in the
 * new Project, and the pages that look an Agent up (the Agent settings page, the chat
 * composer) asked the new Project about an id it does not have — `agent_not_found`,
 * "该 Agent 已不存在。". The state layer now tags every row and every answer with its Project
 * (`src/lib/project-scope.ts`) and publishes only the current Project's rows; the unit tests
 * cover those rules, this spec pins the two things a user sees.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "projisolation";
const P = "password123";
const BETA = "IsolationBeta";
const ALPHA_ONLY = "Alpha Only";

/**
 * Both Projects need model credentials: a Project without them pops an onboarding overlay
 * (`fixed inset-0`) as soon as a page loads, which would swallow the Project dropdown.
 */
async function configureModels(ctx, projectId) {
  const put = await ctx.put(`${BASE}/api/projects/${projectId}/models`, {
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
  expect(put.ok(), `put models ${projectId}`).toBeTruthy();
}

/**
 * The signed-in user's first Project (display name = user id), an Agent that lives in it and
 * nowhere else, and a second Project. A single e2e run shares one data root, so both steps are
 * idempotent: a rerun of one spec alone finds them already there.
 */
async function arrange(page) {
  await provisionAndLogin(page.request, U, P);
  const alpha = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0];

  const created = await page.request.post(`${BASE}/api/projects/${alpha.projectId}/agents`, {
    data: { agentId: "alpha_only", name: ALPHA_ONLY },
  });
  expect([201, 409], "create the first Project's Agent").toContain(created.status());

  const betaRes = await page.request.post(`${BASE}/api/projects`, {
    data: { projectId: `${U}-beta`, name: BETA },
  });
  expect([201, 409], "create the second Project").toContain(betaRes.status());
  const projects = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects;
  const beta = projects.find((p) => p.projectId === `${U}-beta`);

  for (const id of [alpha.projectId, beta.projectId]) await configureModels(page.request, id);
  return { alpha, beta };
}

/**
 * Opens the Project dropdown (its trigger shows the current Project's name) and picks one. The
 * click is retried: a re-render that lands while the menu is opening closes it, which is exactly
 * what a page still loading its data does.
 */
async function switchProject(page, current, target) {
  const trigger = page.getByRole("button", { name: current }).first();
  const item = page.getByRole("button", { name: target }).first();
  for (let attempt = 0; attempt < 4; attempt++) {
    await trigger.click();
    if (await item.isVisible().catch(() => false)) break;
    await page.waitForTimeout(300);
  }
  await expect(item).toBeVisible();
  await item.click();
}

test("a late Agent list of the Project just left never lands in the new Project", async ({
  page,
}) => {
  const { alpha } = await arrange(page);

  // Hold the first Project's Agent list so its answer arrives *after* the switch: that is the
  // race. Without the hold the answer loses to the new Project's own list anyway, and the old
  // bug would need a slow network or a slow machine to show up at all.
  let held = 0;
  await page.route(`**/api/projects/${alpha.projectId}/agents`, async (route) => {
    if (held++ === 0) await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });

  await page.goto("/agents");
  await switchProject(page, U, BETA);

  // The new Project's own list settles first …
  await expect(page.getByText("General Agent")).toBeVisible();
  // … then the held answer lands, and the previous Project's Agent must not appear under it.
  await page.waitForTimeout(3500);
  await expect(page.getByText(ALPHA_ONLY)).toHaveCount(0);
});

test("leaving an Agent page on a Project switch asks the new Project nothing about that Agent", async ({
  page,
}) => {
  await arrange(page);

  // Every request that names the first Project's Agent, so the switch can be judged by whether
  // the new Project's URL is among them.
  const asks = [];
  page.on("request", (request) => {
    if (request.url().includes("/agents/alpha_only")) asks.push(request.url().replace(BASE, ""));
  });

  await page.goto("/agents/alpha_only");
  // The settings page names the Agent and offers its tabs — the page really opened on it.
  await expect(page.getByRole("heading", { name: ALPHA_ONLY })).toBeVisible();

  const before = asks.length;
  await switchProject(page, U, BETA);

  // The Agent page leaves for the list (the new Project has no such Agent to configure) …
  await expect(page).toHaveURL(/\/agents$/);
  await expect(page.getByText(ALPHA_ONLY)).toHaveCount(0);
  // … without asking the new Project about the previous Project's Agent.
  expect(asks.slice(before)).toEqual([]);
});
