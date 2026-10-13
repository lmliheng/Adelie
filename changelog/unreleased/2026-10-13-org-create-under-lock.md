# Creating an organization writes its layout under the organization's lock

- **Date:** 2026-10-13
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-13-org-create-under-lock.zh.md)

Ported from upstream PenguinHarness (#957, commit `10b43edc`).

Creating an organization now writes its directory layout — the skeleton, `org_config.toml`,
`org_chart.yaml`, the handbook — and creates the CEO's Agent under the same lock a delete holds
while it moves the directory to the trash. The pre-checks (the id, the mission, the timezone,
a free id) still run before the lock.

Before this, a delete landing in the milliseconds between create's first written file and its
lock passed its own guard, moved the half-made directory away, and left create writing the chart
and the handbook beside a config that was no longer there: a directory no listing shows, a CEO
Agent holding the id against reuse, and a not-found for the caller who had just watched the
create succeed. Now a delete arriving mid-creation waits, and then finds either no directory or
the finished whole — the same two states a delete after a completed create always had.

No API, wire format or stored data changes.
