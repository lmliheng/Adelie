# A page with imported themes painted its theme above the app's own styles

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-22-imported-theme-layer-order.zh.md)

On an installation that had imported at least one theme, the theme's own recipe lost to the app's
own utilities: padding collapsed, borders that the theme switches off came back, and marks the
theme hides were shown. Console's notice is where it showed — its `[WARN]` tag printed on top of
the message instead of standing before it — and rounded corners on the geek theme looked square.

The cause is cascade-layer order. A set of layer names is ordered by where each name first
appears, and the sheet the server builds from the imported themes (`GET /api/themes.css`) carries
`@layer ui-theme`. That link has to come first, so the sign-in page paints the user's own theme
too — which made `ui-theme` the first layer named in the document, i.e. the lowest of all. Every
theme recipe then lost to Tailwind: `.px-4` beat a recipe's `padding-inline-start`, `.border` beat
its `border: 0`, `.flex` beat `[data-slot=icon] { display: none }`. The `::before` tag has no
competitor, so it was still drawn — on top of the text.

The head now states the order itself, before the theme link:

```html
<style>@layer properties, theme, base, components, utilities, ui-theme, ui-accent, ui-font;</style>
```

That pins the order for the whole document whichever order the two sheets load in, in a build or
on the dev server. The utilities stay below the theme layers, which is what the app's own
stylesheet already establishes.

## Details

- `packages/web/index.html`: the ordered `@layer` statement sits in the head just before the
  `/api/themes.css` link, with a comment saying why it must be first.
- `packages/web/test/head-layers.test.ts` (new): holds the statement in place — it exists, it
  comes before the theme link, and it puts `ui-theme` (and `ui-accent`, `ui-font`) after
  `utilities`.

## Compatibility

The statement only fixes the order the app's own stylesheet already intends; an installation with
no imported theme is unaffected. No data root, Trace format or API shape changes.
