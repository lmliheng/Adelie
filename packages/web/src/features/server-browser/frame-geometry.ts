/**
 * Where a pointer is, in the page's own coordinates (pure decisions, unit tested).
 *
 * The picture is drawn scaled to fit the box (`object-fit: contain`), so the element's rectangle
 * and the page's are two different things whenever the aspect ratios differ: the drawn part is
 * centred inside the box and there are margins. Every click has to be converted through that, or
 * a click lands somewhere else the moment the box is not exactly the page's shape.
 *
 * The numbers here are the page's: the browser on the server is drawing at `naturalWidth ×
 * naturalHeight` (the viewport it was told), and CDP takes input in those coordinates.
 */

/** The rectangle the picture is drawn into, as the DOM reports it. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The page coordinate `clientX/clientY` points at, or null when there is nothing to convert —
 * no picture has arrived yet, or the box has no size. The result is clamped to the page: a
 * pointer in the letterbox margin belongs to the nearest edge, not to a coordinate off the page.
 */
export function pointerToPagePoint(
  natural: { width: number; height: number },
  box: Box,
  clientX: number,
  clientY: number,
): Point | null {
  if (natural.width < 1 || natural.height < 1) return null;
  if (box.width < 1 || box.height < 1) return null;
  // `contain`: the whole page is visible, scaled by whichever dimension runs out first.
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  if (scale <= 0) return null;
  const left = box.left + (box.width - natural.width * scale) / 2;
  const top = box.top + (box.height - natural.height * scale) / 2;
  const round = (value: number): number => Math.round(value * 100) / 100;
  return {
    x: Math.min(Math.max(round((clientX - left) / scale), 0), natural.width - 1),
    y: Math.min(Math.max(round((clientY - top) / scale), 0), natural.height - 1),
  };
}
