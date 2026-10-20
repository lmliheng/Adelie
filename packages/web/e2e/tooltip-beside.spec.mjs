/**
 * Regression: the panel's other two placements — the side a hint opens on (§5.35's other half,
 * upstream #1098, `docs/FORK-PROGRESS.md`).
 *
 * Round 82 pinned the two *vertical* decisions a hover panel makes (turn over a control at the
 * foot of the window, open over visible text only when marked). The two *horizontal* ones were
 * left to `packages/ui/test/tooltip.test.ts`, which can only check the numbers
 * `besideTrigger` / `belowTrigger` return — not that the one `<TooltipLayer>` at the app root
 * hears a real pointer, measures the trigger it actually hit, and lands the panel where those
 * numbers say:
 *
 * 1. A collapsed rail is 48 px wide and sits against the left edge: its entries hang their
 *    panel to the RIGHT (`besideTrigger`), against the gap after the entry, vertically centred
 *    on it — over the page, never over the icons next to the one being asked about.
 * 2. A `bottom` panel under a control in the right half of the window aligns by its own right
 *    edge and grows leftward (`belowTrigger`'s right branch), so a row of buttons at the right
 *    end of a docked panel does not push the hint off screen.
 *
 * Both are measured against the trigger's real box and the real viewport, not against
 * hard-coded pixels: the assertions name the rule (gap, centring, which edge is pinned, how far
 * the panel may grow), so a layout change that keeps the rule keeps the test green.
 *
 * Every hint opens after a 400 ms hover delay (`OPEN_DELAY_MS`), so the assertions wait rather
 * than race it.
 */
import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provisionAndLogin } from "./auth.mjs";
import { collapseRail } from "./rail.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const U = "tooltipside";
const P = "password123";
/** The gap the module keeps between a trigger and its panel (`PANEL_GAP`). */
const GAP = 8;
/** The margin the module keeps from the window's edges (`VIEWPORT_MARGIN`). */
const MARGIN = 8;

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

/** Sign in and return the user's first Project, with the mock configured as its model. */
async function signIn(page) {
  await provisionAndLogin(page.request, U, P);
  const project = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0];
  await configureModels(page.request, project.projectId);
  return project;
}

/** What the panel was placed with, read off the element the layer portaled to the body. */
async function readPanel(panel) {
  return panel.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      inlineTop: el.style.top,
      inlineBottom: el.style.bottom,
      inlineLeft: el.style.left,
      inlineRight: el.style.right,
      maxWidth: el.style.maxWidth,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      text: el.textContent,
    };
  });
}

test("a rail entry's hint opens beside the rail, not over it", async ({ page }) => {
  await signIn(page);
  await page.goto("/agents");
  // The pinned sidebar folds to the rail; its own control is the only way there from the UI.
  // The fold animates its width, and `collapseRail` waits for the column it comes to rest at —
  // a wait for anything narrower than the expanded sidebar returns mid-fold and hands back an
  // edge the page has already left behind (see `rail.mjs` for the sampled numbers).
  await collapseRail(page);

  const entry = page.getByRole("link", { name: "插件市场" }).first();
  await expect(entry).toBeVisible();
  const trigger = await entry.boundingBox();
  // The premise: this entry is a 32 px icon in a 48 px column against the left edge — narrower
  // than the label it carries, so a panel inside the column could not hold it, and one hung
  // under the entry would sit on the next icon down. That is what makes it a `beside` trigger.
  const railRight = await entry.evaluate(
    (el) => el.closest("aside")?.getBoundingClientRect().right ?? Number.NaN,
  );
  expect(railRight, "the entry sits in the 48 px rail").toBeLessThan(80);
  expect(trigger.x + trigger.width, "the entry is inside the rail").toBeLessThanOrEqual(railRight);

  await entry.hover();
  const panel = page.getByTestId("tooltip");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveText("插件市场");
  const placed = await readPanel(panel);
  const viewport = page.viewportSize();

  // Pinned by its left edge, at the gap after the entry: the panel starts where the rail ends,
  // so it can cover a page's content but never the icons the pointer travels between.
  expect(placed.inlineLeft).not.toBe("");
  expect(placed.inlineRight).toBe("");
  expect(
    Math.abs(parseFloat(placed.inlineLeft) - (trigger.x + trigger.width + GAP)),
  ).toBeLessThanOrEqual(1);
  // No part of the rail sits under the panel. The rail's edge is a sub-pixel measurement (a
  // 48 px column with its separator measures a hair past the integer the entry's box gives), so
  // the comparison allows that one pixel rather than depending on which rounding wins.
  expect(placed.rect.left).toBeGreaterThanOrEqual(railRight - 1);
  // Vertically centred on the entry it names.
  const triggerMiddle = trigger.y + trigger.height / 2;
  expect(
    Math.abs((placed.rect.top + placed.rect.bottom) / 2 - triggerMiddle),
    "the panel is centred on the entry",
  ).toBeLessThanOrEqual(1.5);
  // On screen, and told how far it may grow before the far margin (`room` becomes its width
  // cap once a long label would otherwise run off the right edge).
  expect(placed.rect.top).toBeGreaterThanOrEqual(0);
  expect(placed.rect.bottom).toBeLessThanOrEqual(viewport.height);
  expect(placed.maxWidth).toContain(
    `${viewport.width - (trigger.x + trigger.width + GAP) - MARGIN}px`,
  );

  // The rail's head entry is a button rather than a link and is the entry closest to the
  // window's top edge, where a centred panel has the least room: it takes the same side and is
  // still wholly on screen.
  await page.mouse.move(600, 500);
  await expect(panel).toHaveCount(0);
  const head = page.getByRole("button", { name: "展开侧栏" });
  await head.hover();
  await expect(panel).toBeVisible();
  // Its hint carries the shortcut chord as well (useShortcutTitle), hence a prefix match.
  await expect(panel).toContainText("展开侧栏");
  const headBox = await head.boundingBox();
  const headPlaced = await readPanel(panel);
  expect(headPlaced.inlineRight).toBe("");
  expect(
    Math.abs(parseFloat(headPlaced.inlineLeft) - (headBox.x + headBox.width + GAP)),
  ).toBeLessThanOrEqual(1);
  expect(headPlaced.rect.top).toBeGreaterThanOrEqual(0);
  expect(headPlaced.rect.bottom).toBeLessThanOrEqual(viewport.height);
});

test("a hint under a control in the right half grows leftward", async ({ page }) => {
  const project = await signIn(page);
  // The Files panel opens on a real Workspace: an empty directory is enough, it only has to be
  // a valid path for the session to bind.
  const root = await mkdtemp(join(tmpdir(), "penguin-tooltip-side-"));
  const workspace = join(root, "deep", "work", "space");
  await mkdir(workspace, { recursive: true });
  const sess = await page.request.post(
    `${BASE}/api/projects/${project.projectId}/agents/default_agent/sessions`,
    { data: { workspace } },
  );
  expect(sess.ok(), "create session").toBeTruthy();
  const sessionId = (await sess.json()).session.sessionId;

  await page.goto(`/chat/${sessionId}`);
  await expect(page.getByPlaceholder(/输入消息/)).toBeVisible();
  // The panel docks on the right; its header's action row (new / refresh / upload) is the
  // rightmost strip of controls on the page — the case `belowTrigger`'s right branch exists for.
  await page.getByTestId("dock-toggle-right").click();
  await page.getByTestId("dock-pick-workspace").click();

  const refresh = page.getByRole("button", { name: "刷新" }).first();
  await expect(refresh).toBeVisible();
  const trigger = await refresh.boundingBox();
  const viewport = page.viewportSize();
  // The premise: without the right-aligned branch, a panel grown rightward from here would
  // cross the window's right margin.
  expect(
    trigger.x + trigger.width / 2,
    "the control is in the right half of the window",
  ).toBeGreaterThan(viewport.width / 2);

  await refresh.hover();
  const panel = page.getByTestId("tooltip");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveText("刷新");
  const placed = await readPanel(panel);

  // Pinned by its right edge to the trigger's, and hanging below it: the vertical rule still
  // applies, only the horizontal side flips.
  expect(placed.inlineRight).not.toBe("");
  expect(placed.inlineLeft).toBe("");
  expect(
    Math.abs(parseFloat(placed.inlineRight) - (viewport.width - (trigger.x + trigger.width))),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(placed.rect.right - (trigger.x + trigger.width))).toBeLessThanOrEqual(1);
  expect(placed.inlineTop).not.toBe("");
  expect(placed.inlineBottom).toBe("");
  expect(Math.abs(placed.rect.top - (trigger.y + trigger.height + GAP))).toBeLessThanOrEqual(1);
  // Whole panel on screen, and its growth capped by the room left of that edge.
  expect(placed.rect.left).toBeGreaterThanOrEqual(0);
  expect(placed.rect.right).toBeLessThanOrEqual(viewport.width - MARGIN);
  expect(placed.maxWidth).toContain(
    `${viewport.width - parseFloat(placed.inlineRight) - MARGIN}px`,
  );
});
