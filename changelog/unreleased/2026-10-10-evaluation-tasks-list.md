# The Evaluations folder holds only the Test Sessions an agent starts

- **Date:** 2026-10-10
- **Type:** fix
- **Scope:** `web`, `docs`

[中文版](2026-10-10-evaluation-tasks-list.zh.md)

The conversation the Evaluation Center's **Use** dialog opens on its **Evaluate** or **Optimize** tab is an ordinary conversation: it is listed with the agent that carries the work out, and it is no longer filed under the **Evaluations** folder of the session list. The folder is left to the Test Sessions an agent starts itself through `penguin run --source benchmark`, which is how `agent-evaluation` launches each case × run.

This is ported from upstream PenguinHarness (#969, commit `8a774995`).

## Details

- The **Use** dialog stopped marking the conversation it prefills, and the new-chat draft stopped sending that mark as `source` when it creates the Session. A draft an earlier release saved with the mark creates an ordinary Session too — the field-by-field parser drops the field like any other unknown one.
- Conversations created before this change keep `source: "benchmark"` in their Trace and stay in the **Evaluations** folder: Traces are append-only and the membership rule (`!archived && source === "benchmark"`) is unchanged. Nothing is migrated.
- The server and the CLI behave as before: `POST …/sessions` still accepts `source: "benchmark"`, which `penguin run --source benchmark` sends for every Test Session. Only the doc comments on `SessionCreateRequest.source` and `CreateSessionOptions.source` changed.
- The Evaluation Center, Chat and Server API docs were updated to match, in English and Chinese.
