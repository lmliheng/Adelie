# The bottom dock's resize boundary is grabbable along its whole length

- **Date:** 2026-10-17
- **Type:** fix
- **Scope:** `ui`, `web`

[中文版](2026-10-17-dock-resize-band.zh.md)

The bottom dock's top boundary is a 6 px drag band that resizes it. The band used to straddle the frame's top edge — but the frame is `overflow-hidden` (it clips itself while its size animates), so the half sticking out above the edge was clipped away: only the inner 3 px could be grabbed, and the line the user actually sees (the frame's 1 px border) sat on the clipped side and did nothing when pressed.

The band now sits wholly inside the frame's top edge (`top-0`, still 6 px), where nothing clips it: the 6 px below the line all drag, and the pointer turns into the row-resize arrow across them. The right dock's band (the vertical one between columns) has no clipping ancestor and still straddles its edge; in full screen the same element is carried by the frame's fixed seat, so its position is unchanged.

## Details

- `packages/ui`, `ResizeHandle`: `edge="start"` on `axis="y"` goes from `-top-[3px]` to `top-0`, with the reason written next to the constant.
- `packages/web`, `dock-panel.tsx`: comment only — the boundary handle lies along the top edge, just inside it.
- The matching assertion in `test/resize-handle.test.ts` follows, plus the x-axis case that still straddles.

## Verification

A real server and browser (one-off data root, `localhost`, Chromium): before the change, `elementFromPoint` at the band's centre resolved to the dock frame itself and a 120 px drag changed the height by **0**; after it, the same point resolves to the band and the same drag takes the height **276 → 394** (+118). The browser e2e `dock.spec.mjs` "sizes and the arrangement survive a reload" goes from red to green.
