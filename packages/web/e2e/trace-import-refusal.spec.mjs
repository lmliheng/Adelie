/**
 * Regression: an import that was REFUSED says why in the row that asked (Settings → General →
 * 「导入 Trace」), under its three pickers, and the sentence outlives the six seconds a toast lives.
 *
 * The row keeps everything on a refusal: the import writes nothing, so both pickers and the file
 * pick stay exactly as they were, and picking a file again is the retry. The reason used to arrive
 * as a notification over them — so a reader who looked away was left with a row that looked
 * untouched and no way to tell a duplicate Session from a malformed file.
 *
 * Both cases run against the real server: a Trace is imported twice (the second one is the route's
 * own 409 `trace_session_exists`), and a file past the client's ceiling is refused before a byte of
 * it is read — the second test counts the import requests to prove nothing was uploaded. Session ids
 * carry a per-run suffix, so a run over a data root that already holds one still starts fresh.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

/** A Session id no earlier run of this spec has used (ids are unique across the whole install). */
function sessionId() {
  return `session-2026-07-06-09-00-00-${Math.random().toString(16).slice(2, 10)}`;
}

/** The lines the row draws: the shared lead-in plus the app's sentence for the code / the ceiling. */
const DUPLICATE_REFUSED = "操作被拒绝：该 Agent 已存在同名 Session，无法导入重复的 Trace。";
const TOO_LARGE_REFUSED = "操作被拒绝：文件超过 14MB 上限。";

/**
 * A Trace file the import route accepts: JSONL whose first record is `session_meta` (a shard with
 * no meta is refused — the import derives the Session's identity and date directory from it).
 */
function traceFile(sessionId, name) {
  const rec = (timestamp, type, payload) => JSON.stringify({ timestamp, type, payload });
  const lines = [
    rec("2026-07-06T02:00:00.000Z", "session_meta", {
      session_id: sessionId,
      model_id: "m",
      provider: "custom",
      model_context_window: 1000,
      system_prompt: "",
      agent_state: "/tmp/a",
      workspace: "/tmp/w",
      source: "user",
    }),
    rec("2026-07-06T02:00:01.000Z", "model_msg", {
      type: "text",
      role: "user",
      text: `imported ${sessionId}`,
    }),
  ];
  return { name, mimeType: "application/x-ndjson", buffer: Buffer.from(`${lines.join("\n")}\n`) };
}

/**
 * Sign in as the seeded administrator (the row is the Project owner's) and give the Project a
 * model — the onboarding overlay covers the page without one.
 */
async function ready(page) {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
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
  return projectId;
}

/** The Sessions the receiving Agent has, by id — the import's own record that something landed. */
async function importedIds(request, projectId) {
  const res = await request.get(`${BASE}/api/projects/${projectId}/agents/default_agent/sessions`);
  return (await res.json()).sessions.map((s) => s.sessionId);
}

/** The settings dialog, opened the way a person opens it: the user menu, then 通用. */
async function openGeneral(page) {
  // The user menu shares its name with the Project switcher, so take the last match (as chat.spec).
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "通用", exact: true }).click();
  return settings;
}

/**
 * The row's own column: the pickers and the refusal share one `data-slot="control"` box, which is
 * what makes "the sentence is in this row" checkable — the page has other rows, and none of them
 * may draw it.
 */
function controlOf(settings) {
  return settings.locator(
    'div[data-slot="control"]:has(input[type="file"][accept=".jsonl,.json"])',
  );
}

/**
 * Wait until the row can work at all: its Agent list is fetched after the Project is known, and
 * while it is empty the row disables its own pick (a pick before then is a no-op for the reader).
 */
async function settled(row) {
  await expect(row.getByRole("button", { name: "导入到 Agent" })).toContainText("General Agent");
}

/** Pick a file in the row, and wait for the next pick to be possible again. */
async function pick(row, file) {
  await row.locator('input[type="file"]').setInputFiles(file);
  await expect(row.getByText("选择文件", { exact: true })).toBeVisible();
}

/** The upload the row sends for a file it reads. */
const isImport = (res) => res.request().method() === "POST" && res.url().includes("/traces/import");

test("a refused import keeps its reason under the pickers, past the toast it used to be", async ({
  page,
}) => {
  const projectId = await ready(page);
  const first = sessionId();
  const second = sessionId();
  await page.goto("/");
  const settings = await openGeneral(page);
  const row = controlOf(settings);
  await expect(row).toBeVisible();
  await settled(row);
  const notices = page.getByRole("region", { name: "通知" });

  // The first import lands, and the row has nothing to say about it.
  const landed = page.waitForResponse(isImport);
  await pick(row, traceFile(first, "session-a.jsonl"));
  expect((await landed).status(), "first import").toBe(200);
  await expect(row.getByRole("alert")).toHaveCount(0);
  expect(await importedIds(page.request, projectId)).toContain(first);

  // The same file again: the route refuses it (a Trace may only ever create a Session), and the
  // reason is drawn by the row itself — not by a notification.
  const refused = page.waitForResponse(isImport);
  await pick(row, traceFile(first, "session-a.jsonl"));
  expect((await refused).status(), "duplicate import").toBe(409);
  await expect(row.getByRole("alert")).toHaveText(DUPLICATE_REFUSED);
  await expect(notices.getByRole("button")).toHaveCount(0);
  // Nothing was written: both destination pickers are still there, still enabled, and the Agent
  // one still names the Agent it started on.
  await expect(row.getByRole("button", { name: "导入到项目" })).toBeEnabled();
  await expect(row.getByRole("button", { name: "导入到 Agent" })).toBeEnabled();

  // Six seconds is how long a toast lives; this sentence has to still be there after it.
  await page.waitForTimeout(7_000);
  await expect(row.getByRole("alert")).toHaveText(DUPLICATE_REFUSED);
  await expect(notices.getByRole("button")).toHaveCount(0);

  // The next pick is the retry: another Session's Trace lands, and the sentence goes with the
  // attempt it belonged to.
  const retried = page.waitForResponse(isImport);
  await pick(row, traceFile(second, "session-b.jsonl"));
  expect((await retried).status(), "retry").toBe(200);
  await expect(row.getByRole("alert")).toHaveCount(0);
  const ids = await importedIds(page.request, projectId);
  expect(ids).toContain(first);
  expect(ids).toContain(second);
});

test("a file past the 14MB ceiling is refused in place, without being uploaded", async ({
  page,
}) => {
  const projectId = await ready(page);
  const fresh = sessionId();
  /** Every upload the row attempted: a refused-before-reading file must not add one. */
  const uploads = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/traces/import")) uploads.push(req.url());
  });

  await page.goto("/");
  const settings = await openGeneral(page);
  const row = controlOf(settings);
  await expect(row).toBeVisible();
  await settled(row);

  // One byte past the Trace file's ceiling — a file this large is never read into the browser.
  // (A whole-Session bundle answers to the server's larger 48MB ceiling instead; which of the two
  // applies to a name is a rule of the row's own, held by `test/trace-import-row.test.ts`.)
  const big = {
    name: "huge.jsonl",
    mimeType: "application/x-ndjson",
    buffer: Buffer.alloc(14 * 1024 * 1024 + 1, 0x20),
  };
  await pick(row, big);
  await expect(row.getByRole("alert")).toHaveText(TOO_LARGE_REFUSED);
  await expect(page.getByRole("region", { name: "通知" }).getByRole("button")).toHaveCount(0);
  expect(uploads).toHaveLength(0);

  // And a file that is small enough still lands, with the sentence of the last attempt gone.
  const landed = page.waitForResponse(isImport);
  await pick(row, traceFile(fresh, "session-b.jsonl"));
  expect((await landed).status(), "import after a refused file").toBe(200);
  await expect(row.getByRole("alert")).toHaveCount(0);
  expect(uploads).toHaveLength(1);
  expect(await importedIds(page.request, projectId)).toContain(fresh);
});
