# Truncated text shows its whole value on hover

- **Date:** 2026-10-16
- **Type:** fix
- **Scope:** `ui`, `web`

[中文版](2026-10-16-truncated-text-hover.zh.md)

Ported from upstream PenguinHarness (#1069, commit `24a2eb38`).

A line the page cuts off with an ellipsis, a path shortened to its last segments and a workspace
named by nothing but its folder could keep their whole value out of reach. All three now show it
on hover or focus.

## Details

- **Any ellipsized line, with no hint written for it.** The shared tooltip layer reacts only to
  elements carrying `data-tooltip`, so a line the page shortens itself had no way in. It now falls
  back to the shortened line under the pointer or focus: the node or one of its nearest ancestors
  that sets an ellipsis or `-webkit-line-clamp`, and — for a control, which is asked about as a
  whole — every such line inside it, in document order, of which the first actually cut off when
  the hint would open is shown. A monospace line (a path) opens in the code panel, anything else in
  the text panel; a blank line asks for nothing, and a panel that merely contains shortened rows is
  not itself one line.
- **An opt-out for subtrees that decide their own hint.** `data-tooltip-owned` stops the fallback
  inside it: the `<Tooltip>` wrapper's measuring span sets it, and so does `Truncated` while its
  title scrolls its own tail into view, so the hover that slides the text into place is not joined
  by a panel repeating it.
- **Workspace group headers.** The full path behind a folder-only label was already attached, but
  the rule that drops hints repeating visible text hid it whenever the basename fit. It is now
  marked as adding to what is visible (`data-tooltip-extra`) and drawn in the text panel, so it
  shows either way.
- **File tool cards.** A `read_file` / `edit_file` / `write_file` subtitle shortened to
  `…/parent/file` keeps its whole path one hover away: the card takes a new `subtitleFull` prop and
  the app passes `headerSubtitlePath(...)`, which answers with the full path only when the subtitle
  is the shortened path.

## What this fork left out

- `.agents/skills/penguin-harness-frontend/SKILL.md` — upstream's own developer skill notes, kept
  untouched here (the 2.1c / 2.5 line).
- The Archived chats group heading — that page (`web/src/features/settings/archived-sessions-section.tsx`)
  does not exist in this tree; the sidebar keeps the archived rows in its own folder.
