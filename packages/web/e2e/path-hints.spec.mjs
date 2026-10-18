/**
 * Regression: the whole path behind a shortened one is one hover away (§5.46, upstream #1069).
 *
 * That round gave two surfaces a full-path hint and held the rules in `packages/ui`'s unit
 * tests plus a one-off probe; the wiring — the DOM carrying the marking the rule reads and the
 * app-wide `<TooltipLayer>` answering a real pointer — was never part of this suite. Two cases:
 *
 * 1. A ToolCallCard's subtitle: `read_file` shows `…/parent/file`, and hovering it names the
 *    file in full, in the code panel (`data-tooltip-content="code"`).
 * 2. A sidebar Workspace group's header: the label is the directory's basename, and the hint
 *    that carries the full path must open even when the basename fits
 *    (`data-tooltip-extra`, the prose panel).
 *
 * Both paths are real files and real directories under a temporary root: the tool reads the
 * file, and the Workspace is validated by realpath. The mock LLM is another process, so the
 * path travels in the prompt (`mock-llm.mjs`'s "read deep path test" branch) and comes back as
 * the `read_file` argument — no model key is involved.
 *
 * The panel opens after a 400 ms hover delay (`OPEN_DELAY_MS`), so the assertions wait rather
 * than race it.
 */
import { test, expect } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "pathhints";
const P = "password123";

/**
 * A Project without model credentials pops an onboarding overlay (`fixed inset-0`) on every
 * page load, which would swallow the hover; the mock LLM stands in for a real provider.
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

/** Sign in and return the user's first Project, with the mock configured as its model. */
async function signIn(page) {
  await provisionAndLogin(page.request, U, P);
  const project = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0];
  await configureModels(page.request, project.projectId);
  return project;
}

test("a file tool's shortened subtitle shows the whole path on hover", async ({ page }) => {
  const project = await signIn(page);
  // Deep enough that `shortenPath` has something to cut: `…/three/deep-notes.txt`.
  const root = await mkdtemp(join(tmpdir(), "penguin-pathhint-"));
  const dir = join(root, "one", "two", "three");
  await mkdir(dir, { recursive: true });
  const file = join(dir, "deep-notes.txt");
  await writeFile(file, "a line the tool reads\n", "utf8");
  const shortened = "…/three/deep-notes.txt";

  const sess = await page.request.post(
    `${BASE}/api/projects/${project.projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" } },
  );
  expect(sess.ok(), "create session").toBeTruthy();
  const sessionId = (await sess.json()).session.sessionId;

  await page.goto(`/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).fill(`read deep path test ${file}`);
  await page.getByRole("button", { name: "发送" }).click();
  // The turn's closing line says the tool call is over; then reopen the conversation the way a
  // reader comes back to it. Reopened, the activity group starts folded, so its header is
  // clicked open — the card under test is the one read back from the Trace, not the live row.
  await expect(page.getByText("Read the file.")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await page.locator('[data-kind="tool"]').first().click();

  // The row's subtitle is the only `data-slot="detail"` that carries a hint (the duration is
  // plain text, the tool's own name has its mark on the label).
  const subtitle = page.locator('[data-kind="tool"] [data-slot="detail"][data-tooltip]').first();
  await expect(subtitle).toHaveText(shortened);
  // What the rule reads: the whole path, the code panel, and the mark that lets it open over
  // a line that is not cut off.
  await expect(subtitle).toHaveAttribute("data-tooltip", file);
  await expect(subtitle).toHaveAttribute("data-tooltip-content", "code");
  await expect(subtitle).toHaveAttribute("data-tooltip-extra", "true");

  await subtitle.hover();
  const panel = page.getByTestId("tooltip");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveText(file);
  // A code panel: monospace, per the tooltip module's content styles.
  expect(await panel.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono/i);
});

test("a Workspace group's header shows the whole path on hover", async ({ page }) => {
  await signIn(page);
  // A deep path whose basename is short: the header label fits, so only the marking makes the
  // hint open — which is exactly the half this case pins.
  const root = await mkdtemp(join(tmpdir(), "penguin-pathhint-ws-"));
  const workspace = join(root, "projects", "alpha", "beta", "brief");
  await mkdir(workspace, { recursive: true });

  const project = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0];
  const sess = await page.request.post(
    `${BASE}/api/projects/${project.projectId}/agents/default_agent/sessions`,
    { data: { workspace } },
  );
  expect(sess.ok(), `create session in ${workspace}`).toBeTruthy();

  await page.goto("/chat");
  const sidebar = page.getByRole("complementary");
  const header = sidebar.locator(`button[data-tooltip="${workspace}"]`);
  await expect(header).toBeVisible();
  await expect(header).toHaveAttribute("data-tooltip-content", "text");
  await expect(header).toHaveAttribute("data-tooltip-extra", "true");
  // Premise: the label ("brief") fits its header, so the hint is not there because the text is
  // cut off — it opens because it is marked as saying more than the label does.
  const label = header.locator("span.truncate").first();
  await expect(label).toHaveText("brief");
  expect(
    await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    "the basename fits the header",
  ).toBe(true);

  await header.hover();
  const panel = page.getByTestId("tooltip");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveText(workspace);
  // A prose panel, not the code one: a path shown as text wraps at its separators.
  expect(await panel.evaluate((el) => getComputedStyle(el).fontFamily)).not.toMatch(/mono/i);
});
