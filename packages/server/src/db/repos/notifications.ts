/**
 * notifications / notification_reads repos: pure SQL wrapper, no business rules.
 *
 * Two tables, and the second one is the reader's side of the first: a notice is one row, and a
 * read mark is one row per (notice, account) that has opened it, so "unread" is the ABSENCE of a
 * row rather than a column — which is what lets one global notice mean "everybody" without
 * writing anything per account at send time, and what makes a new account see every notice that
 * is still stored (the audience of a global notice is "whoever is here", not a list frozen when
 * it was sent).
 *
 * The table is capped (MAX_ROWS, oldest first, read marks cascading with their notice): an
 * admin's notices are read once and then scrolled past, and nothing else prunes them — without
 * this the table is the one thing in the database that only ever grows.
 */
import { Component, Use } from "@adelie/core/kernel";
import type { Db } from "../../hmr/capabilities.js";
import type { NotificationScope } from "../../api/types.js";
import type { NotificationStore } from "../../mechanisms/notifications.js";

/** One notice as the table holds it. */
export interface NotificationRow {
  id: number;
  scope: NotificationScope;
  /** The single account a `user` notice is addressed to; null for a `global` one. */
  userId: string | null;
  title: string;
  body: string;
  /** The admin account that sent it. */
  sentBy: string;
  sentAt: string;
}

/** A notice as one reader's inbox holds it: the row, plus that reader's mark on it. */
export interface InboxNotificationRow extends NotificationRow {
  /** When THIS reader read it; null = unread. */
  readAt: string | null;
}

/** A notice as its sender sees it: the row, plus how many accounts have read it so far. */
export interface SentNotificationRow extends NotificationRow {
  readCount: number;
}

/** What the table holds at most; the oldest notices (and their read marks) go first beyond it. */
export const MAX_NOTIFICATION_ROWS = 500;
/** Inserts between two capacity checks (see the file header: a COUNT on every insert is waste). */
export const PRUNE_EVERY = 20;

function mapRow(r: Record<string, unknown>): NotificationRow {
  return {
    id: r.id as number,
    scope: r.scope as NotificationScope,
    userId: (r.user_id as string | null) ?? null,
    title: r.title as string,
    body: r.body as string,
    sentBy: r.created_by as string,
    sentAt: r.created_at as string,
  };
}

@Component()
export class NotificationsRepo implements NotificationStore {
  /** Both are instance fields, not the constants: the cap's own test sets them small. */
  private readonly maxRows: number = MAX_NOTIFICATION_ROWS;
  private readonly pruneEvery: number = PRUNE_EVERY;
  /** Insert count since the last capacity check (see the file header: no COUNT on every call). */
  private sinceCheck = 0;

  @Use() private readonly db!: Db;

  insert(row: Omit<NotificationRow, "id">): NotificationRow {
    const res = this.db
      .prepare(
        "INSERT INTO notifications (scope, user_id, title, body, created_by, created_at)" +
          " VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(row.scope, row.userId, row.title, row.body, row.sentBy, row.sentAt);
    const inserted = { ...row, id: Number(res.lastInsertRowid) };
    if (++this.sinceCheck >= this.pruneEvery) {
      this.sinceCheck = 0;
      this.pruneOverflow();
    }
    return inserted;
  }

  /**
   * The notices this account can read — the global ones and its own — newest first, each with
   * that account's read mark. ONE ordering for the list and the count below (sentAt then id):
   * the count is what the badge shows and the list is what opening it shows, and two orderings
   * would let the two disagree about which of a same-second pair came last.
   */
  visibleFor(userId: string): InboxNotificationRow[] {
    const rows = this.db
      .prepare(
        `SELECT n.id, n.scope, n.user_id, n.title, n.body, n.created_by, n.created_at, r.read_at
           FROM notifications n
           LEFT JOIN notification_reads r
             ON r.notification_id = n.id AND r.user_id = :userId
          WHERE n.scope = 'global' OR n.user_id = :userId
          ORDER BY n.created_at DESC, n.id DESC`,
      )
      .all({ userId }) as Record<string, unknown>[];
    return rows.map((r) => ({ ...mapRow(r), readAt: (r.read_at as string | null) ?? null }));
  }

  /** How many of the above are unread — the same audience and ordering, counted instead of read. */
  unreadCount(userId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n
           FROM notifications n
           LEFT JOIN notification_reads r
             ON r.notification_id = n.id AND r.user_id = :userId
          WHERE (n.scope = 'global' OR n.user_id = :userId) AND r.notification_id IS NULL`,
      )
      .get({ userId })!;
    return row.n as number;
  }

  /**
   * Marks one notice read for one account, and answers whether there was one for it to mark:
   * an id that does not exist, or a single-account notice addressed to somebody else, is a
   * refusal the caller has to be able to tell apart from "done" — writing a read mark for a
   * notice the caller cannot see would leak the id's existence through the badge.
   */
  markRead(userId: string, id: number, at: string): boolean {
    const visible = this.db
      .prepare(
        "SELECT 1 FROM notifications WHERE id = :id AND (scope = 'global' OR user_id = :userId)",
      )
      .get({ id, userId });
    if (visible === undefined) return false;
    this.db
      .prepare(
        `INSERT INTO notification_reads (notification_id, user_id, read_at) VALUES (?, ?, ?)
         ON CONFLICT(notification_id, user_id) DO NOTHING`,
      )
      .run(id, userId, at);
    return true;
  }

  /** Marks every unread notice of this account read; answers how many rows that was. */
  markAllRead(userId: string, at: string): number {
    const res = this.db
      .prepare(
        `INSERT INTO notification_reads (notification_id, user_id, read_at)
         SELECT n.id, :userId, :at
           FROM notifications n
           LEFT JOIN notification_reads r
             ON r.notification_id = n.id AND r.user_id = :userId
          WHERE (n.scope = 'global' OR n.user_id = :userId) AND r.notification_id IS NULL
         ON CONFLICT(notification_id, user_id) DO NOTHING`,
      )
      .run({ userId, at });
    return Number(res.changes);
  }

  /** Every notice this server holds, newest first, with how many accounts have read each. */
  sent(): SentNotificationRow[] {
    const rows = this.db
      .prepare(
        `SELECT n.id, n.scope, n.user_id, n.title, n.body, n.created_by, n.created_at,
                (SELECT COUNT(*) FROM notification_reads r WHERE r.notification_id = n.id) AS read_count
           FROM notifications n
          ORDER BY n.created_at DESC, n.id DESC`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({ ...mapRow(r), readCount: r.read_count as number }));
  }

  /** Deletes one notice (its read marks cascade); answers whether there was one. */
  remove(id: number): boolean {
    return this.db.prepare("DELETE FROM notifications WHERE id = ?").run(id).changes > 0;
  }

  private pruneOverflow(): void {
    const excess =
      (this.db.prepare("SELECT COUNT(*) AS n FROM notifications").get()!.n as number) -
      this.maxRows;
    if (excess <= 0) return;
    this.db
      .prepare(
        `DELETE FROM notifications WHERE id IN (
           SELECT id FROM notifications ORDER BY created_at ASC, id ASC LIMIT :excess
         )`,
      )
      .run({ excess });
  }
}
