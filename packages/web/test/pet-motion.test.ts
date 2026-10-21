/**
 * The pet's pointer arithmetic: what a drag is, and where its pupils look.
 *
 * The two behaviours this decides are the ones a person notices immediately and cannot be argued
 * with: whether pressing on the penguin moves it or opens its panel, and whether its eyes follow
 * the pointer. Both are thresholds, so both are pinned here at the boundary rather than only in
 * the middle — a slop that drifts by a pixel is a click that moves the window.
 */
import { describe, expect, it } from "vitest";
import {
  DRAG_SLOP_PX,
  PUPIL_MAX,
  petDrag,
  petStep,
  pupilShift,
} from "../src/features/pet/pet-motion.js";

describe("petStep", () => {
  it("is the movement between the two samples, in the direction it happened", () => {
    expect(petStep({ x: 100, y: 200 }, { x: 130, y: 190 })).toEqual({ x: 30, y: -10 });
    expect(petStep({ x: 100, y: 200 }, { x: 100, y: 200 })).toEqual({ x: 0, y: 0 });
    expect(petStep({ x: 100, y: 200 }, { x: 100, y: 207 })).toEqual({ x: 0, y: 7 });
  });
});

describe("petDrag", () => {
  it("is not a drag while the press stays put", () => {
    expect(petDrag({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false);
  });

  it("is not a drag within the slop, on either axis or both", () => {
    expect(petDrag({ x: 10, y: 10 }, { x: 10 + DRAG_SLOP_PX, y: 10 })).toBe(false);
    expect(petDrag({ x: 10, y: 10 }, { x: 10, y: 10 - DRAG_SLOP_PX })).toBe(false);
    expect(petDrag({ x: 10, y: 10 }, { x: 10 + DRAG_SLOP_PX, y: 10 + DRAG_SLOP_PX })).toBe(false);
  });

  it("is a drag one pixel past the slop, on either axis, in either direction", () => {
    expect(petDrag({ x: 10, y: 10 }, { x: 10 + DRAG_SLOP_PX + 1, y: 10 })).toBe(true);
    expect(petDrag({ x: 10, y: 10 }, { x: 10, y: 10 + DRAG_SLOP_PX + 1 })).toBe(true);
    expect(petDrag({ x: 10, y: 10 }, { x: 10 - DRAG_SLOP_PX - 1, y: 10 })).toBe(true);
    expect(petDrag({ x: 10, y: 10 }, { x: 10, y: 10 - DRAG_SLOP_PX - 1 })).toBe(true);
  });
});

describe("pupilShift", () => {
  it("looks straight ahead for a pointer on the pet", () => {
    expect(pupilShift(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("slides proportionally while the pointer is inside the pet's own box", () => {
    expect(pupilShift(0.5, -0.5)).toEqual({ x: PUPIL_MAX.x / 2, y: -PUPIL_MAX.y / 2 });
  });

  it("stops at the edge of the ring however far the pointer goes", () => {
    expect(pupilShift(1, 1)).toEqual({ x: PUPIL_MAX.x, y: PUPIL_MAX.y });
    expect(pupilShift(40, -40)).toEqual({ x: PUPIL_MAX.x, y: -PUPIL_MAX.y });
  });

  it("clamps the two axes on their own, so a wide window is not a tall one", () => {
    expect(pupilShift(40, 0.5)).toEqual({ x: PUPIL_MAX.x, y: PUPIL_MAX.y / 2 });
  });
});
