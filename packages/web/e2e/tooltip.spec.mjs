/**
 * Regression: the hover panel holds the two rules of rounds 66 and 69 (upstream #1051 and
 * #1069, `docs/FORK-PROGRESS.md` §5.44 / §5.46) on the surfaces a user actually hovers.
 *
 * Every rule there is decided in the tooltip module and held by `packages/ui/test/
 * tooltip.test.ts`; what that file cannot see is the wiring — the one `<TooltipLayer>` at the
 * app root hearing a real pointer, the panel landing where the rule says, and the DOM carrying
 * the marking the rule reads (`data-tooltip-extra`, or nothing at all on a line the page
 * shortens). Those are the three things pinned here.
 *
 * 1. A line the page shortens — an Agent's name on its card, cut off with an ellipsis — shows
 *    its whole text on hover, without the page having to say so (§5.46).
 * 2. A hint on a control at the foot of the window turns over its trigger instead of running
 *    off the window: the composer's context ring, with less room under it than a panel needs
 *    (§5.35 / §5.46).
 * 3. A hint marked as adding what the screen does not show (`data-tooltip-extra`: the
 *    last-modified time behind "今天") opens over fully visible text, while a hint that only
 *    repeats the visible number does not (§5.44).
 *
 * The panel opens after a 400 ms hover delay (`OPEN_DELAY_MS`), so each assertion waits rather
 * than racing it; the negative case waits the delay out on purpose.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "tooltips";
const P = "password123";
const AGENT = "tooltip_long_name";
/** Long enough that the card has to cut it off; CJK so 80 characters are wide at 16 px. */
const LONG_NAME = "超长名字的智能体用来确认悬停时能把被省略号截掉的后半段完整读出来".repeat(2);

/**
 * A Project without model credentials pops an onboarding overlay (`fixed inset-0`) on every
 * page load, which would swallow whatever we mean to hover; the mock LLM stands in for a real
 * provider so no key is needed.
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
 * Sign in, configure the first Project's models, and leave an Agent whose name cannot fit its
 * card. Idempotent (the Agent and its name survive a rerun of this spec alone on the shared
 * data root).
 */
async function arrange(page) {
  await provisionAndLogin(page.request, U, P);
  const project = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0];
  await configureModels(page.request, project.projectId);
  const created = await page.request.post(`${BASE}/api/projects/${project.projectId}/agents`, {
    data: { agentId: AGENT, name: LONG_NAME },
  });
  expect([201, 409], "create the long-named Agent").toContain(created.status());
  return project;
}

test("a truncated line shows its whole text on hover", async ({ page }) => {
  await arrange(page);
  await page.goto("/agents");

  const name = page.getByText(LONG_NAME, { exact: true });
  await expect(name).toBeVisible();
  // The panel only answers a line that is *actually* cut off, so the premise has to hold: the
  // card is narrower than its name. If a layout change lets it fit, this fails loudly instead
  // of quietly testing nothing.
  expect(
    await name.evaluate((el) => el.scrollWidth > el.clientWidth + 1),
    "the card cuts the name off",
  ).toBe(true);

  await name.hover();
  const panel = page.getByTestId("tooltip");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveText(LONG_NAME);
});

test("a hint at the foot of the window turns over its trigger", async ({ page }) => {
  const project = await arrange(page);
  // The ring only exists on a Session (a draft has no context usage to speak of): create one
  // through the same API the composer uses.
  const sess = await page.request.post(
    `${BASE}/api/projects/${project.projectId}/agents/default_agent/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" } },
  );
  expect(sess.ok(), "create session").toBeTruthy();
  const sessionId = (await sess.json()).session.sessionId;

  await page.goto(`/chat/${sessionId}`);
  const ring = page.locator('button[aria-label^="上下文占用"]').first();
  await expect(ring).toBeVisible();

  const trigger = await ring.boundingBox();
  const viewport = page.viewportSize();
  // A panel under the ring would need `PANEL_GAP` (8) plus its own height; there is less room
  // than that below the composer, which is what makes it turn over. Measured against the
  // panel's real height below, not assumed.
  const roomBelow = viewport.height - 8 - (trigger.y + trigger.height + 8);
  expect(roomBelow, "the ring sits at the foot of the window").toBeLessThan(40);

  await ring.hover();
  const panel = page.getByTestId("tooltip");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("上下文占用");

  const placed = await panel.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      inlineTop: el.style.top,
      inlineBottom: el.style.bottom,
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
    };
  });
  // Anchored by its bottom edge, grown upwards: exactly the branch taken only when the panel
  // does not fit below.
  expect(placed.inlineBottom).not.toBe("");
  expect(placed.inlineTop).toBe("");
  expect(roomBelow).toBeLessThan(placed.height);
  expect(placed.bottom).toBeLessThanOrEqual(trigger.y);
  expect(placed.top).toBeGreaterThanOrEqual(0);
});

test("a hint adding what the screen does not show opens over visible text", async ({ page }) => {
  await arrange(page);
  await page.goto("/agents");

  // Marked: the visible "今天" stands for a time the reader cannot see in full.
  const updated = page.locator('[data-tooltip^="最后修改"]').first();
  await expect(updated).toBeVisible();
  await updated.hover();
  const panel = page.getByTestId("tooltip");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("最后修改");

  // Pointer leave closes it; the next hover starts from nothing rather than swapping in place.
  await page.mouse.move(0, 0);
  await expect(panel).toHaveCount(0);

  // Not marked, and it only repeats the visible count — which is why it never opens.
  const count = page.locator('[data-tooltip$="个 Session"]').first();
  await expect(count).toBeVisible();
  await count.hover();
  // Past the open delay, with nothing in flight.
  await page.waitForTimeout(800);
  await expect(page.getByTestId("tooltip")).toHaveCount(0);
});
