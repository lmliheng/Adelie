# A notice that wraps keeps its tone mark on its first line

- **Date:** 2026-11-27
- **Type:** fix
- **Scope:** `ui`

[中文](2026-11-27-notice-mark-first-line.zh.md)

The shared `Notice` centred its leading mark on the whole box, so a notice that wrapped — a failure
line with a list of reasons under it, a callout with a title over a longer body — showed the dot (in
the modern theme) or the `[WARN]` tag (in the geek theme) beside a middle line of the text.

The leading block is now `items-start` and the mark's slot is one line tall (`min-h-[1lh]`) with the
mark centred in it: the mark sits on the first line however far the text wraps, and a one-line
notice looks as if the whole row were centred. The themes that draw their own tone mark (modern's
dot, geek's tag) ride that block's first line too, and a banner keeps its mark on its first line
under the strip's own padding.

## Details

- `packages/ui/src/components/feedback/notice/notice.tsx`: the leading block carries
  `data-slot="lead"` and `items-start`; the `icon` slot is `min-h-[1lh] items-center`.
- `packages/ui/src/themes/modern.css` and `geek.css`: the tone mark's `::before` moves onto
  `[data-slot="lead"]` (anchored to the first line), the host's own mark gives way when a lead block
  is present, and a banner's mark sits under the strip's padding.
- `packages/ui/src/hooks.ts` and `notice-strip.tsx`: the hook's slot list and the strip's comment
  name `lead`.
- `packages/ui-gallery`: the Notice board gains a multi-line example, in both languages.
- Tests: `notice.test.ts` holds the lead block and the one-line icon slot; `hooks.test.ts` and
  `token-contract.test.ts` follow the new slot and selector.

## Compatibility

The `ui-notice` hook, its tones and its other slots are unchanged; a call site that draws no mark
sees the same layout. No data, API or stored format changed.
