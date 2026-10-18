/**
 * Regression: a one-time task that has fired leaves every list, and the "已完成" chip is gone
 * (upstream #1159, landed in this fork as the 77th round; `docs/FORK-PROGRESS.md` §5.48).
 *
 * Old behaviour: a fired one-time task stayed in the list as `done`, which is why the surfaces
 * carried a "已完成" filter to hide the pile that never stopped growing. The scheduler now moves
 * every settled task — fired (`done`), missed, past `end_at` (`expired`) — into
 * `agent_state/schedule/expired/` before it announces `schedule_fired`, so the refetch that event
 * triggers no longer lists the task, and the chips are only 全部 / 生效中 / 已暂停.
 *
 * What a user sees, and what this spec pins: the task is listed while it is still to fire, the
 * row goes away on its own once the scheduler fires it (no reload, no click), and flipping
 * through every chip never brings it back. The server tests (`scheduler`, `schedule-store`) hold
 * the file move itself; this one holds the surface the user is looking at.
 *
 * The scheduler reconciles every 30 s, so the wait for the fire is part of the test's budget.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "schedsettle";
const P = "password123";
const NAME = "settle_probe";
const AGENT = "default_agent";

test("a fired one-time task leaves the list on its own", async ({ page }) => {
  test.setTimeout(120_000);
  await provisionAndLogin(page.request, U, P);
  const project = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0];
  const projectId = project.projectId;

  // The task fires into a real turn, so the Project needs a model; the mock LLM stands in.
  // Without credentials the onboarding overlay (`fixed inset-0`) swallows the page anyway.
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

  // A session for the task to fire into (bind mode: no new Session to create at fire time).
  const sess = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" } },
  );
  expect(sess.ok(), "create session").toBeTruthy();
  const sessionId = (await sess.json()).session.sessionId;

  // A single e2e run shares one data root, so a rerun of this spec alone may find the file left
  // by the run that was interrupted before the fire. Drop it; 404 is the normal first-run answer.
  await page.request.delete(`${BASE}/api/projects/${projectId}/agents/${AGENT}/schedules/${NAME}`);

  const startAt = new Date(Date.now() + 8_000).toISOString();
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/schedules`,
    { data: { name: NAME, prompt: "settle probe", enabled: true, startAt, sessionId } },
  );
  expect(created.status(), "create one-time schedule").toBe(201);

  await page.goto("/schedules");
  // Listed while it is still to fire: the row's own name, and a next-fire line under it.
  const row = page.getByText(NAME, { exact: true });
  await expect(row).toBeVisible();

  // The 5.48 UI change: settled tasks have no chip left to hide behind.
  for (const chip of ["全部", "生效中", "已暂停"]) {
    await expect(page.getByRole("button", { name: chip, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "已完成", exact: true })).toHaveCount(0);

  // The scheduler ticks every 30 s: the fire (and the archive that precedes its event) lands
  // within one tick of `startAt`, well inside this timeout. The page refetches on
  // `schedule_fired`, so the row has to disappear without any interaction.
  await expect(row).toHaveCount(0, { timeout: 75_000 });

  // Settled is not a filter state any more: every chip shows the same list, and none shows it.
  for (const chip of ["生效中", "已暂停", "全部"]) {
    await page.getByRole("button", { name: chip, exact: true }).click();
    await expect(row).toHaveCount(0);
  }
});
