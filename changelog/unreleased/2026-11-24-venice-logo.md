# The Venice AI group shows its own mark instead of a letter tile

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `ui`

[中文](2026-11-24-venice-logo.zh.md)

**Venice AI** used to be drawn as a grey letter tile ("V") in the model library and the model picker,
the same as a user-defined group. It now carries the vendor's own mark — two crossed keys with a
winged emblem above them — inked in `currentColor` like every other preset provider, following the
light and dark themes.

## Details

- `packages/ui/src/components/icons/logos/provider-logo.tsx`: a `venice` entry in `GLYPHS` — two
  `evenodd` paths (the emblem and the little wing above it), with `fillRule`/`clipRule` kept (drop
  the rule and the counter-shapes inside the key bows fill in, turning the mark into a blob). The
  colour comes from `currentColor` as for the other preset providers.
- The mark is the one `@lobehub/icons` publishes for Venice AI. Nothing was redrawn by hand: the
  vendor's own site is unreachable from this machine (connection timeouts on `venice.ai`, its
  `icon.svg` and its docs site alike), and a hand-drawn guess at a trademark reads worse than the
  letter tile it replaces. No dependency was added — the two paths are copied in, and this file has
  always been "pure paths, no external image assets".
- `packages/ui/test/logos.test.ts`: a new assertion that `venice` renders solid paths rather than a
  letter tile, with both `fill-rule="evenodd"` attributes intact.

## Compatibility

One extra icon. The data root, the interface shapes and the model catalog are unchanged, and no
font or image asset was added.
