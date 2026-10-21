/**
 * Regression: deleting a Benchmark asks first, and a refused delete keeps that question — with
 * the server's words inside it — instead of closing on the way out of the request.
 *
 * The page used to close the confirmation from a `finally`: the card was still there (nothing was
 * deleted — the server refused) but the reason arrived as a toast that dismissed itself after six
 * seconds and sat above the card rather than in it. The card now closes only once the write
 * landed, and a refusal leaves it open with the refusal drawn under its sentence
 * (`ConfirmModal`'s `refusal` slot), so the retry is the same button.
 *
 * Both tests seed a Benchmark through the API rather than the create form: the form is its own
 * surface with its own tests, and what is measured here is the delete.
 */
import { test, expect } from "@playwright/test";
import { provisionAndLogin } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;
const P = "password123";

/** The delete call the page makes; a 500 with its own words proves the reason came back. */
const REFUSAL = { code: "benchmark_store_closed", message: "benchmark store is closed" };

/**
 * Provision the user, give the Project a model (the onboarding overlay covers the page without
 * one), and seed one Benchmark by hand. The seed drops a leftover of the same id first: a rerun of
 * this file alone shares one data root with earlier runs.
 */
async function projectWithBenchmark(page, user, id) {
  await provisionAndLogin(page.request, user, P);
  const projectId = (await (await page.request.get(`${BASE}/api/projects`)).json()).projects[0]
    .projectId;
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

  const base = `${BASE}/api/projects/${projectId}/benchmarks`;
  await page.request.delete(`${base}/${id}`);
  const created = await page.request.post(base, {
    data: {
      id,
      title: `Probe ${id}`,
      runs: 1,
      cases: [
        {
          id: "CASE-1",
          title: "A case that never runs",
          statement: "Nothing is evaluated in this test.",
          rubric: "Nothing is scored in this test.",
        },
      ],
    },
  });
  expect(created.status(), "seed the Benchmark").toBe(201);

  /** The Project's Benchmarks as the server holds them: what the page reads. */
  const listed = async () => (await (await page.request.get(base)).json()).benchmarks;

  return { projectId, listed };
}

/** Refuse every delete with a code the app has no local copy for, so the server's words show. */
async function refuseDeletes(page, seen) {
  await page.route("**/api/projects/*/benchmarks/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    seen.push(route.request().url());
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });
}

/**
 * The seeded Benchmark's own card. The page always lists the built-in Example Benchmark too, so
 * the delete button has to be reached through the card that carries the seeded title rather than
 * through the first one on the page — `.last()` picks the innermost element holding both, which is
 * the card's own row.
 */
function cardOf(page, id) {
  return page
    .locator("div")
    .filter({ has: page.getByText(`Probe ${id}`, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "删除 Benchmark" }) })
    .last();
}

/** The card's trash button → the shared confirmation. */
async function openDeleteDialog(page, id) {
  await cardOf(page, id).getByRole("button", { name: "删除 Benchmark" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * The card's own text with the refusal line dropped: a refused write adds one line under the
 * sentence ("操作被拒绝：…"), and that line is the only thing the refusal may change.
 */
async function cardText(dialog) {
  return (await dialog.innerText()).replace(/\n操作被拒绝：[^\n]*/, "");
}

test("a refused delete keeps the card, its sentence and the Benchmark", async ({ page }) => {
  const id = "refuse_probe";
  const { listed } = await projectWithBenchmark(page, "r100bench1", id);
  const before = await listed();

  await page.goto("/benchmark");
  const title = page.getByText(`Probe ${id}`, { exact: true });
  await expect(title).toBeVisible();
  const dialog = await openDeleteDialog(page, id);
  const sentence = await dialog.innerText();
  expect(sentence).toContain(`Probe ${id}`);

  const deletes = [];
  await refuseDeletes(page, deletes);
  await dialog.getByRole("button", { name: "删除", exact: true }).click();

  // The reason is in the card that asked, and it is not a toast: the notification region holds
  // no dismissible button, and the card reads exactly as it did before the attempt plus the one
  // refusal line.
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(deletes).toHaveLength(1);
  await expect(dialog).toBeVisible();
  expect(await cardText(dialog)).toBe(sentence);

  // Nothing was deleted anywhere: the card is still on the page and the server still holds it.
  await expect(title).toBeVisible();
  expect((await listed()).length).toBe(before.length);

  // Closing the card decides nothing.
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(title).toBeVisible();
});

test("the retry after a refused delete writes it, and only a written one closes the card", async ({
  page,
}) => {
  const id = "retry_probe";
  const { listed } = await projectWithBenchmark(page, "r100bench2", id);

  const deletes = [];
  let refuse = true;
  await page.route("**/api/projects/*/benchmarks/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletes.push(route.request().url());
    if (!refuse) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSAL }),
    });
  });

  await page.goto("/benchmark");
  const title = page.getByText(`Probe ${id}`, { exact: true });
  await expect(title).toBeVisible();
  const dialog = await openDeleteDialog(page, id);
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(dialog.getByText(REFUSAL.message)).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(deletes).toHaveLength(1);

  // The retry is the same card, and this time the write lands: card gone, Benchmark gone.
  refuse = false;
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(deletes).toHaveLength(2);
  await expect(title).toHaveCount(0);
  expect((await listed()).some((b) => b.id === id)).toBe(false);
});
