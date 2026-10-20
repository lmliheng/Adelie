/**
 * The desktop pet's window: the page it loads, the size it takes, the corner it opens in and
 * the options it is created with.
 *
 * The assertions on the options are the point of the file: each of them is a hole the pet window
 * must not have — a frame around a floating penguin, a window that can be resized into a corner
 * pixel, one that steals the taskbar slot of the app, or one that hands the page Node.
 */
import { describe, expect, it } from "vitest";
import {
  PET_PAGE_PATH,
  PET_WINDOW_MARGIN,
  PET_WINDOW_OPTIONS,
  PET_WINDOW_SIZE,
  petShotPath,
  petWindowPosition,
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
    expect(petShotPath("/tmp/smoke.png")).toBe("/tmp/smoke-pet.png");
    expect(petShotPath("smoke.jpeg")).toBe("smoke-pet.png");
    // No extension, a dot that is only part of a directory name, and a dotfile: the suffix still
    // lands on the file's own name, and the main window's shot is never the one that gets
    // clobbered.
    expect(petShotPath("/tmp/a.b/smoke")).toBe("/tmp/a.b/smoke-pet.png");
    expect(petShotPath("/tmp/rel-0.5.1.png")).toBe("/tmp/rel-0.5.1-pet.png");
    expect(petShotPath("/tmp/.hidden")).toBe("/tmp/.hidden-pet.png");
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
