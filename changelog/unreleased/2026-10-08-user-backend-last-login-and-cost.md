# Admin user backend: every account's last sign-in and lifetime cost

- **Date:** 2026-10-08
- **Type:** feature
- **Scope:** `server`, `web`

[中文版](2026-10-08-user-backend-last-login-and-cost.zh.md)

The user backend's table showed who exists, what role they hold and when the account was created —
nothing about whether it is used, or what it has cost. It now carries two read-only columns, both
figures the server computes:

- **Last sign-in** (`UserInfo.lastLoginAt`, the `users.last_login_at` column): stamped by the one
  path that verifies a password (`AuthService.login`), so an account an admin created and nobody
  ever signed into reads as never used rather than as today. The column is added to an existing
  database by `openDatabase`'s column guard; rows written before it read back as never signed in.
- **Lifetime cost** (`UserInfo.totalCostUsd`): the total of the Projects the account OWNS, every
  usage record ever written in them priced at the current rates — the cost center's cumulative
  figure, summed over the account's Projects. Pricing is per Project, so the sum is taken per
  Project (`UsageQueries.lifetimeCost`, the unfiltered grouped scan `modelTotals` already ran).
  A Model with no price makes the figure a lower bound, which the response says (`costUnpriced`)
  and the table draws as a leading `≥`; with nothing priced at all the field is omitted and the
  cell shows `—`, rather than a zero the reader cannot tell from "ran for free".

The users page is the only page whose content is a wide table, so it asks `PagedDialog` for a
wider panel (`PagedDialog.widthClass`, defaulting to the shared width); six columns and two row
actions otherwise pushed 重置密码 / 删除 off the pane, reachable only by scrolling sideways.

## Server

- `db/schema.ts` / `db/database.ts`: the `users.last_login_at` column and its `ensureColumn` guard.
- `db/repos/users.ts` / `mechanisms/identity.ts`: `touchLastLogin`, and the column on `UserRow`.
- `auth/service.ts`: stamps the column on a successful password login and returns it in that
  login's own DTO.
- `services/usage-service.ts` / `mechanisms/observability.ts`: `lifetimeCost(projectId)` — one
  unfiltered grouped scan, folded with the same per-reference rate lookup `query` uses.
- `services/admin-service.ts`: `listUsers` is now async; it sums each account's owned Projects.
- `http/routes/admin.ts`: awaits the list.

## Web

- `features/admin/admin-users-page.tsx`: the two columns (currency follows the display preference).
- `features/settings/settings-dialog.tsx`: the users page's panel width.
- `lib/strings.ts` / `lib/strings-en.ts`: the column headers, the never-signed-in word and the cost
  column's tooltip.
- `packages/ui` `overlays/paged-dialog`: the optional `widthClass`.
