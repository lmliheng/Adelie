/**
 * A layout change keeps what the reader typed into the Messaging panel — and does not invent it
 * anywhere else.
 *
 * The panel's binding form is the shared editor's component state (features/messaging/
 * messaging-binding-editor.tsx), so the body the dock mounts on the other surface starts from the
 * server's answer: a token pasted in, an App ID typed in, a channel picked were all gone after
 * crossing the breakpoint, and the reader retyped them. What is kept is only what says something
 * the server does not (a form equal to its baseline leaves no record), and only for a MOVE: the
 * same tab closed and reopened starts the panel over, which is how the rest of this family treats
 * a remount that is not a move.
 *
 * Every test reads the panel on both sides of the crossing, so a pass says the form came back
 * rather than that the reading missed it.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const AGENT = "default_agent";
const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 900 };
/** What the reader types, and what both sides of the crossing must read back. */
const TYPED_ID = "cli_typed_in_the_panel";
const TYPED_SECRET = "secret-the-reader-typed";

/** Provision the user, aim the Project's model at the mock, and open one allow-all Session. */
async function openSession(page, user) {
  await provisionAndLogin(page.request, user, "password123");
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
  // The panel itself needs no model, but a conversation is created against the Project's default
  // one — aim it at the repository's mock so this spec stands on a data root of its own.
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
  const created = await page.request.post(
    `${BASE}/api/projects/${projectId}/agents/${AGENT}/sessions`,
    { data: { provider: "custom", modelId: "claude-4-8", approvalMode: "allow-all" } },
  );
  expect(created.ok(), "create session").toBeTruthy();
  return (await created.json()).session.sessionId;
}

/** Open the conversation with the Messaging panel shown in the right dock. */
async function openPanel(page, sessionId) {
  await page.goto(`${BASE}/chat/${sessionId}`);
  await page.getByPlaceholder(/输入消息/).waitFor();
  await page.getByTestId("dock-toggle-right").click();
  await page.getByTestId("dock-pick-messaging").click();
  const panel = page.locator('[data-testid="dock"][data-position="right"][data-open="true"]');
  await expect(panel.locator('[data-tab-id="messaging"][data-active="true"]')).toBeVisible();
  await expect(appId(panel)).toBeVisible();
  return panel;
}

/** The dock on screen — the narrow layout draws the panel on the merged surface, its own dock. */
const onScreenDock = (page) => page.locator('[data-testid="dock"]:visible');

/**
 * The two fields, named the way the form names them. App ID is an untyped input (the browser's
 * default text), so it is reached by its label; App Secret is the one carrying `type=password`.
 */
const appId = (dock) => dock.getByLabel("App ID", { exact: true });
const secret = (dock) => dock.locator('input[type="password"]').first();

/** The channel selector's QQ chip (a Segmented option is a button with aria-pressed). */
const qqChip = (dock) => dock.getByRole("button", { name: "QQ", exact: true });

/**
 * What a field holds, read straight off the DOM: the panel's inputs sit in a scroll box whose
 * actionability Playwright's `inputValue()` never settles on, and the value is what this file is
 * about.
 */
const valueOf = (field) => field.evaluate((el) => el.value);

/**
 * Cross the breakpoint and read the panel on both sides, once the move has settled (the dock
 * that loses the panel collapses over 200 ms and the other one grows in its place).
 */
async function acrossLayouts(page, read) {
  const settle = async (where) => {
    await expect
      .poll(async () => onScreenDock(page).count(), { message: `one dock on screen ${where}` })
      .toBe(1);
    await page.waitForTimeout(250); // DOCK_TRANSITION_MS
    expect(await onScreenDock(page).count(), `still one dock ${where}`).toBe(1);
  };
  await page.setViewportSize(NARROW);
  await settle("after narrowing");
  const narrow = await read(onScreenDock(page));
  await page.setViewportSize(WIDE);
  await settle("after widening");
  const wideAgain = await read(onScreenDock(page));
  return { narrow, wideAgain };
}

test("a layout change keeps the credentials typed into the Messaging panel", async ({ page }) => {
  const sessionId = await openSession(page, "messagingformlayout");
  const panel = await openPanel(page, sessionId);

  await appId(panel).fill(TYPED_ID);
  await secret(panel).fill(TYPED_SECRET);

  const read = async (dock) => ({
    appId: await valueOf(appId(dock)),
    secret: await valueOf(secret(dock)),
  });
  const { narrow, wideAgain } = await acrossLayouts(page, read);
  expect(narrow).toEqual({ appId: TYPED_ID, secret: TYPED_SECRET });
  expect(wideAgain).toEqual({ appId: TYPED_ID, secret: TYPED_SECRET });
});

test("a layout change keeps the channel the reader switched to and what they typed there", async ({
  page,
}) => {
  const sessionId = await openSession(page, "messagingchannellayout");
  const panel = await openPanel(page, sessionId);

  // A channel switch alone is a place, not an edit: the form's `channel` is part of what is kept,
  // so the panel comes back on QQ with the QQ ID still in its field.
  await qqChip(panel).click();
  await expect(qqChip(panel)).toHaveAttribute("aria-pressed", "true");
  await appId(panel).fill("102030405");

  const read = async (dock) => ({
    onQQ: await valueOf(appId(dock)),
    qqPicked: await qqChip(dock).getAttribute("aria-pressed"),
  });
  const { narrow, wideAgain } = await acrossLayouts(page, read);
  expect(narrow).toEqual({ onQQ: "102030405", qqPicked: "true" });
  expect(wideAgain).toEqual({ onQQ: "102030405", qqPicked: "true" });
});

test("closing the tab and opening it again starts the panel over", async ({ page }) => {
  const sessionId = await openSession(page, "messagingformreopen");
  const panel = await openPanel(page, sessionId);
  await appId(panel).fill(TYPED_ID);

  // The tab's × — a remount on the SAME surface, which is not a move: the server's answer stands.
  await panel.locator('[data-tab-id="messaging"]').getByTestId("dock-tab-close").click();
  // The last tab closing puts the dock away, so the picker may need the dock opened again.
  const picker = page.getByTestId("dock-pick-messaging");
  if (!(await picker.isVisible())) await page.getByTestId("dock-toggle-right").click();
  await picker.click();
  const reopened = page.locator('[data-testid="dock"][data-position="right"][data-open="true"]');
  await expect(appId(reopened)).toBeVisible();
  expect(await valueOf(appId(reopened))).toBe("");

  // And the crossing after that has nothing to hand back: the record went with the reader's own
  // restart, so nothing of the abandoned text appears on the narrow side either.
  const read = async (dock) => ({ appId: await valueOf(appId(dock)) });
  const { narrow, wideAgain } = await acrossLayouts(page, read);
  expect(narrow).toEqual({ appId: "" });
  expect(wideAgain).toEqual({ appId: "" });
});
