# On a picture smaller than the chips, the chips step aside

- **Date:** 2026-10-30
- **Type:** fix
- **Scope:** `ui`
- **Breaking:** no

[中文](2026-10-30-lightbox-chips-beside-tiny-picture.zh.md)

The lightbox floats the size badge and the close glyph in the picture's frame, one in each top
corner. That is right for a photograph and wrong for a 40 × 30 sprite: the two chips together are
larger than the picture, the badge itself wraps onto three lines inside so narrow a frame, and the
picture they describe is what disappears. The chips still take the corners **when the picture is
big enough to hold them**; when it is not, the size moves to the picture's left and the close glyph
to its right — same row, still over the dimmed page, and neither covers the other.

## Details

- `packages/ui/src/components/overlays/lightbox/image-board.ts`: a new pure function
  `cornerChipsFit(width, height)` with `CHIP_BAND = 36` — the chips are always drawn within 36px of
  the top edge and, side by side, need about 140px of width, so a picture under three bands tall or
  under 160px wide has no room. An unmeasured size never fits.
- `packages/ui/src/components/overlays/lightbox/lightbox.tsx`: the chips' placement follows that
  answer — `right-2 top-2` / `left-2 top-2` when they fit (exactly as before), `left-full ml-1.5` /
  `right-full mr-1.5` when they do not, the size badge additionally `whitespace-nowrap` (beside a
  narrow picture its box has no width to wrap inside). A picture still loading, or one whose reading
  belongs to the previous picture, keeps the corners: that is every other picture's look, and
  jumping a line on load would be the bigger distraction.
- Tests: four new cases in `packages/ui/test/image-board.test.ts` — a large picture fits, a sprite /
  a banner / a column do not, both sides of the threshold, and an unmeasured size never fits.

## Compatibility

- No API, on-disk or protocol change. On a large picture the chips have not moved a pixel; a picture
  bigger than the chips but under the threshold (a 1200 × 80 banner, say) takes the new placement.
