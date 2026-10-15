# The account menu links to the public feedback board

- **Date:** 2026-10-15
- **Type:** feat
- **Scope:** `web`

[中文版](2026-10-15-feedback-board-link.zh.md)

The account menu at the bottom of the sidebar has a new row, **Feedback board**, which opens the
product's public board (Tencent's 兔小巢) in a new tab — where anyone can post, and read what others
have already reported.

It sits beside the existing **Feedback** row rather than replacing it, because the two are different
doors: the old row files into *this machine's* queue and appears only where the operator configured
an endpoint, while the board belongs to the product and is therefore the same address, and offered,
in every install. A muted line under the new row says the board is public, so the two are told apart
at a glance.

The link opens the way the app opens every off-app destination: a new tab, `noopener,noreferrer`,
and in the desktop window it is handed to the system browser (the same route the GitHub and Releases
links take).
