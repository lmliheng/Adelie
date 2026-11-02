/**
 * The picture's coordinates: how a pointer in the frame becomes a coordinate the page on the
 * server understands. The cases that matter are the ones where the box and the page are not the
 * same shape — a click there must still land on what the person aimed at.
 */
import { describe, expect, it } from "vitest";
import { pointerToPagePoint } from "../src/features/server-browser/frame-geometry";

const PAGE = { width: 1280, height: 800 };

describe("pointerToPagePoint", () => {
  it("is the identity when the page is drawn at its own size", () => {
    const box = { left: 100, top: 50, width: 1280, height: 800 };
    expect(pointerToPagePoint(PAGE, box, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(pointerToPagePoint(PAGE, box, 420, 210)).toEqual({ x: 320, y: 160 });
    expect(pointerToPagePoint(PAGE, box, 1379, 849)).toEqual({ x: 1279, y: 799 });
  });

  it("scales down, so a shrunken picture still points at the same place", () => {
    // Half size: the same page point is half as far from the box's corner.
    const box = { left: 0, top: 0, width: 640, height: 400 };
    expect(pointerToPagePoint(PAGE, box, 320, 200)).toEqual({ x: 640, y: 400 });
  });

  it("accounts for the letterbox when the box is taller than the page", () => {
    // 1280x800 into a 1280x1000 box: drawn 1280x800, centred, so 100px of margin top and bottom.
    const box = { left: 0, top: 0, width: 1280, height: 1000 };
    expect(pointerToPagePoint(PAGE, box, 0, 100)).toEqual({ x: 0, y: 0 });
    expect(pointerToPagePoint(PAGE, box, 640, 100)).toEqual({ x: 640, y: 0 });
    // Inside the top margin: the nearest edge, never a coordinate off the page.
    expect(pointerToPagePoint(PAGE, box, 640, 20)).toEqual({ x: 640, y: 0 });
    expect(pointerToPagePoint(PAGE, box, 640, 980)).toEqual({ x: 640, y: 799 });
  });

  it("accounts for the letterbox when the box is wider than the page", () => {
    // 1280x800 into a 1600x800 box: drawn 1280x800, centred, so 160px of margin each side.
    const box = { left: 0, top: 0, width: 1600, height: 800 };
    expect(pointerToPagePoint(PAGE, box, 160, 0)).toEqual({ x: 0, y: 0 });
    expect(pointerToPagePoint(PAGE, box, 1600, 800)).toEqual({ x: 1279, y: 799 });
  });

  it("has nothing to say before a picture has arrived or before the box has a size", () => {
    const box = { left: 0, top: 0, width: 640, height: 400 };
    expect(pointerToPagePoint({ width: 0, height: 0 }, box, 10, 10)).toBeNull();
    expect(pointerToPagePoint(PAGE, { left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toBeNull();
  });

  it("keeps two decimal places, which is finer than a pixel of the page", () => {
    // 1280x800 fits a 600x400 box at 0.46875 — its width exactly, so 12.5px of margin above and
    // below — and neither the offset nor the division lands on a whole page pixel.
    const box = { left: 0, top: 0, width: 600, height: 400 };
    expect(pointerToPagePoint(PAGE, box, 100, 100)).toEqual({ x: 213.33, y: 186.67 });
  });
});
