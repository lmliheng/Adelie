# The sandbox's unconfined file mode is named Full access

- **Date:** 2026-10-13
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-13-sandbox-full-access-label.zh.md)

Ported from upstream PenguinHarness (#1021, commit `b24f3099`).

In the sandbox settings, the file-write option that confines nothing was labelled "Off (full
access)" (「关闭（完全访问）」), too long for the option list and a name nothing else used. It is
now **Full access** (「完全访问」), the name the permission menu and the presets already use. The
setting's description and the no-backend notice («every mode but Off…» / 「除「关闭」外…») name it
the same way. Stored values (`danger-full-access`) are unchanged; only the label moved.
