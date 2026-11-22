# A desk row the sidebar could not open keeps its reason under the row

- **Date:** 2026-11-23
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-23-desk-row-refusal.zh.md)

The company sidebar's 工位 group lists one row per employee. A row whose desk Session id its
caches have not learned yet opens the desk through the desk route (which creates it on the way
in) — a read that can fail. When it did, the reason was only a notification: it dismissed itself
after six seconds, and the row that was pressed went back to looking exactly as it had before the
click.

The reason now stays under the row that asked, in the server's own words (「操作被拒绝：…」), and
the same row is the retry. The row never leaves the sidebar on the way into `catch`, so the
sentence stands there instead of walking away like a notification. The collapsed rail's items are
48 px wide and have no line to answer on, so a refused desk there keeps the notification.

## Details

- `packages/web/src/features/company/org-session-groups.tsx`: `useOpenDesk` keeps `refusal`
  (`{ agentId, text }`, written through `refusalText`), cleared when another attempt starts and
  when the reader moves to another organization. `OrgSessionGroups` asks for `sayInPlace: true`
  and draws the sentence under the matching `DeskRow` (`role="alert"`, danger ink, two lines at
  most, the whole sentence on hover); the rail keeps `toastError` by default.
- No new wording, no new dependency, no API changes.

## Tests

- `packages/web/e2e/desk-row-refusal.spec.mjs` (new, 1 case, real server + the repository's mock
  model): the two reads the sidebar draws the group from are handed back in the documented
  stale-cache state (no employee carries `desk`, the sessions route lists none), and the desk route
  answers 500 in its own words → the sentence is under the row, measured to start at the row's
  bottom edge and to stay inside the sidebar, absent from the notifications region, still there
  after seven seconds, and the row is enabled again; once the intercept is lifted, the same row
  lands in `/chat/<session>`. On the pre-change build this fails: the sidebar has no such
  sentence, only a six-second notification.

## Compatibility

No route, storage format or wire type changed: the refusal is one client-side read.
