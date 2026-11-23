/**
 * The notice store behind the account menu's badge (state/notifications.tsx): the inbox a read
 * leaves, and what a live event does to it.
 *
 * - A live event puts the notice at the head and counts it unread; a second event for the same id
 *   changes nothing (a re-delivery, or a notice the mount read already returned, must not count
 *   twice).
 * - A read replaces the whole inbox and its unread count with the server's answer — the store never
 *   recomputes the rule "which rows does this account see" for itself.
 * - A failed read keeps the list standing and records the reason; a sign-out resets everything so
 *   the badge cannot carry one account's count into the next.
 *
 * The endpoints are mocked: this suite is about the store's own rules, and the http wrappers are
 * the same one-line calls every other API goes through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationInfo, NotificationsResponse } from "@adelie/server/api";
import * as api from "../src/api/endpoints";
import {
  isNotificationEvent,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsSnapshot,
  publishNotificationEvent,
  refreshNotifications,
  resetNotifications,
  subscribeNotifications,
} from "../src/state/notifications";

vi.mock("../src/api/endpoints", () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

function notice(over: Partial<NotificationInfo> & { id: number }): NotificationInfo {
  return {
    scope: "global",
    title: `Notice ${over.id}`,
    body: "body",
    sentBy: "admin",
    sentAt: "2026-11-23T00:00:00Z",
    ...over,
  };
}

const listNotifications = vi.mocked(api.listNotifications);
const markRead = vi.mocked(api.markNotificationRead);
const markAllRead = vi.mocked(api.markAllNotificationsRead);

beforeEach(() => {
  resetNotifications();
  vi.clearAllMocks();
});

afterEach(() => {
  resetNotifications();
});

describe("the badge and the list", () => {
  it("starts empty and unread, with nothing loaded yet", () => {
    expect(notificationsSnapshot()).toEqual({
      notifications: [],
      unread: 0,
      loaded: false,
      error: null,
    });
  });

  it("puts a live notice at the head and counts it unread", () => {
    publishNotificationEvent(notice({ id: 2 }));
    publishNotificationEvent(notice({ id: 1 }));

    const snap = notificationsSnapshot();
    expect(snap.notifications.map((n) => n.id)).toEqual([1, 2]);
    expect(snap.unread).toBe(2);
  });

  it("ignores a second event for a notice already in the list", () => {
    publishNotificationEvent(notice({ id: 7 }));
    publishNotificationEvent(notice({ id: 7 }));

    expect(notificationsSnapshot().notifications.map((n) => n.id)).toEqual([7]);
    expect(notificationsSnapshot().unread).toBe(1);
  });

  it("tells its subscribers on every change, and stops when unsubscribed", () => {
    let seen = 0;
    const stop = subscribeNotifications(() => {
      seen += 1;
    });
    publishNotificationEvent(notice({ id: 1 }));
    expect(seen).toBe(1);
    stop();
    publishNotificationEvent(notice({ id: 2 }));
    expect(seen).toBe(1);
  });
});

describe("reading the inbox", () => {
  it("adopts the server's whole answer, unread count included", async () => {
    listNotifications.mockResolvedValue({
      notifications: [notice({ id: 3, readAt: "2026-11-23T01:00:00Z" }), notice({ id: 2 })],
      unread: 1,
    });

    await refreshNotifications();

    expect(notificationsSnapshot()).toEqual({
      notifications: [notice({ id: 3, readAt: "2026-11-23T01:00:00Z" }), notice({ id: 2 })],
      unread: 1,
      loaded: true,
      error: null,
    });
  });

  it("keeps the list standing when a read fails, and records why", async () => {
    publishNotificationEvent(notice({ id: 5 }));
    listNotifications.mockRejectedValue(new Error("boom"));

    await refreshNotifications();

    const snap = notificationsSnapshot();
    expect(snap.notifications.map((n) => n.id)).toEqual([5]);
    expect(snap.unread).toBe(1);
    expect(snap.loaded).toBe(true);
    expect(snap.error).not.toBeNull();
  });

  it("keeps a notice that arrived while the read was in flight, and counts it unread", async () => {
    // The answer was read off the server before the notice existed, so it cannot be the later
    // word about it: letting it through would drop the badge a reader is meant to see.
    let answer: ((res: NotificationsResponse) => void) | undefined;
    listNotifications.mockImplementation(
      () =>
        new Promise<NotificationsResponse>((resolve) => {
          answer = resolve;
        }),
    );

    const pending = refreshNotifications();
    publishNotificationEvent(notice({ id: 4 }));
    answer?.({ notifications: [], unread: 0 });
    await pending;

    expect(notificationsSnapshot().notifications.map((n) => n.id)).toEqual([4]);
    expect(notificationsSnapshot().unread).toBe(1);
  });

  it("does not count that notice twice when the answer carries it too", async () => {
    let answer: ((res: NotificationsResponse) => void) | undefined;
    listNotifications.mockImplementation(
      () =>
        new Promise<NotificationsResponse>((resolve) => {
          answer = resolve;
        }),
    );

    const pending = refreshNotifications();
    publishNotificationEvent(notice({ id: 4 }));
    answer?.({ notifications: [notice({ id: 4 })], unread: 1 });
    await pending;

    expect(notificationsSnapshot().notifications.map((n) => n.id)).toEqual([4]);
    expect(notificationsSnapshot().unread).toBe(1);
  });

  it("marking one read takes the server's answer as the new state", async () => {
    publishNotificationEvent(notice({ id: 9 }));
    markRead.mockResolvedValue({ notifications: [notice({ id: 9, readAt: "now" })], unread: 0 });

    await markNotificationRead(9);

    expect(markRead).toHaveBeenCalledWith(9);
    expect(notificationsSnapshot().unread).toBe(0);
    expect(notificationsSnapshot().notifications[0]?.readAt).toBe("now");
  });

  it("marking all read takes the server's answer as the new state", async () => {
    publishNotificationEvent(notice({ id: 9 }));
    markAllRead.mockResolvedValue({ notifications: [notice({ id: 9, readAt: "now" })], unread: 0 });

    await markAllNotificationsRead();

    expect(markAllRead).toHaveBeenCalled();
    expect(notificationsSnapshot().unread).toBe(0);
  });

  it("a failed mark keeps the list and records the reason", async () => {
    publishNotificationEvent(notice({ id: 9 }));
    markRead.mockRejectedValue(new Error("boom"));

    await markNotificationRead(9);

    expect(notificationsSnapshot().notifications.map((n) => n.id)).toEqual([9]);
    expect(notificationsSnapshot().unread).toBe(1);
    expect(notificationsSnapshot().error).not.toBeNull();
  });

  it("resets on sign-out, so no count carries across accounts", () => {
    publishNotificationEvent(notice({ id: 1 }));
    resetNotifications();
    expect(notificationsSnapshot()).toEqual({
      notifications: [],
      unread: 0,
      loaded: false,
      error: null,
    });
  });
});

describe("the event guard", () => {
  it("recognizes only the notification variant of the user-channel events", () => {
    expect(isNotificationEvent({ type: "notification", notification: notice({ id: 1 }) })).toBe(
      true,
    );
    expect(isNotificationEvent({ type: "web_updated" } as never)).toBe(false);
  });
});
