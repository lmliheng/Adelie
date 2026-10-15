# Hover hints that say what the screen does not show open again

- **Date:** 2026-10-16
- **Type:** fix
- **Scope:** `ui`, `web`

[中文版](2026-10-16-key-hints-restored.zh.md)

Ported from upstream PenguinHarness (#1051, commit `e5639b32`).

The tooltip rule opens a hint only on an element with no words of its own or with its words cut off. Hints that carried something the screen does not show — what a click discards, a shortcut, the full path behind a folder's name, why a control is disabled — had stopped opening on controls with visible text, and an avatar's initial or a letter used as an icon counted as visible words, silencing the hint that names it. The rule now leaves such text out, and a hint that adds to visible text is marked and opens over it.

## Details

- `hintAllowedFor` no longer counts text inside an SVG or inside `aria-hidden` as the element's words, so the hints naming an avatar open again (a Session row's Agent, the collapsed rail's account, a company page's employee). The Session row's approval count and a chip's × became `aria-hidden` marks; the approval count is named in hidden text instead.
- A `data-tooltip` marked `data-tooltip-extra` opens over fully visible text; `<Tooltip extra>`, `tooltipExtra` on a chip and a nav row's hint, and `titleExtra` on the form picker's trigger set the same mark. A `Badge`'s tooltip and a `BetaBadge`'s title are always marked; `Breadcrumbs`, `DockTabs`, `Legend`, `FileTree` and `ToolCallCard` mark a hint that says more than the label.
- A hint that only repeats the words already on screen is never marked, and never shows — that rule is unchanged.
- Not every site on the upstream audit list exists in this tree: the plugin market cards, the find bar, the draft page's example folders (this fork keeps user shortcuts there instead), the transcript note and the API-try panel are not part of this port. The hint on a shortcut row's fill action was marked in their place, since it carries the same kind of information.
