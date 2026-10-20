/**
 * Regression: "Delete group" dismisses its confirmation only after the write landed, and a
 * refused write puts the group back on the page.
 *
 * The confirmation names the group and how many models go with it. It used to close on the way
 * out of the request, success or not, and `persist` keeps the attempted rows for a field edit
 * the user is still holding — so a refused delete left the page *without* that group while the
 * server still held it. Worse, the group's own header carries the only entry point to this
 * action: it went with the group, so there was nothing left to retry from and no trace of the
 * refusal beyond the toast. (Measured on the pre-fix build: dialog gone, zero matches for the
 * group's name anywhere on the page, both rows still on the server, and the delete button — the
 * only way back — absent.)
 *
 * Both tests work on a user-defined group seeded through the API: such a group exists only
 * through its rows, which is why it is the one kind that carries the group-delete action at all.
 * The seed is idempotent — the second test's user starts from the group already deleted by the
 * first run of the file, and gets it back.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const P = "password123";

/** The user-defined group both tests delete; unique enough that its name appears nowhere else. */
const GROUP = "probegroup";

/** The two rows the group is made of: hand-added models, which a user-defined group takes. */
const ROWS = [
  { provider: GROUP, modelId: "probe-a", displayName: "Probe A" },
  { provider: GROUP, modelId: "probe-b", displayName: "Probe B" },
];

/** The table entry a `ModelInfo` came from: every field the response reports, sent back as-is. */
function toEntry(m) {
  const entry = { provider: m.provider, modelId: m.modelId };
  for (const key of [
    "displayName",
    "contextWindow",
    "clientType",
    "vision",
    "maxTokens",
    "fastMode",
    "pricing",
  ]) {
    if (m[key] !== undefined) entry[key] = m[key];
  }
  if (m.credential?.baseUrl !== undefined) entry.baseUrl = m.credential.baseUrl;
  return entry;
}

/**
 * Provision the user and make sure their Project holds the group (the second run on the same
 * data root finds it already deleted or already seeded and leaves the table as it is).
 */
async function projectWithGroup(page, userId) {
  await provisionAndLogin(page.request, userId, P);
  const { projects } = await (await page.request.get(`${BASE}/api/projects`)).json();
  const projectId = projects[0].projectId;
  const read = async () =>
    (await page.request.get(`${BASE}/api/projects/${projectId}/models`)).json();
  const rowsOf = (table) => table.models.filter((m) => m.provider === GROUP);

  let table = await read();
  if (rowsOf(table).length !== ROWS.length) {
    const put = await page.request.put(`${BASE}/api/projects/${projectId}/models`, {
      data: {
        defaultModel: table.defaultModel,
        models: [
          ...table.models.filter((m) => m.provider !== GROUP).map(toEntry),
          ...ROWS.map((row) => ({
            ...row,
            contextWindow: 32000,
            clientType: "openai-chat",
            baseUrl: "http://127.0.0.1:9/v1",
            maxTokens: 4096,
          })),
        ],
      },
    });
    expect(put.ok(), "seed the user-defined group through the table PUT").toBeTruthy();
    table = await read();
  }
  expect(rowsOf(table).length, "the Project holds the group").toBe(ROWS.length);
  return { projectId, read, rowsOf };
}

/** Refuse every table write with a code the app has no local copy for, so the server's words show. */
async function refuseWrites(page, seen) {
  await page.route("**/api/projects/*/models", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    seen.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "models_store_closed", message: "models store is closed" },
      }),
    });
  });
}

/** Open the group's "Delete group" confirmation, expanding the group first when it starts folded. */
async function openDeleteDialog(page) {
  const button = page.getByRole("button", { name: `删除分组 ${GROUP}` });
  if (!(await button.isVisible().catch(() => false))) {
    await page.getByText(GROUP, { exact: false }).first().click();
  }
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * The card's own text with the refusal slot dropped: a refused write adds one line under the
 * sentence ("操作被拒绝：…"), and that line is the only thing the refusal is allowed to change —
 * the sentence, the list it names and the buttons must read exactly as they did before the write.
 */
async function cardText(card) {
  return (await card.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused group delete keeps its dialog, its sentence and the group the server has", async ({
  page,
}) => {
  const { read, rowsOf } = await projectWithGroup(page, "r89refuse");
  const before = await read();

  await page.goto("/models");
  const dialog = await openDeleteDialog(page);
  const sentence = await dialog.innerText();
  expect(sentence).toContain(GROUP);
  expect(sentence).toContain(`${ROWS.length} 个模型`);

  const puts = [];
  await refuseWrites(page, puts);
  await dialog.getByRole("button", { name: "确认" }).click();

  // The write was refused and the dialog stays exactly as it was — same group, same count —
  // with the server's own words added under its sentence. That is the only thing this refusal
  // puts on screen: the reason used to be a toast, which dismissed itself after six seconds and
  // sat over the card rather than in it, so the one thing the retry needs left first.
  await expect(dialog.getByText("models store is closed")).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(puts).toHaveLength(1);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // The group is back on the page, and its header still offers the way to this action: before
  // the fix the refused delete took both away while the server kept the rows.
  const deleteButton = page.getByRole("button", { name: `删除分组 ${GROUP}` });
  await expect(deleteButton).toBeVisible();
  const search = page.getByPlaceholder(/搜索模型/);
  await search.fill(ROWS[0].modelId);
  await expect(page.getByText(ROWS[0].displayName, { exact: false })).toBeVisible();
  await search.fill("");

  // And the server still holds the untouched table.
  const after = await read();
  expect(after.models.length).toBe(before.models.length);
  expect(rowsOf(after).length).toBe(ROWS.length);

  // Closing the dialog decides nothing.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(deleteButton).toBeVisible();
});

test("the retry after a refused group delete writes it, and only a written one closes the dialog", async ({
  page,
}) => {
  const { read, rowsOf } = await projectWithGroup(page, "r89retry");

  await page.goto("/models");
  const puts = [];
  let refuse = true;
  await page.route("**/api/projects/*/models", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    puts.push(route.request().url());
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "models_store_closed", message: "models store is closed" },
      }),
    });
  });

  const dialog = await openDeleteDialog(page);
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog.getByText("models store is closed")).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(puts).toHaveLength(1);

  // The retry is the same confirmation against the restored group, and it really deletes.
  refuse = false;
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(dialog).toHaveCount(0);
  expect(puts).toHaveLength(2);
  await expect(page.getByText(`已删除分组（${ROWS.length} 个模型）`)).toBeVisible();
  await expect(page.getByRole("button", { name: `删除分组 ${GROUP}` })).toHaveCount(0);

  const after = await read();
  expect(rowsOf(after)).toHaveLength(0);
});
