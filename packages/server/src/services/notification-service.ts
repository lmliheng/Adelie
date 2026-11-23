/**
 * Admin notices: one row in the store, and a delivery to whoever is listening.
 *
 * The split is the same one the Project events use. The store is the truth — a notice survives a
 * restart, and a reader who was away sees it in their inbox — while the user channel
 * (`GET /api/events`) is the courtesy that makes the badge move without a reload. Delivery is
 * `peek`, never `get`: a channel opened here would be one nobody is listening on, and opening a
 * user channel per notice would leave it behind after the last reader closed the tab.
 *
 * WHO a notice reaches is decided here, once: `global` is every account as the list of accounts
 * stands at this moment (so an account created tomorrow sees it too — the notice is stored, not
 * fanned out into per-account rows), and `user` is that one account. The read marks are the
 * reader's side and are never written by the sender.
 */
import { Component, Use } from "@adelie/core/kernel";
import { HttpError } from "../http/errors.js";
import type {
  AdminNotificationInfo,
  AdminNotificationsResponse,
  NotificationInfo,
  NotificationsResponse,
  NotificationScope,
} from "../api/types.js";
import type {
  InboxNotificationRow,
  NotificationRow,
  SentNotificationRow,
} from "../db/repos/notifications.js";
import type { Channels, Clock } from "../hmr/capabilities.js";
import type { ChannelHub } from "../runtime/channel.js";
import { userChannelKey } from "../http/routes/events.js";
import type { NotificationStore, Notifications } from "../mechanisms/notifications.js";
import type { Users } from "../mechanisms/identity.js";

/**
 * What a notice may hold. The route refuses past these and the compose form shows them
 * (`GET /api/admin/notifications` carries the pair, so the page never keeps its own copy of two
 * numbers that would then be able to drift).
 */
export const NOTIFICATION_TITLE_MAX = 120;
export const NOTIFICATION_BODY_MAX = 2000;

@Component()
export class NotificationService implements Notifications {
  @Use() private readonly store!: NotificationStore;
  @Use() private readonly users!: Users;
  @Use() private readonly channels!: Channels;
  @Use() private readonly clock!: Clock;

  send(input: {
    scope: NotificationScope;
    userId?: string;
    title: string;
    body: string;
    sentBy: string;
  }): AdminNotificationInfo {
    // A single-account notice to an account that does not exist is refused rather than stored: it
    // would be a row nobody can ever read, and the sender would be told it went somewhere.
    if (input.scope === "user" && this.users.findById(input.userId ?? "") === null) {
      throw new HttpError(404, "user_not_found", `User does not exist: ${String(input.userId)}.`);
    }
    const row = this.store.insert({
      scope: input.scope,
      userId: input.scope === "user" ? (input.userId ?? null) : null,
      title: input.title,
      body: input.body,
      sentBy: input.sentBy,
      sentAt: this.clock.now().toISOString(),
    });
    const audience = this.audience(row);
    const notice = inboxView(row);
    for (const userId of audience) {
      (this.channels as ChannelHub)
        .peek(userChannelKey(userId))
        ?.publish({ type: "notification", notification: notice }, "server_event");
    }
    return { ...notice, readCount: 0, recipients: audience.length };
  }

  inbox(userId: string): NotificationsResponse {
    return {
      notifications: this.store.visibleFor(userId).map(inboxView),
      unread: this.store.unreadCount(userId),
    };
  }

  markRead(userId: string, id: number): boolean {
    return this.store.markRead(userId, id, this.clock.now().toISOString());
  }

  markAllRead(userId: string): number {
    return this.store.markAllRead(userId, this.clock.now().toISOString());
  }

  sent(): AdminNotificationsResponse {
    return {
      notifications: this.store.sent().map((row) => ({
        ...this.sentView(row),
        readCount: row.readCount,
        recipients: this.recipientsFor(row),
      })),
      limits: { title: NOTIFICATION_TITLE_MAX, body: NOTIFICATION_BODY_MAX },
    };
  }

  remove(id: number): boolean {
    return this.store.remove(id);
  }

  /** Every account a notice is addressed to, as the accounts stand now. */
  private audience(row: NotificationRow): string[] {
    if (row.scope === "user") return row.userId === null ? [] : [row.userId];
    return this.users.list().map((u) => u.userId);
  }

  /**
   * How many accounts a notice is addressed to NOW — the number the sender's "read 2/5" is read
   * against. The accounts are counted rather than remembered at send time: a notice addressed to
   * everybody is addressed to whoever is here, which is also what the read marks mean.
   */
  private recipientsFor(row: NotificationRow): number {
    return row.scope === "user" ? 1 : this.users.count();
  }

  /** The sender's list of one notice: who it went to, and how many have read it. */
  private sentView(row: SentNotificationRow): AdminNotificationInfo {
    return { ...inboxView(row), readCount: row.readCount, recipients: this.recipientsFor(row) };
  }
}

/**
 * A row as a READER sees it — the one shape both the sender's list and the recipient's inbox are
 * built from, so the two cannot disagree about what a notice says. Absent fields are left out
 * rather than written as null: `readAt` absent is what "unread" means on the wire, and a
 * `userId` on a global notice would name a single reader of one.
 */
function inboxView(row: InboxNotificationRow | NotificationRow): NotificationInfo {
  const readAt = "readAt" in row ? row.readAt : null;
  return {
    id: row.id,
    scope: row.scope,
    ...(row.userId !== null ? { userId: row.userId } : {}),
    title: row.title,
    body: row.body,
    sentBy: row.sentBy,
    sentAt: row.sentAt,
    ...(readAt !== null ? { readAt } : {}),
  };
}
