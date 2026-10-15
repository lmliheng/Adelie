# The line under "Feedback board" in the account menu is gone

- **Date:** 2026-10-16
- **Type:** fix
- **Scope:** `web`

[中文版](2026-10-16-feedback-board-no-hint.zh.md)

In the account menu at the bottom of the sidebar, the **Feedback board** row no longer carries the
muted line "Public: post there, and read what others reported" under it.

A menu is there to be clicked, not read: one line per row is enough to tell which door is which —
**Feedback** files into this machine's queue, **Feedback board** is the product's public board, and
the two names already say so. Explaining it again underneath only made the menu taller. Both rows
are now a single clean line (the hint ships in `v0.4.1`, and comes off with this).
