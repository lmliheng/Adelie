# Frost shows its scrollbars at rest

- **Date:** 2026-10-13
- **Type:** fix
- **Scope:** `ui`

[中文版](2026-10-13-frost-scrollbars.zh.md)

Ported from upstream PenguinHarness (#1070, commit `7527dd98`).

In the Frost theme, the default for a new install and so for a new desktop app, a scrollbar
appeared only while the pointer was over its scroll area. A dialog with nested scroll areas, such
as a plugin's details with its file preview, gave no sign that either part scrolled. Frost now
shows its thin scrollbars at rest, as Primer and Console do, in its own light and dark thumb
colours.

No API, wire format or stored data changes.
