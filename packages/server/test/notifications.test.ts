/**
 * Admin notices: an admin writes one (to everybody or to one account), and every account reads
 * its own inbox.
 *
 * What these cases pin is the audience rule and the reader's side of it:
 * - the inbox is the global notices plus its own, and nothing else — neither another account's
 *   single-account notice, nor the sender's own copy of a notice it sent to somebody else;
 * - "unread" is per account (a read mark written by one reader is invisible to the others), so
 *   one global notice can be read by one account and still wait for another;
 * - the audience of a global notice is "whoever is here": an account created afterwards finds it
 *   in its inbox, which is what storing one row rather than fanning it out means;
 * - a read mark cannot be written for a notice the caller cannot see (404, and no row);
 * - delivery on the user channel is a courtesy on top of that durable copy: the notice arrives
 *   with the sender's words and no read mark, to that one account (or to every account), and to
 *   nobody else;
 * - the sender's own list carries what only the sender needs: how many have read each notice,
 *   how many it is addressed to, and the length limits the compose form shows.
 *
 * The permission boundary is the user backend's (non-admin 403, desktop mode refused whole).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AdminNotificationResponse,
  AdminNotificationsResponse,
  ErrorBody,
  NotificationsResponse,
  ServerEvent,
} from "../src/api/types.js";
import { userChannelKey } from "../src/http/routes/events.js";
import { NotificationsRepo } from "../src/db/repos/notifications.js";
import { openDatabase } from "../src/db/database.js";
import { wire } from "@adelie/core/kernel";
import {
  apiClient,
  createDesktopApp,
  createTestApp,
  loginAdmin,
  provisionUser,
} from "./helpers.js";
import type { TestApp } from "./helpers.js";

/** An account that has `GET /api/events` open: what the publish side checks for. */
function inbox(t: TestApp, userId: string): ServerEvent[] {
  const events: ServerEvent[] = [];
  t.deps.channels.get(userChannelKey(userId)).subscribe((evt) => {
    if (evt.event === "server_event") events.push(JSON.parse(evt.data) as ServerEvent);
  });
  return events;
}

const noticesIn = (events: ServerEvent[]) =>
  events.flatMap((e) => (e.type === "notification" ? [e.notification] : []));

const send = async (
  client: ReturnType<typeof apiClient>,
  body: Record<string, unknown>,
): Promise<Response> => client.post("/api/admin/notifications", body);

describe("admin notices", () => {
  let t: TestApp;
  let admin: ReturnType<typeof apiClient>;
  /** The account a single-account notice is addressed to, and one it is not. */
  let kate: ReturnType<typeof apiClient>;
  let dave: ReturnType<typeof apiClient>;

  beforeEach(async () => {
    t = await createTestApp();
    admin = apiClient(t.app, (await loginAdmin(t.app)).cookie);
    kate = apiClient(t.app, (await provisionUser(t.app, "kate")).cookie);
    dave = apiClient(t.app, (await provisionUser(t.app, "dave")).cookie);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  const inboxOf = async (client: ReturnType<typeof apiClient>): Promise<NotificationsResponse> =>
    (await (await client.get("/api/notifications")).json()) as NotificationsResponse;

  it("the sender's side is the admin's alone; the inbox is every account's", async () => {
    for (const client of [kate, dave]) {
      expect((await send(client, { scope: "global", title: "t", body: "b" })).status).toBe(403);
      expect((await client.get("/api/admin/notifications")).status).toBe(403);
      expect((await client.delete("/api/admin/notifications/1")).status).toBe(403);
    }
    // Reading one's own inbox is not an admin operation.
    expect((await kate.get("/api/notifications")).status).toBe(200);
  });

  it("a global notice is in every account's inbox, and an account created later finds it too", async () => {
    const created = (await (
      await send(admin, { scope: "global", title: "服务要重启", body: "今晚 22:00 起十分钟。" })
    ).json()) as AdminNotificationResponse;
    expect(created.notification.scope).toBe("global");
    expect(created.notification.userId).toBeUndefined();
    expect(created.notification.sentBy).toBe("admin");
    expect(created.notification.recipients).toBe(3);
    expect(created.notification.readCount).toBe(0);

    // The sender reads it like everybody else: a global notice is everybody's, its author's too.
    for (const client of [admin, kate, dave]) {
      const box = await inboxOf(client);
      expect(box.unread).toBe(1);
      expect(box.notifications).toHaveLength(1);
      expect(box.notifications[0]!.title).toBe("服务要重启");
      expect(box.notifications[0]!.readAt).toBeUndefined();
    }

    // The audience is "whoever is here": an account made afterwards has it too, because the notice
    // is one stored row and not a copy per account.
    const later = await provisionUser(t.app, "later");
    const box = await inboxOf(apiClient(t.app, later.cookie));
    expect(box.unread).toBe(1);
    expect(box.notifications[0]!.body).toBe("今晚 22:00 起十分钟。");
  });

  it("a single-account notice reaches that account and no other — not even its sender's", async () => {
    const created = (await (
      await send(admin, {
        scope: "user",
        userId: "kate",
        title: "你的额度",
        body: "本月已用 80%。",
      })
    ).json()) as AdminNotificationResponse;
    expect(created.notification.scope).toBe("user");
    expect(created.notification.userId).toBe("kate");
    expect(created.notification.recipients).toBe(1);

    const kateBox = await inboxOf(kate);
    expect(kateBox.notifications.map((n) => n.title)).toEqual(["你的额度"]);
    expect(kateBox.unread).toBe(1);
    // Dave is not the reader it was addressed to, and the admin is not either: a single-account
    // notice is not a copy of something the sender keeps in its own inbox.
    expect((await inboxOf(dave)).notifications).toEqual([]);
    expect((await inboxOf(admin)).notifications).toEqual([]);
    // The sender sees it where it belongs — among what this server has sent.
    const sent = (await (
      await admin.get("/api/admin/notifications")
    ).json()) as AdminNotificationsResponse;
    expect(sent.notifications.map((n) => n.id)).toEqual([created.notification.id]);
  });

  it("unread is per account: one reader's mark leaves the others' badges alone", async () => {
    await send(admin, { scope: "global", title: "公告", body: "第一行。" });
    const before = await inboxOf(kate);
    const id = before.notifications[0]!.id;

    const marked = (await (
      await kate.post(`/api/notifications/${id}/read`)
    ).json()) as NotificationsResponse;
    expect(marked.unread).toBe(0);
    expect(marked.notifications[0]!.readAt).toBeTruthy();
    // Dave's badge is untouched, and the sender's list reports exactly one reader.
    expect((await inboxOf(dave)).unread).toBe(1);
    const sent = (await (
      await admin.get("/api/admin/notifications")
    ).json()) as AdminNotificationsResponse;
    expect(sent.notifications[0]!.readCount).toBe(1);

    // Marking it again is not an error and does not move the stamp the first reader left.
    const again = (await (
      await kate.post(`/api/notifications/${id}/read`)
    ).json()) as NotificationsResponse;
    expect(again.notifications[0]!.readAt).toBe(marked.notifications[0]!.readAt);
  });

  it("a read mark cannot be written for a notice the caller cannot see", async () => {
    const created = (await (
      await send(admin, { scope: "user", userId: "kate", title: "只给 kate", body: "看这里。" })
    ).json()) as AdminNotificationResponse;
    const id = created.notification.id;

    const refused = await dave.post(`/api/notifications/${id}/read`);
    expect(refused.status).toBe(404);
    expect(((await refused.json()) as ErrorBody).error.code).toBe("notification_not_found");
    // A nonexistent id is the same answer, and neither leaves a row behind.
    expect((await dave.post("/api/notifications/9999/read")).status).toBe(404);
    expect(t.deps.db.prepare("SELECT COUNT(*) AS n FROM notification_reads").get()).toEqual({
      n: 0,
    });

    // Which is what keeps the badge honest: dave's count never mentions a notice he cannot read.
    expect((await inboxOf(dave)).unread).toBe(0);
  });

  it("read-all marks every unread notice of the caller only, and answers the inbox", async () => {
    await send(admin, { scope: "global", title: "公告一", body: "一。" });
    await send(admin, { scope: "user", userId: "kate", title: "公告二", body: "二。" });
    await send(admin, { scope: "user", userId: "dave", title: "别人的", body: "三。" });

    const box = (await (
      await kate.post("/api/notifications/read-all")
    ).json()) as NotificationsResponse;
    expect(box.unread).toBe(0);
    expect(box.notifications.map((n) => n.title)).toEqual(["公告二", "公告一"]);
    expect(box.notifications.every((n) => n.readAt !== undefined)).toBe(true);
    // Dave's own notice and the global one are still waiting for Dave.
    expect((await inboxOf(dave)).unread).toBe(2);
  });

  it("the notice arrives on the user channel with what it says, and only where it is addressed", async () => {
    const kateEvents = inbox(t, "kate");
    const daveEvents = inbox(t, "dave");
    const adminEvents = inbox(t, "admin");

    const global = (await (
      await send(admin, { scope: "global", title: "全体", body: "都在。" })
    ).json()) as AdminNotificationResponse;
    const single = (await (
      await send(admin, { scope: "user", userId: "kate", title: "单发", body: "只有你。" })
    ).json()) as AdminNotificationResponse;

    expect(noticesIn(kateEvents).map((n) => n.id)).toEqual([
      global.notification.id,
      single.notification.id,
    ]);
    expect(noticesIn(daveEvents).map((n) => n.id)).toEqual([global.notification.id]);
    // The sender is a reader of the global notice like anybody else, and of nothing else.
    expect(noticesIn(adminEvents).map((n) => n.id)).toEqual([global.notification.id]);

    const arrived = noticesIn(kateEvents)[1]!;
    expect(arrived.title).toBe("单发");
    expect(arrived.userId).toBe("kate");
    expect(arrived.sentBy).toBe("admin");
    // The event is the reader's view: nobody has read it, this window included.
    expect(arrived.readAt).toBeUndefined();
  });

  it("an account with no channel open hears nothing, and finds the notice on its next read", async () => {
    // Nobody subscribes for dave here: delivery is best-effort, the stored notice is the truth.
    await send(admin, { scope: "global", title: "离线也能看到", body: "行。" });
    expect((await inboxOf(dave)).unread).toBe(1);
  });

  it("what a notice may hold is refused before anything is stored", async () => {
    const long = "x".repeat(121);
    const tooLongBody = "x".repeat(2001);
    const cases: [Record<string, unknown>, number, string][] = [
      [{ scope: "everyone", title: "t", body: "b" }, 400, "bad_request"],
      [{ scope: "global", body: "b" }, 400, "bad_request"],
      [{ scope: "global", title: "   ", body: "b" }, 400, "bad_request"],
      [{ scope: "global", title: long, body: "b" }, 400, "bad_request"],
      [{ scope: "global", title: "t" }, 400, "bad_request"],
      [{ scope: "global", title: "t", body: "  " }, 400, "bad_request"],
      [{ scope: "global", title: "t", body: tooLongBody }, 400, "bad_request"],
      [{ scope: "user", title: "t", body: "b" }, 400, "bad_request"],
      // A global notice is addressed to nobody in particular: naming one account is a mistake, not
      // a single-account notice written the other way round.
      [{ scope: "global", userId: "kate", title: "t", body: "b" }, 400, "bad_request"],
      [{ scope: "user", userId: "ghost", title: "t", body: "b" }, 404, "user_not_found"],
    ];
    for (const [body, status, code] of cases) {
      const res = await send(admin, body);
      expect(res.status, JSON.stringify(body)).toBe(status);
      expect(((await res.json()) as ErrorBody).error.code, JSON.stringify(body)).toBe(code);
    }
    expect(t.deps.db.prepare("SELECT COUNT(*) AS n FROM notifications").get()).toEqual({ n: 0 });

    // The body's limit is what the sender is told the notice holds; at the limit it goes through.
    const atLimit = (await (
      await send(admin, { scope: "global", title: "x".repeat(120), body: "x".repeat(2000) })
    ).json()) as AdminNotificationResponse;
    expect(atLimit.notification.title).toHaveLength(120);
  });

  it("the sent list carries the read counts and the limits the compose form shows", async () => {
    await send(admin, { scope: "global", title: "一", body: "一。" });
    await send(admin, { scope: "user", userId: "kate", title: "二", body: "二。" });
    const list = (await (
      await admin.get("/api/admin/notifications")
    ).json()) as AdminNotificationsResponse;
    // Newest first, and each row says who it went to and how many have read it.
    expect(list.notifications.map((n) => n.title)).toEqual(["二", "一"]);
    expect(list.notifications.map((n) => n.recipients)).toEqual([1, 3]);
    expect(list.notifications.map((n) => n.readCount)).toEqual([0, 0]);
    expect(list.limits).toEqual({ title: 120, body: 2000 });

    // Reading one moves that notice's reader figure only.
    const globalId = list.notifications[1]!.id;
    await kate.post(`/api/notifications/${globalId}/read`);
    const again = (await (
      await admin.get("/api/admin/notifications")
    ).json()) as AdminNotificationsResponse;
    expect(again.notifications.map((n) => n.readCount)).toEqual([0, 1]);
  });

  it("deleting withdraws a notice from every inbox and takes its read marks with it", async () => {
    const created = (await (
      await send(admin, { scope: "global", title: "撤回我", body: "行。" })
    ).json()) as AdminNotificationResponse;
    const id = created.notification.id;
    await kate.post(`/api/notifications/${id}/read`);
    expect((await inboxOf(dave)).unread).toBe(1);

    expect((await admin.delete(`/api/admin/notifications/${id}`)).status).toBe(204);
    expect((await inboxOf(kate)).notifications).toEqual([]);
    expect((await inboxOf(dave)).notifications).toEqual([]);
    expect(t.deps.db.prepare("SELECT COUNT(*) AS n FROM notification_reads").get()).toEqual({
      n: 0,
    });
    // Deleting it again is a 404, like any other id that is not there.
    expect((await admin.delete(`/api/admin/notifications/${id}`)).status).toBe(404);
  });

  it("deleting an account takes what was addressed to it, and leaves the global notices alone", async () => {
    await send(admin, { scope: "global", title: "人人有份", body: "行。" });
    const addressed = (await (
      await send(admin, { scope: "user", userId: "kate", title: "只给 kate", body: "行。" })
    ).json()) as AdminNotificationResponse;
    await kate.post(`/api/notifications/read-all`);

    expect((await admin.delete("/api/admin/users/kate")).status).toBe(204);
    const titles = t.deps.db.prepare("SELECT title FROM notifications ORDER BY id").all() as {
      title: string;
    }[];
    expect(titles.map((r) => r.title)).toEqual(["人人有份"]);
    expect(addressed.notification.id).toBeGreaterThan(0);
    // Her read marks went with her, so Dave's badge still counts the global one.
    expect((await inboxOf(dave)).unread).toBe(1);
  });

  it("the table is capped: the oldest notices go first, and their read marks with them", () => {
    // The cap's own test, at the repo: the real one is 500 rows with a check every twentieth
    // insert, which is the same mechanism with numbers a case can reach.
    const db = openDatabase(":memory:");
    try {
      // The read marks hang off an account (foreign key), so the reader row has to exist.
      db.prepare(
        "INSERT INTO users (user_id, password_hash, is_admin, password_is_initial, created_at)" +
          " VALUES ('kate', 'x', 0, 0, '2026-01-01T00:00:00.000Z')",
      ).run();
      const capped = wire(NotificationsRepo, { db, maxRows: 5, pruneEvery: 2 });
      const insert = (n: number): number =>
        capped.insert({
          scope: "global",
          userId: null,
          title: `第 ${n} 条`,
          body: "行。",
          sentBy: "admin",
          sentAt: `2026-01-01T00:00:${String(n).padStart(2, "0")}.000Z`,
        }).id;
      const oldest = insert(0);
      capped.markRead("kate", oldest, "2026-01-01T00:01:00.000Z");
      for (let n = 1; n <= 11; n++) insert(n);

      // The five newest survive, in order; the oldest — and the read mark hanging off it — is gone.
      expect(capped.sent().map((r) => r.title)).toEqual([
        "第 11 条",
        "第 10 条",
        "第 9 条",
        "第 8 条",
        "第 7 条",
      ]);
      expect(db.prepare("SELECT COUNT(*) AS n FROM notification_reads").get()).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });

  it("desktop mode refuses the sender's side whole (single-user: there is nobody to notify)", async () => {
    const desktop = await createDesktopApp();
    try {
      const { cookie } = await loginAdmin(desktop.app);
      const res = await desktop.app.request("/api/admin/notifications", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ scope: "global", title: "t", body: "b" }),
      });
      expect(res.status).toBe(403);
      expect(((await res.json()) as ErrorBody).error.code).toBe("desktop_single_user");
    } finally {
      await desktop.cleanup();
    }
  });
});
