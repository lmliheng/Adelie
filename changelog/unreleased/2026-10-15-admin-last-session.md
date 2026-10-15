# The user table gains a "Last session" column

- **Date:** 2026-10-15
- **Type:** feat
- **Scope:** `server`, `web`

[中文版](2026-10-15-admin-last-session.zh.md)

The admin user table gains "Last session" beside "Last sign-in": the most recently active
conversation **across every Project the account owns** — the time on the first line (the same figure
the column next to it shows) and that Session's title under it. A Session with no title generated
and no rename yet has only the time to show. An account that never opened a conversation reads `—`,
which is a different state from "Never" signed in.

"Most recent" is by activity, not creation: a conversation started at the beginning of the month and
used today counts as today's. Archived Sessions and subagent Sessions are included — they are rows in
the same index every Session list draws from, and this column does not invent a second rule.
Long titles are truncated with the full text on hover; the title is drawn in the cell rather than
hidden in a tooltip, since a tooltip is unreachable on touch.

The column brings the table to seven of them, which the previous panel width could not hold without
scrolling sideways to reach "Reset password" / "Delete", so the user page's dialog goes from
`max-w-5xl` to `max-w-6xl`: measured, the table wanted 861px inside a 796px pane before, and now fits
in 924px. Every other settings page keeps the narrower panel.

The figure is computed by the server: each entry of `GET /api/admin/users` carries two optional
fields, `lastSessionAt` and `lastSessionTitle`, both omitted for an account with no Session at all.
