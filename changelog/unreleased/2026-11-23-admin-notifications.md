# An admin can send a notice, and its readers find it in the account menu

- **Date:** 2026-11-23
- **Type:** feat
- **Scope:** `server`, `web`

[中文](2026-11-23-admin-notifications.zh.md)

An admin can now write a notice — a title and a body — and send it to every account or to one named
account. Each reader finds it behind an unread badge on a "Notifications" row in the account menu at
the bottom left, and marks it read there. Nothing is pushed at a messenger: the notice is stored, so
an account created after it was sent still sees it.

## Two sides, one pair of tables

The sender's list and the reader's inbox are the same two tables (`notifications` and
`notification_reads`), and the audience rule ("every account, or the one named") is written once, in
`services/notification-service.ts`. A reader's route answers with its whole inbox after the change
(both `markRead` and `markAllRead` return the list for that reason), so no client keeps its own copy
of the rule to update a list. `GET /api/admin/notifications` counts a notice's readers and its
recipients as the accounts stand now — a global notice's audience grows when an account is created,
and its read count follows the marks rather than a number frozen at send time.

## Live, on top of the durable copy

When a notice is stored, the service publishes `{type: "notification"}` on each recipient's user
channel (`GET /api/events`) through the same mechanism that carries the other cross-Session events.
That is a courtesy: an account with no channel open, or one that reconnects afterwards, learns the
same fact from `GET /api/notifications`, which is what the badge counts. The browser store keeps
arrivals that land while its first inbox read is still in flight — that read's answer is a baseline,
and anything newer than it the answer does not carry is kept and counted, so a notice that arrives
during that window is not erased by the echo.

## Details

- `packages/server/src/db/schema.ts`, `db/migrations.ts`: two tables and migration 16
  (`admin-notifications`, `swapSafe`). The repo keeps at most 500 notices and prunes the oldest every
  20 inserts.
- `packages/server/src/db/repos/notifications.ts`, `mechanisms/notifications.ts`,
  `services/notification-service.ts`: storage, the user channel's `peek`/publish, and the audience
  rule with the length caps (`NOTIFICATION_TITLE_MAX` 120, `NOTIFICATION_BODY_MAX` 2000 — a blank or
  over-long title or body is refused before anything is stored, never truncated).
- `packages/server/src/http/routes/notifications.ts`: `GET/POST /api/notifications…` for readers and
  `GET/POST/DELETE /api/admin/notifications…` for admins, which refuse desktop mode
  (`desktop_single_user`) and non-admins (`admin_required`) exactly like the user backend beside them.
- `packages/web/src/state/notifications.tsx` (new): the store, `isNotificationEvent` /
  `publishNotificationEvent`, and `useNotifications(userId)` with the baseline merge above.
- `packages/web/src/features/account/notifications-dialog.tsx` (new) and
  `components/layout/user-menu.tsx`: the "Notifications" row with its unread count and the inbox
  dialog, drawn only outside desktop mode.
- `packages/web/src/features/admin/admin-notifications-section.tsx` (new) and
  `lib/settings-sections.ts`: the admin's compose form (everyone / one account, the user list from
  `adminListUsers`, the server's own limits) and the sent list with its read counts and withdraw.
- `packages/docs/content/server-api.{zh,en}.md`: a new "Notifications" section, the `notification`
  event in the `ServerEvent` union and its table row, and the route channel table.

## Tests

- `packages/server/test/notifications.test.ts` (new, 14 cases) and
  `packages/server/test/db-migrations.test.ts` (fixtures for migration 16).
- `packages/web/test/notifications.test.ts` (new, 13 cases), including a notice that arrives while
  the first inbox read is in flight (kept, counted once) and one the answer also carries (not
  double-counted).
- `packages/web/e2e/notifications.spec.mjs` (new, 2 cases, real server + real browser): an admin
  sends a global notice → another account's badge turns 1 with no reload → opening the dialog shows
  it → marking it read clears the badge, and the badge is 1 for a notice that arrives after the
  reader's last inbox read.
- `@adelie/server` and `@adelie/web` `tsc --noEmit`, `oxlint` and `prettier --check` all pass.

## Compatibility

The new migration only adds two tables; the data root, the Trace format and the existing API shapes
are unchanged. In desktop mode the row and the settings page are hidden and the admin routes answer
`desktop_single_user`, as the rest of the admin surface does.
