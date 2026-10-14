# Running subagents stay visible across tasks

- **Date:** 2026-10-14
- **Type:** fix
- **Scope:** `web`

[中文版](2026-10-14-running-subagents-panel.zh.md)

Ported from upstream PenguinHarness (#1110, commit `355d6b10`).

The agents panel replaced its graph when a later message started a new task, so a background child
that was still running disappeared from the panel while the runtime kept reporting it running. Now
the default graph keeps the loaded children the runtime reports running beside the latest task's
children; each keeps its original description and its own conversation, and one that settles drops
out again. Selecting a historical subagent chip still shows that task's own graph only.

Interfaces and the stored data are unchanged.
