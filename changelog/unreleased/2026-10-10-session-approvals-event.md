# A Session waiting for approval is marked live in every list

- **Date:** 2026-10-10
- **Type:** feature
- **Scope:** `server`, `web`, `docs`

[中文版](2026-10-10-session-approvals-event.zh.md)

This is ported from upstream PenguinHarness (#1002, commit `60f34c47`).

A sidebar row's approvals mark came only from the last list fetch, so a Session that started
waiting for a tool approval while another conversation was open showed nothing until the list was
loaded again. The user channel gained a `session_approvals` event with the Session's count of
waiting calls, and the Web App applied it to the row as it arrived. Any client watching a
Project's Sessions over `GET /api/events` can tell which one waits for a person without
subscribing to every Session's stream.

## Details

- `session_approvals` carries `sessionId` and `count`, the row's `pendingApprovalCount` as it
  stands after the change, zeros included. It is published when a call is escalated to a person,
  when a call is answered, and when an interrupt or a Task boundary denies the waiting calls;
  an interrupt that denies several calls publishes one event. Its audience is the same as for
  `session_state`.
- A call the approval mode answers by itself (`allow-all`, `deny-all`, read-only tools under
  `read-only`) and a call an unattended Session denies on the spot publish nothing.
- The calls themselves stay on the Session's own stream as `approval_request`, replayed on
  subscribe.
- The Server API page lists the event and when it fires, in both languages.
