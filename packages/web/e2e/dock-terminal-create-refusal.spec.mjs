/**
 * Regression: a shell create the server refuses, STARTED FROM THE DOCK'S PICKER, keeps its
 * reason under that picker's terminal row instead of leaving it in a notice that dismisses
 * itself six seconds later.
 *
 * An open dock with no tabs is the picker ("choose what to open here"), and pressing its
 * terminal row is a click that used to leave the screen exactly as it was — the row still
 * there, the shell still absent, and the reason in a toast. Now the sentence stays under the
 * picker, with the server's own words, until the next attempt; a create that lands takes it
 * away. The keyboard path with the dock hidden is unchanged (no surface of its own there —
 * dock.spec.mjs pins that one as a toast). The picker is the surface that asked, and the
 * sentence is where the next attempt is made.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "dockuser";
const P = "password123";

/** The sentence the picker draws: the app's words plus the server's `error.message`. */
const REFUSED = "无法打开终端：Could not start a shell: posix_spawn failed (mock)";

/**
 * A Project without model credentials pops the onboarding overlay (fixed inset-0) as soon as
 * /chat loads, which would swallow every click on the dock; configure the mock model first,
 * like the other app-shell specs do.
 */
async function configureProjectModel(request) {
  const projectId = (await (await request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  const put = await request.put(`${BASE}/api/projects/${projectId}/models`, {
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

async function createSession(request, projectId) {
  const res = await request.post(
    `${BASE}/api/projects/${projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8" } },
  );
  expect(res.ok(), "create session").toBeTruthy();
  return (await res.json()).session.sessionId;
}

/** The dock adopts a live shell no conversation holds before creating one: start from zero. */
async function killAllTerminals(request) {
  const { terminals } = await (await request.get(`${BASE}/api/terminals`)).json();
  for (const t of terminals) await request.delete(`${BASE}/api/terminals/${t.id}`);
  await expect
    .poll(
      async () => {
        const res = await (await request.get(`${BASE}/api/terminals`)).json();
        return res.terminals.filter((t) => t.alive).length;
      },
      { timeout: 10000 },
    )
    .toBe(0);
}

/** A failed spawn the server would answer with (its own body shape: `error.code` + `error.message`). */
function spawnFailure(route) {
  return route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({
      error: {
        code: "terminal_spawn_failed",
        message: "Could not start a shell: posix_spawn failed (mock)",
      },
    }),
  });
}

test("a shell create refused from the empty dock's picker keeps its reason under the picker", async ({
  page,
}) => {
  await provisionAndLogin(page.request, U, P);
  const projectId = await configureProjectModel(page.request);
  await killAllTerminals(page.request);
  const sessionId = await createSession(page.request, projectId);

  await page.route("**/api/terminals", (route) =>
    route.request().method() === "POST" ? spawnFailure(route) : route.continue(),
  );

  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).waitFor();

  // Pull the dock open: with no tabs it shows the picker, whose terminal row asks for a shell.
  await page.getByTestId("dock-toggle-bottom").click();
  const picker = page.getByTestId("dock-picker");
  await expect(picker).toBeVisible();
  await picker.getByTestId("dock-pick-terminal").click();

  // The sentence is under the picker, saying why — the click did not just do nothing.
  const sentence = page.getByTestId("dock-terminal-create-refusal");
  await expect(sentence).toHaveText(REFUSED);
  await expect(picker).toBeVisible();
  // ... and it is not ALSO a notification that would dismiss itself.
  const notices = page.getByRole("region", { name: "通知" });
  await expect(notices.getByRole("button")).toHaveCount(0);

  // Six seconds is how long a toast lives; this sentence has to still be there.
  await page.waitForTimeout(7_000);
  await expect(sentence).toHaveText(REFUSED);
  await expect(notices.getByRole("button")).toHaveCount(0);

  // The server recovers: the same row starts a real shell, and the sentence goes with it.
  await page.unroute("**/api/terminals");
  await picker.getByTestId("dock-pick-terminal").click();
  await expect(page.locator('[data-testid="dock-terminal-body"][data-status="ready"]')).toBeVisible(
    { timeout: 20000 },
  );
  await expect(sentence).toHaveCount(0);
  await killAllTerminals(page.request);
});
