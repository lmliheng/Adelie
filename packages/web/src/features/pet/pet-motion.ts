/**
 * The arithmetic behind the pet's two pointer-driven motions: moving its window, and the eyes
 * following the pointer.
 *
 * Both are pure functions of pointer positions, kept out of pet-page.tsx because that file is React
 * state and HTTP reads, while this is the part worth a unit test:
 *
 * - the slop that tells a drag from a click. Getting it wrong is what makes a companion annoying in
 *   both directions: a couple of pixels of shake while pressing would move the window instead of
 *   opening the panel, and a drag would end by opening the panel on top of wherever the pet was
 *   put.
 * - the clamp that keeps the pupils inside the white ring they sit in, whatever the pointer does.
 *
 * The frame is the screen, not the page: the window moves, and a drag measured in client
 * coordinates would feed its own movement back into the gesture (the page slides under a pointer
 * that has not moved). `screenX`/`screenY` are unaffected by the window's own position, so the
 * numbers here stay the pointer's own.
 */

/** A pointer sample in screen coordinates. */
export interface PetPoint {
  x: number;
  y: number;
}

/**
 * How far a press may travel before it is a drag, in CSS px on either axis. Four is small enough
 * that the smallest deliberate drag is read as one, and wide enough that a hand pressing a 72px
 * penguin can shake without meaning to move it — the same order Chromium's own drag slop uses.
 */
export const DRAG_SLOP_PX = 4;

/**
 * How far the pupils slide off centre, in the penguin's own SVG units (its viewBox is 100 units
 * wide). The pupil's radius is 2.6 and the white ring's is 5.5, so this is close to as far as they
 * can go without touching the ring — and as far as they should: the penguin is drawn 72px wide, so
 * a unit here is most of a pixel, and a glance that could not be seen would not be a glance.
 */
export const PUPIL_MAX = { x: 2.2, y: 1.6 } as const;

/** The movement between two samples: exactly what the window is moved by. */
export function petStep(from: PetPoint, to: PetPoint): PetPoint {
  return { x: to.x - from.x, y: to.y - from.y };
}

/** Whether a press that began at `start` and has reached `at` is a drag rather than a click. */
export function petDrag(start: PetPoint, at: PetPoint): boolean {
  const step = petStep(start, at);
  return Math.max(Math.abs(step.x), Math.abs(step.y)) > DRAG_SLOP_PX;
}

/**
 * Where the pupils sit for a pointer that is off the pet's centre by `dx` and `dy`, each given as a
 * fraction of the pet's own half-width and half-height — so 1 is beside it, 2 is a screen away, and
 * the sign is the direction. Both axes clamp on their own, which is what keeps the offset inside
 * the ring on a wide window as well as a tall one.
 */
export function pupilShift(dx: number, dy: number): PetPoint {
  const slide = (value: number, max: number) => Math.max(-max, Math.min(max, value * max));
  return { x: slide(dx, PUPIL_MAX.x), y: slide(dy, PUPIL_MAX.y) };
}
