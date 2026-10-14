# A Session's fullscreen panel comes back with it

- **Date:** 2026-10-14
- **Type:** fix
- **Scope:** `web`

[中文版](2026-10-14-session-dock-fullscreen.zh.md)

Ported from upstream PenguinHarness (#1128, commit `8f747606`).

Switching away from a Session and back again always showed its dock at the normal size, because the
fullscreen state was cleared by the switch. Fullscreen is now remembered per dock arrangement, in
memory: one Session can keep its right dock fullscreen while another keeps its bottom dock
fullscreen, and a draft carries its fullscreen into the Session created by its first message.

Shared panel width and bottom height keep their behavior. Exiting fullscreen, hiding the dock and
closing its last tab clear it, and so does pruning the last terminal of an inactive Session before a
terminal can return there. A reload and the narrow-layout breakpoint start every arrangement at the
normal size; the localStorage format is unchanged.
