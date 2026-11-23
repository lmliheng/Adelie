# The Tencent TokenHub group shows its own mark instead of a letter tile

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `ui`

[中文](2026-11-24-tokenhub-logo.zh.md)

The **Tencent TokenHub** group added to the model library yesterday was drawn as a grey letter tile
("T") in the model library and the model picker, the same as a user-defined group. It now carries
its own mark — Tencent Cloud's cloud-and-swoosh, the platform the group's key belongs to — inked in
`currentColor` like every other preset provider, following the light and dark themes.

## Details

- `packages/ui/src/components/icons/logos/provider-logo.tsx`: a `tokenhub` entry in `GLYPHS` — three
  `evenodd` paths, with `fillRule`/`clipRule` kept (drop the rule and the counter-shapes inside the
  cloud fill in, turning the mark into a blob). The colour comes from `currentColor` as for the other
  preset providers. It sits right after `tencent`, which draws Hunyuan's circle — TokenHub is a
  different provider, so the two rows should not read as one.
- The mark is the one `@lobehub/icons` publishes as `TencentCloud`. Nothing was redrawn by hand:
  TokenHub's own console and product pages return a captcha shell to this machine (HTTP 200, no
  logo), and a hand-drawn guess at a trademark reads worse than the letter tile it replaces. No
  dependency was added — the three paths are copied in, and this file has always been "pure paths,
  no external image assets".
- `packages/ui/test/logos.test.ts`: a new assertion that `tokenhub` renders three `evenodd` paths
  rather than a letter tile, and that its drawing is not the `tencent` row's.

## Compatibility

One extra icon. The data root, the interface shapes and the model catalog are unchanged, and no
font or image asset was added.
