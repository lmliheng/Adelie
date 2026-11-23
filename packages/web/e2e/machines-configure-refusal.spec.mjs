/**
 * Regression: the gear on a machine card opens that host's ssh record, and a read the server
 * refused keeps its reason on the card that asked instead of in a toast that dismisses itself.
 *
 * The failure used to arrive as a notification only (`configure`'s `catch` called `toastError`):
 * the card was exactly as it had been before the press, the gear was still there to press
 * again, and six seconds later nothing on screen said what had happened. The card now carries
 * the sentence — under its own two lines, above the details — so folding the card does not take
 * it away either, and the retry is the same gear.
 *
 * The fleet is stubbed: a development data root ships no remote host in its ssh config, and no
 * ssh round trip can be asked of a test box. Everything else is real — the server that serves
 * the page is, and so is the page's own request to it, which this test measures.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_ID, ADMIN_PASSWORD, login } from "./auth.mjs";

const ALIAS = "probe-gpu";

/** What the refused read answers: the server's own words prove the sentence came back. */
const REFUSAL = {
  code: "ssh_host_read_failed",
  message: "the ssh config could not be read",
};

/** One machine installed for this Project, as the page needs it to draw a card. */
const MACHINE = {
  id: `ssh:${ALIAS}`,
  alias: ALIAS,
  installed: { version: "0.7.0", at: "2026-11-20T03:00:00.000Z" },
  machineId: "abcdefghijklmnop",
  local: false,
  connection: null,
  api: null,
  status: { state: "running", checkedAt: "2026-11-23T03:00:00.000Z", port: 4000 },
  root: "/root/.adelie",
};

const fleet = () => ({
  machines: [MACHINE],
  imageVersion: null,
  job: null,
  jobs: [],
});

const notifications = (page) => page.getByRole("region", { name: "通知" });

const answer = (route, body) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

/**
 * The list the page reads, and the probe it sends while a machine is installed (`probeRefused`
 * is flipped by the retry half, which is the second request to `/machines/ssh-hosts/…`).
 */
async function stubFleet(page, state) {
  const list = async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await answer(route, fleet());
  };
  await page.route("**/api/projects/*/machines", list);
  await page.route("**/api/projects/*/machines/probe", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await answer(route, fleet());
  });
  await page.route(`**/api/projects/*/machines/ssh-hosts/${ALIAS}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    state.reads.push(new URL(route.request().url()).pathname);
    if (state.refuse) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: REFUSAL }),
      });
      return;
    }
    await answer(route, {
      alias: ALIAS,
      hostName: "10.0.0.9",
      user: "root",
      port: 22,
      written: true,
    });
  });
}

test("a refused configure keeps the reason on the card, and folding does not hide it", async ({
  page,
}) => {
  await login(page.request, ADMIN_ID, ADMIN_PASSWORD);
  const state = { reads: [], refuse: true };
  await stubFleet(page, state);

  await page.goto("/machines");
  const card = page.locator("li").filter({ hasText: ALIAS });
  await expect(card).toBeVisible();

  // The gear lives in the unfolded details; the details' own line is the card's two lines.
  await card.getByRole("button", { name: `详情: ${ALIAS}`, exact: true }).click();
  await card.getByRole("button", { name: "配置", exact: true }).click();

  // The reason is on the card that asked, and it is not a toast: the notification region holds
  // no dismissible button, and the card reads as it did plus that one line.
  const alert = card.getByRole("alert");
  await expect(alert).toHaveText(`操作被拒绝：${REFUSAL.message}`);
  await expect(notifications(page).getByRole("button")).toHaveCount(0);
  expect(state.reads).toHaveLength(1);
  expect(state.reads[0].endsWith(`/machines/ssh-hosts/${ALIAS}`)).toBe(true);

  // Nothing was opened: the gear is still there to press again.
  await expect(card.getByRole("button", { name: "配置", exact: true })).toBeVisible();

  // Folding the card does not take the sentence with it — it sits above the details.
  await card.getByRole("button", { name: `详情: ${ALIAS}`, exact: true }).click();
  await expect(alert).toBeVisible();

  // Longer than a toast's six seconds: the sentence is a state of the card, not a timer.
  await page.waitForTimeout(6_500);
  await expect(alert).toBeVisible();

  // The retry is the same gear, on the same card; this time the read lands and the card opens
  // the form it asked for, with the refusal gone.
  await card.getByRole("button", { name: `详情: ${ALIAS}`, exact: true }).click();
  state.refuse = false;
  await card.getByRole("button", { name: "配置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "配置 ssh 主机" });
  await expect(dialog).toBeVisible();
  await expect(alert).toHaveCount(0);
  expect(state.reads).toHaveLength(2);
});
