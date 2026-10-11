# Blocking a ticket checks the `by` principal against the chart

- **Date:** 2026-10-11
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-11-block-by-principal-check.zh.md)

Ported from upstream PenguinHarness (#851, commit `4ea0d5f9`).

Blocking a ticket — the `block` route, `penguin org ticket block --by`, and the employee tool — now holds a `by` of the form `agent:<id>` or `user:<id>` to the rule every other principal an organization accepts already follows: the agent must be an employee on the chart and the user a member of the Project, otherwise the write is refused with `400 invalid_principal`. Before, any shape-valid id landed in `blocked_by` and rendered as "(by …)" in the digest and on the board. The ticket-id form keeps its existence check, omitting `by` still clears `blockedBy`, and stored values are not rewritten.
