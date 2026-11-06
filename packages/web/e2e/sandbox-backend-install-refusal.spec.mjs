/**
 * Regression: when a run of the sandbox backends the Sandbox card offers does not leave the
 * machine with one, the prompt that asked stays open and says why under its own question — and
 * its Install button retries only what is still missing.
 *
 * The prompt asks one question the moment the card's switch is turned on over a machine that
 * reports no backend for its OS. A run can end short: a package the server listed but the process
 * could not load, or a request that never got an answer (the packages after it are not tried).
 * The dialog used to close on the request anyway, and the only account of it was a toast that
 * dismissed itself after six seconds — over a card still reading "no backend for this OS".
 *
 * Both halves are stubbed where the page's contract with the server is (`page.route`): the
 * configuration it reads (one group with a switch and a backend report) and the install it sends
 * (the deployment list read for the machine id, then each install). `state.refuse` picks the
 * shape of the refusal, and turning it off is the retry.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const BASE = process.env.BASE_URL;
const MOCK = process.env.MOCK_URL;

const BW = "@adelie/sandbox-bwrap";
const DSH = "@adelie/sandbox-dsh";

/** One group with a switch, a field behind it and the backend report that offers an install. */
const ENTRY = {
  name: "sandbox",
  configuration: {
    title: "Sandbox",
    titleZh: "沙盒",
    switch: "enabled",
    properties: {
      enabled: { type: "boolean", title: "Enable sandbox", titleZh: "启用沙盒" },
      maskPaths: { type: "string", title: "Mask paths", titleZh: "掩码路径" },
    },
  },
  values: {},
  backend: { installed: false, recommended: [BW] },
};

/** What the page says when the request never answered, then what is left to install. */
const NEVER_ANSWERED = `安装请求失败：服务器内部错误，请稍后重试。还没装上：${BW}。可以再点一次「安装」。`;

/** Sign in as the seeded administrator and give the Project a model (the onboarding overlay). */
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
}

/** The settings dialog, opened the way a person opens it: the user menu, then a page. */
async function openSettings(page, section) {
  // The user menu shares its name with the Project switcher, so take the last match (as chat.spec).
  await page.getByRole("button", { name: ADMIN_ID }).last().click();
  await page.getByRole("menuitem", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: section, exact: true }).click();
  return settings;
}

/** The toast stack by its own hook rather than by role: the modal marks the page aria-hidden. */
function toasts(page) {
  return page.locator('section[aria-label="通知"] button');
}

/** One row of the deployment list; `error` is what the page reads as a package that would not load. */
function listed(specifier, error) {
  return {
    specifier,
    active: error === undefined,
    builtin: true,
    modules: [],
    replaces: [],
    everywhere: true,
    machines: [],
    here: true,
    ...(error === undefined ? {} : { error }),
  };
}

function deployment(plugins) {
  return {
    plugins,
    shipped: [BW, DSH],
    file: ".project_config.toml",
    machineId: "probe-machine",
    restartPending: false,
  };
}

/**
 * Serve the configuration from the fixture and answer each install through `state.answer(pkg,
 * n)`, which returns the response body or a status to refuse with. `state.posts` records what was
 * sent, package by package, in order.
 */
async function stub(page, state) {
  const answer = (route, body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/admin/plugin-config", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return answer(route, { plugins: [state.entry] });
  });
  await page.route("**/api/projects/*/plugins/installed*", async (route) => {
    if (route.request().method() === "GET") return answer(route, deployment(state.plugins));
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    state.posts.push(body);
    const answerOf = state.answer(body.specifier, state.posts.length - 1);
    if (answerOf !== undefined) return answer(route, deployment(answerOf));
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: "Internal server error" } }),
    });
  });
}

/** Turn the card's switch on, which is what asks the question under test. */
async function ask(page, settings) {
  const card = settings.locator('[data-plugin-config="sandbox"]');
  await expect(card).toBeVisible();
  await card.getByRole("switch", { name: "启用沙盒" }).click();
  const prompt = page.getByRole("dialog", { name: "安装沙盒后端" });
  await expect(prompt).toBeVisible();
  return prompt;
}

test("a request that never answered keeps the prompt open with the reason and the retry", async ({
  page,
}) => {
  await ready(page);
  const state = {
    entry: ENTRY,
    plugins: [],
    posts: [],
    answer: () => undefined,
  };
  await stub(page, state);

  await page.goto("/");
  const settings = await openSettings(page, "插件");
  const prompt = await ask(page, settings);
  await expect(prompt.getByRole("alert")).toHaveCount(0);

  await prompt.getByRole("button", { name: "安装", exact: true }).click();

  // The dialog closes on the answer, not on the request: nothing installed, so it stays — with the
  // reason under its question, naming the package the button retries.
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("alert")).toHaveText(NEVER_ANSWERED);
  expect(state.posts).toEqual([{ specifier: BW, machineId: "probe-machine" }]);
  // The reason is not also a toast: one account of a refusal, next to the button that retries it.
  await expect(toasts(page).filter({ hasText: "服务器内部错误" })).toHaveCount(0);

  // Six seconds is how long a toast lives; this sentence and its button have to outlast it.
  await page.waitForTimeout(7_000);
  await expect(prompt.getByRole("alert")).toHaveText(NEVER_ANSWERED);
  await expect(prompt.getByRole("button", { name: "安装", exact: true })).toBeEnabled();

  // Retrying is the same button: the install lands, the prompt closes, and the sentence goes.
  state.answer = () => [listed(BW)];
  await prompt.getByRole("button", { name: "安装", exact: true }).click();
  await expect(prompt).toHaveCount(0);
  expect(state.posts).toEqual([
    { specifier: BW, machineId: "probe-machine" },
    { specifier: BW, machineId: "probe-machine" },
  ]);
  await expect(toasts(page).filter({ hasText: `已安装 ${BW}` })).toHaveCount(1);
});

test("a package that installed but would not load is quoted in the server's own words", async ({
  page,
}) => {
  await ready(page);
  const state = {
    entry: ENTRY,
    plugins: [],
    posts: [],
    answer: () => [listed(BW, "EACCES: permission denied, open '/usr/bin/bwrap'")],
  };
  await stub(page, state);

  await page.goto("/");
  const settings = await openSettings(page, "插件");
  const prompt = await ask(page, settings);
  await prompt.getByRole("button", { name: "安装", exact: true }).click();

  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("alert")).toHaveText(
    `${BW} 加载失败：EACCES: permission denied, open '/usr/bin/bwrap'。还没装上：${BW}。可以再点一次「安装」。`,
  );
  await expect(toasts(page).filter({ hasText: "加载失败" })).toHaveCount(0);
});

test("a run that stopped halfway offers — and retries — only the package still missing", async ({
  page,
}) => {
  await ready(page);
  const state = {
    entry: { ...ENTRY, backend: { installed: false, recommended: [BW, DSH] } },
    plugins: [listed(BW)],
    posts: [],
    // The first package loads; the second request is the one that never answers.
    answer: (pkg) => (pkg === BW ? [listed(BW)] : undefined),
  };
  await stub(page, state);

  await page.goto("/");
  const settings = await openSettings(page, "插件");
  const prompt = await ask(page, settings);
  await expect(prompt).toContainText(BW);
  await expect(prompt).toContainText(DSH);
  await prompt.getByRole("button", { name: "安装", exact: true }).click();

  // Only what is left: the package that landed is not offered — and so not installed — again.
  await expect(prompt.getByRole("alert")).toHaveText(
    `安装请求失败：服务器内部错误，请稍后重试。还没装上：${DSH}。可以再点一次「安装」。`,
  );
  await expect(prompt).toContainText(DSH);
  await expect(prompt).not.toContainText(BW);

  // The retry posts that one package, and nothing else.
  state.answer = () => [listed(BW), listed(DSH)];
  await prompt.getByRole("button", { name: "安装", exact: true }).click();
  await expect(prompt).toHaveCount(0);
  expect(state.posts.map((p) => p.specifier)).toEqual([BW, DSH, DSH]);
});
