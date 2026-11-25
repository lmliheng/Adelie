/**
 * The desktop pet's window: the page it loads, the size it takes, the corner it opens in and
 * the options it is created with.
 *
 * The assertions on the options are the point of the file: each of them is a hole the pet window
 * must not have — a frame around a floating penguin, a window that can be resized into a corner
 * pixel, one that steals the taskbar slot of the app, or one that hands the page Node.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PET_CALL_WINDOW_SIZE,
  PET_PAGE_PATH,
  PET_PET_PX,
  PET_SIZES,
  PET_WINDOW_MARGIN,
  PET_WINDOW_OPTIONS,
  PET_WINDOW_SIZE,
  isPetSize,
  petResizedBounds,
  petShotPath,
  petWindowPosition,
  petWindowSize,
  petWindowUrl,
} from "../src/pet-window.js";

describe("petWindowUrl", () => {
  it("points at the pet route on the app's own origin", () => {
    expect(petWindowUrl("http://localhost:4000")).toBe(`http://localhost:4000${PET_PAGE_PATH}`);
    expect(PET_PAGE_PATH).toBe("/pet");
  });
});

describe("petShotPath", () => {
  it("puts the pet's screenshot beside the main window's, never over it", () => {
    // Paths are compared through `path` rather than as POSIX literals: petShotPath builds them with
    // `path.join`, so on Windows the separator is a backslash and a literal would only be right on
    // Linux and macOS (the Windows CI shard caught exactly that).
    const beside = (dir: string, name: string) => path.join(dir, `${name}-pet.png`);
    expect(petShotPath(path.join("/tmp", "smoke.png"))).toBe(beside("/tmp", "smoke"));
    expect(petShotPath("smoke.jpeg")).toBe("smoke-pet.png");
    // No extension, a dot that is only part of a directory name, and a dotfile: the suffix still
    // lands on the file's own name, and the main window's shot is never the one that gets
    // clobbered.
    expect(petShotPath(path.join("/tmp", "a.b", "smoke"))).toBe(
      beside(path.join("/tmp", "a.b"), "smoke"),
    );
    expect(petShotPath(path.join("/tmp", "rel-0.5.1.png"))).toBe(beside("/tmp", "rel-0.5.1"));
    expect(petShotPath(path.join("/tmp", ".hidden"))).toBe(beside("/tmp", ".hidden"));
  });
});

describe("petWindowPosition", () => {
  it("sits in the bottom-right corner of the work area, inset by the margin", () => {
    expect(petWindowPosition({ x: 0, y: 0, width: 1920, height: 1080 })).toEqual({
      x: 1920 - PET_WINDOW_SIZE.width - PET_WINDOW_MARGIN,
      y: 1080 - PET_WINDOW_SIZE.height - PET_WINDOW_MARGIN,
    });
  });

  it("follows a work area that does not start at the origin (a second display, a top panel)", () => {
    expect(petWindowPosition({ x: 1920, y: 24, width: 1280, height: 720 })).toEqual({
      x: 1920 + 1280 - PET_WINDOW_SIZE.width - PET_WINDOW_MARGIN,
      y: 24 + 720 - PET_WINDOW_SIZE.height - PET_WINDOW_MARGIN,
    });
  });

  it("places a call-sized window by the same corner rule", () => {
    expect(
      petWindowPosition({ x: 0, y: 0, width: 1920, height: 1080 }, PET_CALL_WINDOW_SIZE),
    ).toEqual({
      x: 1920 - PET_CALL_WINDOW_SIZE.width - PET_WINDOW_MARGIN,
      y: 1080 - PET_CALL_WINDOW_SIZE.height - PET_WINDOW_MARGIN,
    });
  });
});

describe("petWindowSize", () => {
  it("is the resting size until a call is open, and the stage's while one is", () => {
    expect(petWindowSize(false)).toEqual(PET_WINDOW_SIZE);
    expect(petWindowSize(true)).toEqual(PET_CALL_WINDOW_SIZE);
    // The stage has to have room for a transcript column, which the resting window does not.
    expect(PET_CALL_WINDOW_SIZE.width).toBeGreaterThan(PET_WINDOW_SIZE.width);
    expect(PET_CALL_WINDOW_SIZE.height).toBeGreaterThan(PET_WINDOW_SIZE.height);
  });

  it("grows the resting window with the pet, and leaves the call's size alone", () => {
    // The width is the panel's, not the pet's: it does not move with the size.
    for (const size of PET_SIZES) {
      expect(petWindowSize(false, size).width).toBe(PET_WINDOW_SIZE.width);
    }
    // The height gains exactly what the pet gained over the medium it was measured with.
    expect(petWindowSize(false, "medium")).toEqual(PET_WINDOW_SIZE);
    expect(petWindowSize(false, "small").height).toBe(
      PET_WINDOW_SIZE.height - (PET_PET_PX.medium - PET_PET_PX.small),
    );
    expect(petWindowSize(false, "large").height).toBe(
      PET_WINDOW_SIZE.height + (PET_PET_PX.large - PET_PET_PX.medium),
    );
    // A call is a surface with its own size; the pet's size does not touch it.
    expect(petWindowSize(true, "large")).toEqual(PET_CALL_WINDOW_SIZE);
    expect(petWindowSize(true, "small")).toEqual(PET_CALL_WINDOW_SIZE);
  });
});

describe("isPetSize", () => {
  it("knows the three sizes and nothing else", () => {
    expect(PET_SIZES).toEqual(["small", "medium", "large"]);
    for (const size of PET_SIZES) expect(isPetSize(size)).toBe(true);
    for (const value of ["big", "Medium", "", 72, null, undefined, {}]) {
      expect(isPetSize(value), String(value)).toBe(false);
    }
  });
});

describe("petResizedBounds", () => {
  const work = { x: 0, y: 0, width: 1920, height: 1080 };

  it("grows from the anchored bottom-right corner, not the top-left", () => {
    const resting = { x: 1000, y: 500, ...PET_WINDOW_SIZE };
    const grown = petResizedBounds(resting, PET_CALL_WINDOW_SIZE, work);
    expect(grown).toEqual({
      x: 1000 + PET_WINDOW_SIZE.width - PET_CALL_WINDOW_SIZE.width,
      y: 500 + PET_WINDOW_SIZE.height - PET_CALL_WINDOW_SIZE.height,
      width: PET_CALL_WINDOW_SIZE.width,
      height: PET_CALL_WINDOW_SIZE.height,
    });
    // Right and bottom edges are where the window was; growing moved only the other two.
    expect(grown.x + grown.width).toBe(resting.x + resting.width);
    expect(grown.y + grown.height).toBe(resting.y + resting.height);
  });

  it("returns to the resting size from the call's, and stays inside the work area", () => {
    // A window pushed up against the work area's own corner: the grown rectangle would hang off
    // the right and bottom edges, so it is clamped back in.
    const atCorner = {
      x: 1920 - PET_WINDOW_SIZE.width,
      y: 1080 - PET_WINDOW_SIZE.height,
      ...PET_WINDOW_SIZE,
    };
    const grown = petResizedBounds(atCorner, PET_CALL_WINDOW_SIZE, work);
    expect(grown.x + grown.width).toBeLessThanOrEqual(work.width);
    expect(grown.y + grown.height).toBeLessThanOrEqual(work.height);

    const shrinking = petResizedBounds(grown, PET_WINDOW_SIZE, work);
    expect(shrinking).toEqual({
      x: grown.x + grown.width - PET_WINDOW_SIZE.width,
      y: grown.y + grown.height - PET_WINDOW_SIZE.height,
      width: PET_WINDOW_SIZE.width,
      height: PET_WINDOW_SIZE.height,
    });
  });
});

describe("PET_WINDOW_OPTIONS", () => {
  it("is transparent, frameless, on top, out of the task list, and fixed in size", () => {
    expect(PET_WINDOW_OPTIONS.frame).toBe(false);
    expect(PET_WINDOW_OPTIONS.transparent).toBe(true);
    expect(PET_WINDOW_OPTIONS.backgroundColor).toBe("#00000000");
    expect(PET_WINDOW_OPTIONS.hasShadow).toBe(false);
    expect(PET_WINDOW_OPTIONS.alwaysOnTop).toBe(true);
    expect(PET_WINDOW_OPTIONS.skipTaskbar).toBe(true);
    expect(PET_WINDOW_OPTIONS.resizable).toBe(false);
    expect(PET_WINDOW_OPTIONS.minimizable).toBe(false);
    expect(PET_WINDOW_OPTIONS.maximizable).toBe(false);
    expect(PET_WINDOW_OPTIONS.fullscreenable).toBe(false);
    // Draggable, unlike the size: the page owns where it ends up on screen.
    expect(PET_WINDOW_OPTIONS.movable).toBe(true);
    // Shown only once the page has rendered — a transparent window that paints nothing is a
    // flash of the desktop behind it.
    expect(PET_WINDOW_OPTIONS.show).toBe(false);
    expect(PET_WINDOW_OPTIONS.width).toBe(PET_WINDOW_SIZE.width);
    expect(PET_WINDOW_OPTIONS.height).toBe(PET_WINDOW_SIZE.height);
  });

  it("gives the page a plain browser, like every other window of this app", () => {
    expect(PET_WINDOW_OPTIONS.webPreferences).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
  });
});
