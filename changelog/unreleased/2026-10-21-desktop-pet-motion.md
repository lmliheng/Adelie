# The pet is moved by dragging the penguin itself, hops when it is clicked, and its eyes follow the pointer

- **Date:** 2026-10-21
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-10-21-desktop-pet-motion.zh.md)

The desktop pet could not be moved. It was draggable before this, but by the wrong thing: the window carried an
OS drag region over everything *except* the penguin, which was opted out of it so that a click could reach the
page — and the penguin is the one part of a transparent window a hand reliably finds. The visible pet was
therefore exactly the part that would not move, and on a desktop where the transparent area of a frameless
window receives no pointer input at all, nothing on the pet could move it.

The penguin itself is now the handle: pressing it and moving drags the window, and a press that stays put is a
click — it opens the panel and makes the pet hop, so a press answers before anything else happens. The pet also
stopped being a still picture: it blinks on its own, and its pupils follow the pointer.

## Details

- The page moves its own window (`window.moveBy`, one step per pointer sample) instead of asking the window
  system to. The gesture is measured in screen coordinates — a step taken in the page's own coordinates would
  fold the window's own movement back into the drag — and it is the app's one drag state machine
  (`usePointerDrag`, the same one a resize handle and the dock's tabs use), which tracks the gesture on the
  window and says whether a press was a drag.
- A press that travels more than 4 CSS px on either axis is a drag and never opens the panel. A press that
  stays put is a click, wherever the pointer landed on the penguin. The rest of the window keeps its OS drag
  region for the platforms whose window system delivers input to it, so nothing that could be dragged before
  stopped being draggable.
- The hop is 520ms: off the ground with a stretch, down with a squash and a small second bounce. It plays on a
  click and when a notice arrives — a schedule firing, a tool call waiting for a person, a budget warning — so
  the pet is seen to notice rather than only read.
- The eyes: the pair blinks on a 6.4s cycle, and the pupils slide toward the pointer, up to 2.2 of the penguin's
  own SVG units sideways and 1.6 of them vertically, which is as far as they can go without touching the white
  ring they sit in. The offset is written straight onto the element as two custom properties, so a pointer
  moving at 60Hz does not re-render the page.
- `prefers-reduced-motion` switches the blink, the bob and the hop off with every other animation in the app.
  The pupils still follow the pointer: that is a position, not a tween, and it is what the pet has left to say
  in a window where nothing may move.
- `/pet` is still an ordinary route. In a browser tab the penguin draws, blinks, follows the pointer and hops
  when clicked; dragging it does nothing, because a browser ignores `moveBy` on a window a script did not open
  and there is no window there for the page to move.

## Compatibility

- No API, preference, wire-format or dependency change: the pet window, the `/pet` route, the `showPet`
  preference and the shell's own smoke run are all as they were, and the drag no longer depends on
  `-webkit-app-region` for the pet to be movable.
