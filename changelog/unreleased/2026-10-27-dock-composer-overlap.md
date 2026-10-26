# The bottom dock no longer covers the composer

- **Date:** 2026-10-27
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-27-dock-composer-overlap.zh.md)

At its largest docked size the bottom dock, and the merged dock below the narrow breakpoint, now
stops above the composer. It used to reach 85% of the chat column, toolbar included, which on most
windows left the composer too little room: the composer slid under the dock and could not be
clicked, and with a wallpaper the two showed through each other.

The docked maximum leaves the composer its full height and a strip of messages above it, tall
enough for the launcher ball with its caption and for the back-to-bottom button. When the composer
grows (more lines, attachments, a notice) or the window gets shorter, the dock gives way at once
and comes back when the room returns; the stored height stays as it was. In a very short window
the message strip gives way first, then the dock's own minimum height, and the composer never
does. A boundary drag stops at the new maximum, stores the height the dock shows, and still snaps
into fullscreen when pulled past it. Fullscreen still covers the composer.

## Details

- `packages/web/src/features/dock/bottom-dock-size.ts` (new, pure): the rule itself —
  `bottomDockMaxHeight` is what the area below the toolbar leaves once the composer and a message
  strip (`CONVERSATION_MIN_HEIGHT_PX`, the launcher's own shortest-body figure) have their room,
  still capped by the stored ratio's `DOCK_RATIO_MAX`; `bottomDockHeight` clamps a stored ratio to
  it. The size constants moved here, and `dock-state.ts` imports `DOCK_RATIO_MAX` back.
- `packages/web/src/features/dock/composer-height.ts` (new): a tiny store fed by a
  `ResizeObserver` ref, so the dock, its drag clamp and the drag overlay's landing preview read the
  same composer height; the last measurement outlives a remount, so a dock at its ceiling does not
  jump up and back down when a conversation switch rebuilds the composer.
- `packages/web/src/features/dock/dock-panel.tsx`: measures the column and the area
  (`[data-dock-host]` / `[data-dock-area]`), draws with the new function, and gives way in the same
  commit (through the existing `snap` path) when the ceiling drops below the dock, instead of
  through the layout motion.
- `packages/web/src/features/dock/dock-drag.tsx`: the landing preview uses the same function.
- `packages/web/src/features/chat/chat-page.tsx`: the composer box carries the measuring ref. This
  tree's composer is a plain `<div>` — upstream hands the ref to its wallpaper surface, which this
  tree does not have.
- `packages/web/e2e/dock.spec.mjs`: "sizes and the arrangement survive a reload" runs at
  1280×1100; at the default 1280×720 the bottom dock's default height is already at the ceiling, so
  its upward drag has no room to grow.
- Ported from upstream `bf3395ff` (#1325), applied as its own change rather than merged; its
  source-reading case in `test/bottom-dock-size.test.ts` was adjusted to this tree's composer box.

## Compatibility

- No dependency, stored-data, package-name or config change. A stored ratio (up to 0.85) renders
  at the new ceiling; the next drag stores the height the dock shows.
