/**
 * The notice mechanisms: what a node may require, declared apart from what implements it.
 */
import { Interface } from "@adelie/core/kernel";
import type {
  AdminNotificationInfo,
  AdminNotificationsResponse,
  NotificationsResponse,
  NotificationScope,
} from "../api/types.js";
import type {
  InboxNotificationRow,
  NotificationRow,
  SentNotificationRow,
} from "../db/repos/notifications.js";

/** NotificationStore: the mechanism NotificationsRepo implements (the two tables, nothing else). */
@Interface()
export abstract class NotificationStore {
  abstract insert(row: Omit<NotificationRow, "id">): NotificationRow;
  /** The notices this account may read, newest first, each with its own read mark. */
  abstract visibleFor(userId: string): InboxNotificationRow[];
  abstract unreadCount(userId: string): number;
  /** Answers false when there is no such notice for this account (unknown id, or somebody else's). */
  abstract markRead(userId: string, id: number, at: string): boolean;
  /** Marks every unread notice read; answers how many rows that was. */
  abstract markAllRead(userId: string, at: string): number;
  abstract sent(): SentNotificationRow[];
  abstract remove(id: number): boolean;
}

/** Notifications: the mechanism NotificationService implements (the store, plus delivery). */
@Interface()
export abstract class Notifications {
  /**
   * Stores one notice and tells whoever is listening. The store is the truth and the delivery is
   * best-effort, the same split the Project events use: a recipient with no open user channel
   * (`GET /api/events`) learns about it from their next inbox read.
   */
  abstract send(input: {
    scope: NotificationScope;
    /** Required for `user`, absent for `global`. */
    userId?: string;
    title: string;
    body: string;
    /** The admin account sending it. */
    sentBy: string;
  }): AdminNotificationInfo;
  abstract inbox(userId: string): NotificationsResponse;
  abstract markRead(userId: string, id: number): boolean;
  abstract markAllRead(userId: string): number;
  abstract sent(): AdminNotificationsResponse;
  abstract remove(id: number): boolean;
}
