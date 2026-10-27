# Scrolling up in a conversation no longer bounces back down while a reply streams

- **Date:** 2026-10-27
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-27-chat-scroll-up-bounce.zh.md)

While a reply was streaming, wheeling up from the bottom of the conversation was often followed by
a small jump back down: the view moved by the text that had just arrived. Following the bottom now
stops at the first tick of an upward wheel and stays off until the reader scrolls back down.

## Details

- The transcript listens for the wheel itself, with a listener that is not passive and never
  prevents the scroll, so the browser hands the page the first tick of a gesture before it scrolls;
  the rest of the gesture stays asynchronous. A stream update arriving in between no longer snaps
  the view back to the bottom under the reader's first upward tick.
- Following resumes only when the reader's own scroll brings the view back within 80px of the
  bottom. The scroll event of an earlier snap, which arrives a frame later with nothing moved, no
  longer turns following back on after the reader has started scrolling up.
- A streaming update, a resize of the transcript and the selection menu closing read where the view
  stands before snapping it (`followToBottom`), so a scroll the browser has made but not yet
  reported (a key, the scrollbar, an outline jump) is left in place instead of being undone.
- The transcript's scroller carries `data-stream-scroll`, which the browser spec below needs: it
  has to watch that element itself, frame by frame.
- `packages/web/e2e/scroll-follow-bounce.spec.mjs` streams a reply in each theme with the renderer
  slowed four times, wheels up from the bottom and records every frame, wheel event and programmatic
  scroll. It fails on a snap that lands after the gesture could already be on screen, on a frame
  showing a snap combined with the gesture, on text moving back up after the gesture moved it down,
  and on any movement in the second after the gesture. It runs on demand, outside CI.
- Ported from upstream `0c7725c2` (#1250), applied as its own change rather than merged. Not taken:
  upstream's `overflow-anchor: none` on `[data-arrive]` — this tree has no per-run arrival elements
  (its `fade` reveal paces a prefix of the reply's text, `packages/ui/src/.../stream-reveal.ts`), and
  measured here the two-state spec shows no anchoring-only drift in Frost without it.

## Compatibility

- No dependency, stored-data or config change. The wheel, touch and scroll paths behave as before
  for a reader at the bottom; only an upward wheel during a stream behaves differently.
