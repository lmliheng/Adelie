/**
 * Notices (admin only): the compose form an admin writes a notice in — to every account, or to one
 * — and the list of the ones already sent, each with how many recipients have read it and a way to
 * withdraw it. Rendered as a page of the Settings dialog, like user management beside it.
 *
 * The length limits come from `GET /api/admin/notifications` (`limits`), never from a copy here, so
 * the form's `maxLength` and the server's refusal can never disagree. A refused send says so in
 * place of the form's action — the sentence stays where the admin pressed — rather than as a
 * floating notice; the list below it is untouched either way.
 *
 * The audience is `global` (every account, including ones created later — the notice is stored, not
 * fanned out) or `user` (the single account the picker names). The picker is fed by the same
 * `GET /api/admin/users` the user page reads, so the ids are the server's own.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  AdminNotificationInfo,
  AdminNotificationsResponse,
  NotificationScope,
  UserInfo,
} from "@adelie/server/api";
import { Badge, Button, Input, Modal, RadioGroup, Select, Textarea } from "@adelie/ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { formatDateTime } from "../../lib/format";
import { useAuth } from "../../state/auth";

export function AdminNotificationsSection() {
  const { user, desktopMode } = useAuth();
  const [data, setData] = useState<AdminNotificationsResponse | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [deleting, setDeleting] = useState<AdminNotificationInfo | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await api.adminListNotifications());
      setListError(null);
    } catch (e) {
      setListError(apiErrorText(e));
    }
  }, []);

  useEffect(() => {
    if (!user?.isAdmin || desktopMode) return;
    void reload();
    // The picker lists the accounts as the server holds them; a failed read leaves it empty rather
    // than blocking the compose form (the global audience needs no account at all).
    void api
      .adminListUsers()
      .then((res) => setUsers(res.users))
      .catch(() => setUsers([]));
  }, [user?.isAdmin, desktopMode, reload]);

  // Registry guard fallback, like the user page: the settings dialog never offers this page to
  // non-admins or in desktop mode (the server refuses the routes there with desktop_single_user).
  if (user && (!user.isAdmin || desktopMode)) return null;

  return (
    <div className="space-y-6">
      <ComposeForm
        {...(data !== null ? { limits: data.limits } : {})}
        users={users}
        onSent={() => void reload()}
      />

      <div>
        <h3 className="mb-2 text-sm font-medium">{S.admin.notices.historyTitle}</h3>
        {listError !== null && (
          <p className="mb-2 text-xs text-red-600 dark:text-red-400">
            {S.admin.notices.loadFailed(listError)}
          </p>
        )}
        {data === null ? (
          <p className="text-sm text-gray-400">{S.common.loading}</p>
        ) : data.notifications.length === 0 ? (
          <p className="text-sm text-gray-400">{S.admin.notices.empty}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
                  <th className="whitespace-nowrap px-3 py-2 font-medium">
                    {S.admin.notices.colTitle}
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">
                    {S.admin.notices.colAudience}
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">
                    {S.admin.notices.colSentAt}
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {S.admin.notices.colRead}
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {S.common.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                {data.notifications.map((notice) => (
                  <tr key={notice.id}>
                    <td className="px-3 py-2 font-medium">
                      <span className="block max-w-[16rem] truncate" data-tooltip={notice.title}>
                        {notice.title}
                      </span>
                      <span className="block max-w-[16rem] truncate text-xs font-normal text-gray-500 dark:text-gray-400">
                        {notice.body}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Badge>
                        {notice.scope === "global"
                          ? S.admin.notices.scopeGlobal
                          : (notice.userId ?? S.admin.notices.scopeUser)}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500 dark:text-gray-400">
                      {formatDateTime(notice.sentAt)}
                    </td>
                    {/* Read count over the recipients as the accounts stand now — the same number the
                        reader's own inbox is counted against. */}
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">
                      {S.admin.notices.readCount(notice.readCount, notice.recipients)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(notice)}>
                        {S.admin.notices.delete}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DeleteNoticeDialog
        notice={deleting}
        onClose={() => setDeleting(null)}
        onDone={() => {
          setDeleting(null);
          void reload();
        }}
      />
    </div>
  );
}

/** The compose form: audience, the account it names, a title and a body, and the send. */
function ComposeForm({
  limits,
  users,
  onSent,
}: {
  /** The server's length bounds; absent until the first read lands. */
  limits?: { title: number; body: number };
  users: UserInfo[];
  onSent: () => void;
}) {
  const [scope, setScope] = useState<NotificationScope>("global");
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  /** What a send was refused for, drawn under the button; the form keeps what was typed. */
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (scope === "user" && target === "") {
      setError(S.admin.notices.targetUser);
      return;
    }
    if (title.trim() === "") {
      setError(S.admin.notices.titleRequired);
      return;
    }
    if (body.trim() === "") {
      setError(S.admin.notices.bodyRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminCreateNotification({
        scope,
        ...(scope === "user" ? { userId: target } : {}),
        title: title.trim(),
        body: body.trim(),
      });
      // Sent: clear the fields so the next notice starts blank, and re-read the history.
      setTitle("");
      setBody("");
      onSent();
    } catch (e) {
      setError(S.admin.notices.sendFailed(apiErrorText(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{S.admin.notices.composeTitle}</h3>
      <div className="space-y-3">
        <RadioGroup<NotificationScope>
          label={S.admin.notices.scopeLabel}
          orientation="horizontal"
          value={scope}
          onChange={(next) => {
            setScope(next);
            setError(null);
          }}
          options={[
            { value: "global", label: S.admin.notices.scopeGlobal },
            { value: "user", label: S.admin.notices.scopeUser },
          ]}
        />

        {/* The account picker only exists for the single-account audience; a global notice is
            addressed to nobody in particular (the server refuses a userId with it). */}
        {scope === "user" && (
          <Select
            label={S.admin.notices.targetUser}
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setError(null);
            }}
          >
            <option value="">{S.admin.notices.targetPlaceholder}</option>
            {users.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.displayName !== undefined ? `${u.userId} (${u.displayName})` : u.userId}
              </option>
            ))}
          </Select>
        )}

        <Input
          label={S.admin.notices.titleLabel}
          value={title}
          maxLength={limits?.title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
        />
        <Textarea
          label={S.admin.notices.bodyLabel}
          rows={5}
          value={body}
          maxLength={limits?.body}
          onChange={(e) => {
            setBody(e.target.value);
            setError(null);
          }}
        />
        {limits !== undefined && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {S.admin.notices.limits(limits.title, limits.body)}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? S.admin.notices.sending : S.admin.notices.send}
          </Button>
          {error !== null && (
            <p role="alert" className="line-clamp-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DeleteNoticeDialog({
  notice,
  onClose,
  onDone,
}: {
  notice: AdminNotificationInfo | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!notice) return;
    setError(null);
  }, [notice]);

  const doDelete = async () => {
    if (!notice) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminDeleteNotification(notice.id);
      onDone();
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={notice !== null}
      title={notice ? S.admin.notices.deleteTitle(notice.title) : ""}
      onClose={onClose}
      footer={
        <>
          <Button size="sm" onClick={onClose} disabled={busy}>
            {S.common.cancel}
          </Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => void doDelete()}>
            {S.admin.notices.delete}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-sm text-red-600 dark:text-red-400">{S.admin.notices.deleteConfirm}</p>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
