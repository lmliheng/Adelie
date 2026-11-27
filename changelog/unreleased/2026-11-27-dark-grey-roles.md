# An imported theme's dark grey: 200 is ink, and a dark fill is a fill

- **Date:** 2026-11-27
- **Type:** fix
- **Scope:** `core`, `web`

[中文版](2026-11-27-dark-grey-roles.zh.md)

An imported theme (外观页「主题库」里按需取用的那几套，比如手绘涂鸦) is values, not css: core's `internal/external-theme.ts` writes the Tailwind grey bridge for it, out of the theme's own tokens. Two rungs of that bridge disagreed with the shipped themes.

`--color-gray-200` was tied to `--ui-line`, the theme's **outline**. Both shipped dark ramps keep 200 as an ink one step under the body ink (`#c2c2c2` in `github.css`, `#c5c0bf` in `geek.css`), and the app reads it that way at every `dark:text-gray-200` — a placeholder token's label, a tab's name, a ticket's assignee. Under an imported theme those words came out in the outline colour: about 2:1 on a plain surface, and inside a `dark:bg-gray-800` chip — the same token — literally the same colour twice. In the hand-drawn theme the Agent's "可用占位符" chips were empty-looking rectangles (measured: ink and fill both `rgb(122 109 94)`, contrast **1.00**); now **11.0**.

The dark fills were the other half. `dark:bg-gray-700/800` is that same outline rung, so a chip that is a near-black block in a shipped theme became a mid-tone block in a theme whose outline is a strong hand-drawn line, with muted ink on it at **2.71:1**. Those call sites now fill with `dark:bg-fill-neutral` — the token a theme defines as a *fill* — which lands at 6.05 in the same theme and is the same colour as before in the shipped ones.

## Details

- `packages/core/src/internal/external-theme.ts`: `PALETTE_BRIDGE_DARK` maps `--color-gray-200` to `--ui-fg`, with the reason (both shipped ramps keep it as ink; 41 `dark:text-gray-200` call sites, one of them on a chip filled with the same rung).
- `packages/core/test/external-theme.test.ts`: the dark bridge lines, and the "only the rungs this theme declares" case (200 now rides with the ink, so a theme that declares `--ui-fg` carries it in dark too).
- `packages/web`: the dark fills that carry words moved to `dark:bg-fill-neutral` — the plugin page's tags, the plugin detail's keyword chips and install note, the Agent's placeholder chips (Prompt / Memory / Injection), the model picker's highlighted row, a step's number circle, the org landing's icon circle, the semantic-id prefix, a trace event's two code blocks, the task chip in the timeline, and the pet's bubbles and control buttons; `lib/tone.ts`'s grey tone (`toneSurface.muted`) is now `bg-fill-neutral text-fg-muted`.
- `packages/web/test/outline-rung-fill.test.ts`: the outline guard now also fails on an element that both fills with the dark rung and inks with the grey ramp — the pair that collapsed. Three containers that only look like they carry words (a segmented control's gap, a progress track, a chart track) keep the fill; they are named in the guard's comment.

## Compatibility

No API, data or copy changes; no new dependency. Shipped themes paint identically (fill-neutral *is* `gray-800` in their dark ramp), while imported themes get readable words. Themes that rely on `dark:border-gray-200` / `dark:bg-gray-200` now get an ink-coloured border or mark — which is what the shipped themes already show.
