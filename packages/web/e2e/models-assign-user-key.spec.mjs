/**
 * Regression: the group header's "assign a user key" copies ONE of the account's own global
 * secrets onto every model of the group, as a copy rather than a link, and a refused copy keeps
 * the dialog — its list, and the entry already picked — with the reason above them.
 *
 * The write itself (POST …/models/assign-user-key) is the server's, not the page's: every
 * user-vault response is masked, so the browser can only name an entry and the server reads the
 * plaintext and writes it into the Project's model config. That is also why the page never shows
 * the key it just wrote except as the mask the table reports back.
 *
 * Three things are checked here that no unit test can: (1) an account with no user keys is told
 * where they are added, and 确认 has nothing to send; (2) the dialog offers one key at a time (a
 * model holds ONE key) and what lands on the group is what the server reports back, not what the
 * page assumed — the copy is the group's alone and leaves the account's table untouched; (3) a
 * refused copy changes nothing on the server and nothing the person can act on in the dialog.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** Two rows of one built-in group: one key, one endpoint — the only shape this action accepts. */
const PROVIDER = "deepseek";
const PROVIDER_LABEL = "DeepSeek";
const ROWS = [
  { provider: PROVIDER, modelId: "deepseek-flash", displayName: "Probe Flash" },
  { provider: PROVIDER, modelId: "deepseek-v4-pro", displayName: "Probe Pro" },
];

/**
 * A group whose rows each reach their own endpoint. One key written across it would be wrong, so
 * the action must not be offered for it at all — the same reason the group-key dialog skips it.
 */
const CUSTOM_LABEL = "Custom";
const CUSTOM_ROW = { provider: "custom", modelId: "probe-custom", displayName: "Probe Custom" };

/** The account's own secrets, and the two masks the page can show (see maskApiKey on the server). */
const KEY_A = "PROBE_MODEL_KEY_A";
const KEY_B = "PROBE_MODEL_KEY_B";
const VALUE_A = "sk-alpha-11112222";
const VALUE_B = "sk-bravo-33334444";
const MASK_A = `${VALUE_A.slice(0, 4)}…${VALUE_A.slice(-4)}`;
const MASK_B = `${VALUE_B.slice(0, 4)}…${VALUE_B.slice(-4)}`;

/** The refused copy: a 500 with its own words proves the reason came back into the dialog. */
const REFUSAL = { code: "models_store_closed", message: "models store is closed" };

/**
 * Provision the user and give the Project the table both halves need: two rows of the built-in
 * group, plus a custom row for the group that must not offer the action. A fresh Project has no
 * models at all, and without a default model the onboarding overlay covers every page.
 */
async function projectWithRows(page, userId) {
  await provisionAndLogin(page.request, userId, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
    data: {
      defaultModel: { provider: PROVIDER, modelId: ROWS[0].modelId },
      models: [
        // `clearApiKey` matters on a rerun over the same data root: an entry sent without an
        // `apiKey` KEEPS the stored one, so without it the second run would start from the key
        // the first one assigned and the "nothing is stored yet" step below would be a lie.
        ...ROWS.map((row) => ({
          ...row,
          contextWindow: 1000000,
          clientType: "deepseek-v4",
          baseUrl: "https://api.deepseek.com",
          clearApiKey: true,
        })),
        {
          ...CUSTOM_ROW,
          contextWindow: 200000,
          clientType: "openai-chat",
          baseUrl: MOCK,
          apiKey: "sk-mock",
        },
      ],
    },
  });
  expect(put.ok(), "seed the model table").toBeTruthy();
  return projectId;
}

/** The Project's model table as the server holds it — what the page reads, masks and all. */
const readModels = async (page, projectId) =>
  (await page.request.get(`${BASE}/api/projects/${projectId}/models`)).json();

/** The masked key the server reports for every row of the group (undefined until one is stored). */
async function groupMasks(page, projectId) {
  const table = await readModels(page, projectId);
  return table.models.filter((m) => m.provider === PROVIDER).map((m) => m.credential?.apiKeyMasked);
}

/** The account's own table; the vault routes replace it whole, so each seed replaces whatever was there. */
async function seedVault(page, entries) {
  const res = await page.request.put(`${BASE}/api/me/vault`, { data: { entries } });
  expect(res.ok(), "seed the account vault").toBeTruthy();
}

/** The group's header action; its accessible name carries the group because every group has one. */
const assignButton = (page, label = PROVIDER_LABEL) =>
  page.getByRole("button", { name: `从用户密钥分配 ${label}` });

/** Open the group's assign dialog and pin what it was opened for. */
async function openAssignDialog(page, label = PROVIDER_LABEL) {
  await assignButton(page, label).click();
  const dialog = page.getByRole("dialog", { name: `给「${label}」分配一条全局密钥` });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Expand a group so its model cards are laid out and readable (they start folded on load). */
async function expandGroup(page, label = PROVIDER_LABEL) {
  const toggle = page.getByRole("button", { name: new RegExp(`^${label}`) }).first();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

test("an account with no user keys is pointed at where they are added", async ({ page }) => {
  // Its own user, and one that never seeds a vault: the empty table is what this test is about,
  // and nothing here writes to it, so a rerun over the same data root starts empty as well.
  await projectWithRows(page, "r165empty");
  await page.goto("/models");
  const dialog = await openAssignDialog(page);
  await expect(dialog.getByText("你的用户密钥里还没有条目", { exact: false })).toBeVisible();
  // With nothing to pick there is nothing to confirm: the copy is the button's whole job.
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "确认" })).toBeDisabled();
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
});

test("the picked global key is copied onto every model of the group, and only that one", async ({
  page,
}) => {
  const projectId = await projectWithRows(page, "r165copy");

  // Nothing is stored on those rows to begin with — the copy is what puts a key there.
  expect(await groupMasks(page, projectId)).toEqual([undefined, undefined]);

  await page.goto("/models");
  await expect(assignButton(page)).toBeVisible();
  // The group whose rows reach their own endpoints is not offered the action at all.
  await expect(assignButton(page, CUSTOM_LABEL)).toHaveCount(0);

  await seedVault(page, [
    { key: KEY_A, value: VALUE_A },
    { key: KEY_B, value: VALUE_B },
  ]);

  const dialog = await openAssignDialog(page);
  // The hint counts the models the one key lands on, i.e. the group's rows only.
  await expect(dialog.getByText(`${ROWS.length} 个模型`, { exact: false })).toBeVisible();
  const boxA = dialog.getByRole("checkbox", { name: KEY_A });
  const boxB = dialog.getByRole("checkbox", { name: KEY_B });
  await expect(boxA).toBeVisible();
  await expect(boxB).toBeVisible();
  // Each entry carries the mask only — the value never leaves the server.
  await expect(dialog.getByText(MASK_A, { exact: true })).toBeVisible();
  await expect(dialog.getByText(MASK_B, { exact: true })).toBeVisible();

  // One key per model: picking a second replaces the first, the way a radio would.
  await boxB.click();
  await expect(boxB).toBeChecked();
  await boxA.click();
  await expect(boxA).toBeChecked();
  await expect(boxB).not.toBeChecked();
  await boxB.click();
  await expect(boxB).toBeChecked();
  await expect(boxA).not.toBeChecked();

  // The last pick stands: that is what every row of the group must end up holding.
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog).toHaveCount(0);

  // The page says how many models took it, and the table it reloaded reports the mask of B.
  await expect(
    page.getByRole("region", { name: "通知" }).getByText(`已为 ${ROWS.length} 个模型配置 API key`),
  ).toBeVisible();
  expect(await groupMasks(page, projectId)).toEqual([MASK_B, MASK_B]);
  // The copy is the group's alone: the custom row keeps the key it was seeded with.
  const table = await readModels(page, projectId);
  expect(table.models.find((m) => m.provider === CUSTOM_ROW.provider).credential.apiKeyMasked).toBe(
    "***",
  );

  // And the cards read the same mask — one per row, on the page the person is looking at. The
  // mask sits in the card's meta line beside the context window, so the card is matched by its
  // accessible name rather than by a bare text node.
  await expandGroup(page);
  await expect(page.getByRole("button", { name: new RegExp(MASK_B) })).toHaveCount(ROWS.length);

  // The copy leaves the account's own table alone: it is read, never consumed.
  const vault = (await (await page.request.get(`${BASE}/api/me/vault`)).json()).entries;
  expect(vault.map((e) => e.key).sort()).toEqual([KEY_A, KEY_B]);
});

test("a refused copy keeps the dialog, its list and the picked entry, with the reason above them", async ({
  page,
}) => {
  const projectId = await projectWithRows(page, "r165refuse");
  await seedVault(page, [{ key: KEY_A, value: VALUE_A }]);

  let refuse = true;
  const posts = [];
  await page.route("**/api/projects/*/models/assign-user-key", async (route) => {
    posts.push(route.request().postDataJSON());
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await page.goto("/models");
  const dialog = await openAssignDialog(page);
  const box = dialog.getByRole("checkbox", { name: KEY_A });
  await box.click();
  await expect(box).toBeChecked();
  await dialog.getByRole("button", { name: "确认" }).click();

  // The reason lands in the dialog that asked, and it is not a toast: the notification region
  // holds no dismissible button while the dialog is open with a refusal in it.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(posts).toHaveLength(1);
  // The request names the entry, never its value.
  expect(posts[0]).toEqual({ provider: PROVIDER, key: KEY_A });

  // The dialog is still the one the person was working in: its list is there, the entry is still
  // picked and 确认 is still the retry. (Before the fix the reason replaced the list wholesale, so
  // the choice disappeared with it and the only way back was to cancel and start over.)
  await expect(dialog).toBeVisible();
  await expect(box).toBeVisible();
  await expect(box).toBeChecked();
  await expect(dialog.getByRole("button", { name: "确认" })).toBeEnabled();

  // Nothing was written: the server's rows still carry no key at all.
  expect(await groupMasks(page, projectId)).toEqual([undefined, undefined]);

  // The retry is the same dialog, and this time the copy lands: reason gone, dialog gone.
  refuse = false;
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog).toHaveCount(0);
  expect(posts).toHaveLength(2);
  expect(await groupMasks(page, projectId)).toEqual([MASK_A, MASK_A]);
});
