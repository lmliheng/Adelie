/**
 * The account menu's inbox: the notices an admin sent this account (the global ones and the ones
 * addressed to it), newest first, with a per-row "mark read" and a header "mark all read".
 *
 * The list is the notification store's (`state/notifications.tsx`), not this dialog's own copy —
 * the menu row's badge reads the same store, so marking a notice read here moves the badge too,
 * and a notice that arrives while the dialog is open appears in it without a reload. Opening
 * re-reads the inbox, the same way the run log beside it does, because the count moves while the
 * dialog is closed and the badge is only as fresh as the last event that reached this window.
 */
import { useEffect } from "react";
import type { NotificationInfo } from "@adelie/server/api";
import { Badge, Button, Modal, SettingsEmpty, SkeletonList } from "@adelie/ui";
import { formatDateTime } from "../../lib/format";
import { S } from "../../lib/strings";
import {
  markAllNotificationsRead,
  markNotificationRead,
  refreshNotifications,
} from "../../state/notifications";
import type { NotificationsState } from "../../state/notifications";

export function NotificationsDialog({
  open,
  onClose,
  state,
}: {
  open: boolean;
  onClose: () => void;
  /** The notification store's snapshot, read once by the menu and handed down (one list, two surfaces). */
  state: NotificationsState;
}) {
  const { notifications, unread, loaded, error } = state;

  // Every open re-reads: a notice that arrived while the dialog was shut is already in the store
  // from the channel, but a re-read also catches what the channel could not deliver.
  useEffect(() => {
    if (open) void refreshNotifications();
  }, [open]);

  return (
    <Modal
      open={open}
      title={S.account.notifications.title}
      onClose={onClose}
      widthClass="sm:max-w-2xl"
      footer={
        <>
          <Button
            size="sm"
            variant="secondary"
            disabled={unread === 0}
            onClick={() => void markAllNotificationsRead()}
          >
            {S.account.notifications.markAllRead}
          </Button>
          <Button size="sm" onClick={onClose}>
            {S.common.close}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">{S.account.notifications.desc}</p>

        {error !== null && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {S.account.notifications.loadFailed(error)}
          </p>
        )}

        {!loaded && <SkeletonList rows={3} />}

        {loaded && notifications.length === 0 && (
          <SettingsEmpty>{S.account.notifications.empty}</SettingsEmpty>
        )}

        {notifications.length > 0 && (
          <ul className="space-y-2">
            {notifications.map((notice) => (
              <NoticeRow key={notice.id} notice={notice} />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/** One notice: its title and when it was sent, its body, and — while unread — the way to mark it. */
function NoticeRow({ notice }: { notice: NotificationInfo }) {
  const unread = notice.readAt === undefined;
  return (
    <li className="rounded-lg border border-line px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* A filled dot while unread, an empty slot once read: the row's own marker, so a reader
              scanning the list does not have to compare timestamps to see what is new. */}
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-full ${unread ? "bg-accent" : "bg-transparent"}`}
          />
          <span className="truncate text-sm font-medium">{notice.title}</span>
          <Badge size="sm">
            {notice.scope === "global"
              ? S.account.notifications.global
              : S.account.notifications.direct}
          </Badge>
        </div>
        <span className="shrink-0 text-xs text-fg-subtle">{formatDateTime(notice.sentAt)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg-muted">{notice.body}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="truncate text-xs text-fg-subtle">
          {S.account.notifications.from(notice.sentBy)}
        </span>
        {unread && (
          <Button size="sm" variant="ghost" onClick={() => void markNotificationRead(notice.id)}>
            {S.account.notifications.markRead}
          </Button>
        )}
      </div>
    </li>
  );
}
