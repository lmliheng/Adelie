# A fill behind words no longer comes from the theme's outline colour

- **Date:** 2026-11-27
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-27-outline-rung-fills.zh.md)

In a theme imported through the appearance page, Tailwind's `bg-gray-200` is not a light grey: the
palette bridge ties that rung to `--ui-line`, the theme's **border** colour. In the hand-drawn theme
that border is `#3f3a34` beside `#332f2a` ink, so every control that painted the rung as a fill and
put words on it became a near-black block — measured at **1.46** contrast in the model picker's
active provider, and about the same on the trace panel's file tabs, the plugin market's selected
filter, mention chips, unread badges and the path capsule.

Those controls now fill from the theme's own tokens: `bg-fill-neutral` where a surface step is
wanted, or a wash of the ink (`bg-fg/10`, `bg-fg/7`) where the fill sits on a surface that already
is the neutral step. Labels that used the grey ramp for ink moved to `text-fg`, because the bridge
points the dark mode's `gray-200` at the border too — as ink it was a medium grey on a dark fill. The
per-mode `dark:bg-gray-700` / `dark:bg-gray-800` halves went with them: a token needs no twin.

A new guard (`packages/web/test/outline-rung-fill.test.ts`) parses the real JSX and fails when a
`bg-gray-200` element carries text or an expression child. Inert marks — a progress track, a
hairline, a grid gap, a scrollbar thumb — are listed by file with the reason, and a listed use that
disappears fails too, so the list cannot rot.

## Details

- `packages/web/src/features/chat/model-picker-modal.tsx` — the active provider in the picker's
  rail (`bg-gray-200/70 … dark:bg-gray-800` → `bg-fill-neutral`, its `dark:bg-gray-800` dropped).
- `packages/web/src/features/plugins/plugins-page.tsx` — a selected category filter.
- `packages/web/src/features/traces/trace-panel.tsx` and `sse-frame-list.tsx` — the active trace
  file pill and the transport toggle.
- `packages/web/src/features/company/channel-markdown.tsx` — the mention chip that is not the reader
  (its dark half dropped; the ink stays `text-gray-800` / `dark:text-gray-100`, which the bridge
  maps to the theme's ink on both modes).
- `packages/web/src/features/company/channel-composer.tsx` — the mention highlight behind the
  composer's transparent text layer (`bg-fg/10 ring-2 ring-fg/10`).
- `packages/web/src/features/company/channel-sidebar.tsx` — the "join" button on a channel row, and
  the unread count on the collapsed rail (which was `bg-gray-300 text-gray-800` — the deeper
  `--ui-line-emphasis` under its own ink).
- `packages/web/src/features/company/org-switcher.tsx` — the hover wash and the unread / mention
  badge (`bg-fg/10 text-fg`).
- `packages/web/src/features/company/path-capsule.tsx` — the inline path capsule.
- `packages/web/src/features/company/shared.tsx` — the principal avatar (the inverted pair:
  `bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900` → `bg-fg text-canvas`).
- `packages/web/src/features/chat/goal-banner.tsx` — the goal banner's status pill.
- `packages/web/src/features/terminal/terminal-appearance.ts` — the tab's close button and the key
  caps' pressed state.

## Compatibility

Class names only. No markup, request, keyboard path or stored data changed, and the default theme
renders the same colours as before (`bg-fill-neutral` is `#f5f5f5` there, where the rung was
`#e9e9e9` at 70%).
