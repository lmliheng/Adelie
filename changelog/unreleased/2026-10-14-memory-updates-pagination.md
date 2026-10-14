# Memory update cards survive a paginated conversation

- **Date:** 2026-10-14
- **Type:** fix
- **Scope:** `server`, `web`

[中文版](2026-10-14-memory-updates-pagination.zh.md)

Ported from upstream PenguinHarness (#1138, commit `d51c4577`).

Opening a long conversation could hide its memory update cards even though the file edits behind them
had succeeded. A history window can start after the `session_meta` record — the one that carries the
Agent State directory — so the stream model had no `<agent_state>/memory/` root to classify memory
paths against.

The history page envelope now carries the directory recorded by the context the window starts in,
and the stream controller seeds it before replaying the window. Cards come back when the
conversation is opened, when older messages are loaded and after a reconnect; repeated edits to one
topic still draw a single row, and edits to the memory index stay excluded. No OmniMessage field
was added, and neither stored traces nor memory files are rewritten.
