/**
 * Regression: the company rail's channel hints (§7.10, `docs/FORK-PROGRESS.md`).
 *
 * Round 85 pinned the *horizontal* rules a hover panel follows for the development rail and
 * the right-hand dock, but the company mode sidebar's collapsed rail — the channel rows in
 * `ChannelRailRows` (`features/company/channel-sidebar.tsx`) — was left to unit tests only.
 * It is not the same strip: its rows carry an unread count (or an "@me" count) folded into the
 * same hint, they live below the page entries rather than at the top of the rail, and the row
 * an organization opens on is marked current. So two cases here:
 *
 * 1. A channel's hint opens to the RIGHT of the rail, against the gap after its icon,
 *    vertically centred on the row — over the page, never over the icons the pointer travels
 *    between, and on screen however long the label.
 * 2. A row whose count moved carries that count in the hint ("全员频道 · 1 条未读") — the badge
 *    is decorative (`aria-hidden`), so the hint and the row's accessible name have to say the
 *    same whole sentence, and the panel has to be placed by the same rule once its text is
 *    longer.
 *
 * Both are measured against the trigger's real box and the real viewport, not against
 * hard-coded pixels: the assertions name the rule (gap, centring, which edge is pinned, how far
 * the panel may grow), so a layout change that keeps the rule keeps the test green.
 *
 * Company mode is off on a fresh server, so each test turns the admin master switch on through
 * /api/admin/settings (idempotent). The organization is created through the API rather than
 * the dialog: this spec is about the rail, not about creation, and the CEO's initialization run
 * is answered by the mock just as it is in `company.spec.mjs`.
 */
import { test, expect, request } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login, provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";
/** Per-organization id: every test signs up its own user, so its Project is its own too. */
const ORG = "railorg";
/** The gap the module keeps between a trigger and its panel (`PANEL_GAP`). */
const GAP = 8;
/** The margin the module keeps from the window's edges (`VIEWPORT_MARGIN`). */
const MARGIN = 8;

/** The admin master switch, off by default: turned on server-wide before the flow starts. */
async function enableCompanyMode() {
  const adminCtx = await request.newContext();
  try {
    await login(adminCtx, ADMIN_ID, ADMIN_PASSWORD);
    const res = await adminCtx.put(`${BASE}/api/admin/settings`, { data: { companyMode: true } });
    if (!res.ok()) {
      throw new Error(`enable company mode failed: ${res.status()} ${await res.text()}`);
    }
  } finally {
    await adminCtx.dispose();
  }
}

/**
 * A Project without model credentials pops an onboarding overlay (`fixed inset-0`) on every
 * page load, which would swallow the rail; the mock LLM stands in for a real provider so no key
 * is needed — and so the organization's initialization run has somewhere to answer.
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

/** Sign in as a fresh user, configure the mock as the Project's model, and create the org. */
async function setUp(page) {
  const user = `railhint_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  await provisionAndLogin(page.request, user, P);
  const project = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0];
  const projectId = project.projectId;
  await configureModels(page.request, projectId);
  const created = await page.request.post(`${BASE}/api/projects/${projectId}/organizations`, {
    data: { orgId: ORG, mission: "Publish the plugin marketplace and reach the top of search." },
  });
  expect(created.ok(), "create organization").toBeTruthy();
  return { user, projectId };
}

/** The organization's API base, and the channel base the rail's rows link to. */
const orgBase = (projectId) => `/api/projects/${projectId}/organizations/${ORG}`;
const channelBase = (projectId, channelId = "default_channel") =>
  `${orgBase(projectId)}/channels/${channelId}`;

/**
 * Switch the signed-in user to company mode from the sidebar's own control (the mode is a
 * per-user preference, so there is no API for it), landing on the organization's page.
 */
async function switchToCompany(page) {
  await page.goto("/");
  const modeSwitch = page.getByRole("group", { name: "工作模式" });
  await expect(modeSwitch).toBeVisible();
  // The option's accessible name carries the beta tag as a suffix ("公司 · 内测版").
  await modeSwitch.getByRole("button", { name: /^公司/ }).click();
  await expect(page).toHaveURL(/\/org/);
}

/**
 * Fold the sidebar to its 48 px rail and wait for the fold to finish: the width animates, and a
 * box measured mid-fold still reports the expanded sidebar's edge (the panel is placed from the
 * row's own box, so only the rail-edge assertion would be wrong — but quietly).
 */
async function collapseRail(page) {
  await page.getByRole("button", { name: "收起侧栏" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector("aside")?.getBoundingClientRect().right ?? 999),
    )
    .toBeLessThanOrEqual(48.5);
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

/**
 * The rule every `beside` hint follows, asserted once for one trigger: pinned by its left edge
 * at the gap after the trigger, wholly outside the rail, centred on the trigger, on screen, and
 * told how far it may grow before the far margin.
 */
async function expectBeside(page, trigger, panel, { text }) {
  await expect(panel).toBeVisible();
  await expect(panel).toHaveText(text);
  const placed = await readPanel(panel);
  const viewport = page.viewportSize();
  const railRight = await trigger.evaluate(
    (el) => el.closest("aside")?.getBoundingClientRect().right ?? Number.NaN,
  );

  // Pinned by its left edge and growing rightward: `top`/`bottom` and `left`/`right` are
  // exclusive pairs on the panel.
  expect(placed.inlineLeft).not.toBe("");
  expect(placed.inlineRight).toBe("");
  expect(placed.inlineTop).not.toBe("");
  expect(placed.inlineBottom).toBe("");
  const box = await trigger.boundingBox();
  expect(
    Math.abs(parseFloat(placed.inlineLeft) - (box.x + box.width + GAP)),
    "the panel starts at the gap after the row",
  ).toBeLessThanOrEqual(1);
  // No part of the rail sits under the panel: it covers the page, never the column of icons.
  // The rail's edge is a sub-pixel measurement, so the comparison allows one pixel rather than
  // depending on which rounding wins.
  expect(placed.rect.left).toBeGreaterThanOrEqual(railRight - 1);
  // Vertically centred on the row it names.
  const rowMiddle = box.y + box.height / 2;
  expect(
    Math.abs((placed.rect.top + placed.rect.bottom) / 2 - rowMiddle),
    "the panel is centred on the row",
  ).toBeLessThanOrEqual(1.5);
  // Wholly on screen, and capped by the room left from that gap to the far margin.
  expect(placed.rect.top).toBeGreaterThanOrEqual(0);
  expect(placed.rect.bottom).toBeLessThanOrEqual(viewport.height);
  expect(placed.rect.right).toBeLessThanOrEqual(viewport.width);
  expect(placed.maxWidth).toContain(`${viewport.width - (box.x + box.width + GAP) - MARGIN}px`);
  return placed;
}

test("a channel's hint opens beside the company rail, not over it", async ({ page }) => {
  await enableCompanyMode();
  const { projectId } = await setUp(page);
  await switchToCompany(page);
  // The all-hands channel is the one every organization has, and the rail lists it first.
  await page.goto(`/org/${projectId}/${ORG}/channels/default_channel`);
  await expect(page.getByRole("heading", { name: /全员频道/ })).toBeVisible();
  await collapseRail(page);

  const entry = page.getByRole("link", { name: /^全员频道/ });
  await expect(entry).toBeVisible();
  const trigger = await entry.boundingBox();
  // The premise: this row is a 32 px icon in a 48 px column against the left edge — narrower
  // than the label it carries, so a panel inside the column could not hold it, and one hung
  // under the row would sit on the next icon down. That is what makes it a `beside` trigger.
  const railRight = await entry.evaluate(
    (el) => el.closest("aside")?.getBoundingClientRect().right ?? Number.NaN,
  );
  expect(railRight, "the row sits in the 48 px rail").toBeLessThanOrEqual(48.5);
  expect(trigger.x + trigger.width, "the row is inside the rail").toBeLessThanOrEqual(railRight);

  await entry.hover();
  const panel = page.getByTestId("tooltip");
  await expectBeside(page, entry, panel, { text: "全员频道" });

  // Leaving the row takes the panel with it: it belongs to the pointer, not to the page.
  await page.mouse.move(600, 400);
  await expect(panel).toHaveCount(0);
});

test("a row's hint carries the unread count the badge cannot read", async ({ page }) => {
  await enableCompanyMode();
  const { user, projectId } = await setUp(page);
  await switchToCompany(page);

  // Visit the channel first: a fresh organization's all-hands channel starts empty, so the line
  // posted below is the first one this reader has — and it arrives while the reader is
  // elsewhere, which is what makes it unread rather than marked read on sight.
  await page.goto(`/org/${projectId}/${ORG}/channels/default_channel`);
  await expect(page.getByRole("heading", { name: /全员频道/ })).toBeVisible();

  // Someone else writes while this reader is elsewhere.
  await page.goto(`/org/${projectId}/${ORG}/overview`);
  const member = `${user}_b`;
  const memberCtx = await request.newContext();
  try {
    await provisionAndLogin(memberCtx, member, P);
    const added = await page.request.post(`${BASE}/api/projects/${projectId}/members`, {
      data: { userId: member },
    });
    expect(added.ok(), "add the second member").toBeTruthy();
    const posted = await memberCtx.post(`${BASE}${channelBase(projectId)}/messages`, {
      data: { text: "早上好，今天先看站点。" },
    });
    expect(posted.ok(), "post as the other member").toBeTruthy();
  } finally {
    await memberCtx.dispose();
  }

  // The count is the server's, not a number written into this test: whatever the channel holds
  // unread for this reader is what the badge and the hint must both say.
  const channels = await (await page.request.get(`${BASE}${orgBase(projectId)}/channels`)).json();
  const allHands = channels.channels.find((c) => c.channelId === "default_channel");
  expect(allHands.unread, "the other member's line is unread here").toBeGreaterThan(0);
  const note =
    allHands.mentionsMe > 0 ? `${allHands.mentionsMe} 条 @我` : `${allHands.unread} 条未读`;
  const name = `全员频道 · ${note}`;

  // A reload rather than the live event: the hint is what this test is about, and the row has
  // to carry the count from a listing the server answered, not from a push that may race it.
  await page.reload();
  await collapseRail(page);
  const entry = page.getByRole("link", { name });
  await expect(entry).toBeVisible();
  // The badge is decorative — an `aria-hidden` count drawn as an icon — so the name above is
  // the only way a reader (or a hint) learns it, and the panel must not say it twice.
  await expect(entry.locator("span[aria-hidden]").first()).toBeVisible();
  await entry.hover();
  const panel = page.getByTestId("tooltip");
  const placed = await expectBeside(page, entry, panel, { text: name });
  // The longer sentence still fits: a count adds words, not a second line pushed off screen.
  expect(placed.rect.bottom - placed.rect.top).toBeLessThan(48);
});
