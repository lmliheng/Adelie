/**
 * The window's own title bar, handed to the page (src/title-bar.ts): the pure decisions behind
 * the shell's half of it.
 *
 * Three rules are worth pinning. Only Windows and Linux hand the caption over — macOS keeps the
 * traffic lights' strip, so its window options ask for nothing and its status tells the page to
 * draw nothing. The height is the caption's own 32 CSS pixels, and travels in the status so the
 * page and the overlay agree on it. And a relayed command is read only when it is one: the
 * discriminator decides, each colour is a string or dropped, and a command carrying neither is
 * nothing to apply rather than a frame to hand an empty overlay to.
 */
import { describe, expect, it } from "vitest";
import {
  TITLE_BAR_HEIGHT,
  overlayOptionsFor,
  parseTitleBarCommand,
  supportsTitleBarOverlay,
  titleBarStatusMessage,
  titleBarWindowOptions,
} from "../src/title-bar.js";

describe("supportsTitleBarOverlay", () => {
  it("is the two platforms whose window manager has the Window Controls Overlay", () => {
    expect(supportsTitleBarOverlay("win32")).toBe(true);
    expect(supportsTitleBarOverlay("linux")).toBe(true);
    // macOS keeps the traffic lights' strip; the shell leaves its caption alone there.
    for (const platform of ["darwin", "freebsd", "openbsd", "sunos", "aix"] as NodeJS.Platform[]) {
      expect(supportsTitleBarOverlay(platform), platform).toBe(false);
    }
  });
});

describe("titleBarWindowOptions", () => {
  it("hides the caption and keeps the controls as an overlay, on the supported platforms", () => {
    for (const platform of ["win32", "linux"] as NodeJS.Platform[]) {
      expect(titleBarWindowOptions(platform), platform).toEqual({
        titleBarStyle: "hidden",
        titleBarOverlay: { height: TITLE_BAR_HEIGHT },
      });
    }
  });

  it("asks for nothing where the caption stays — an empty spread changes no window option", () => {
    expect(titleBarWindowOptions("darwin")).toEqual({});
  });
});

describe("titleBarStatusMessage", () => {
  it("tells the page whether to draw a strip, and how tall, on the supported platforms", () => {
    expect(titleBarStatusMessage("win32")).toEqual({
      type: "desktop-titlebar-status",
      status: { enabled: true, height: TITLE_BAR_HEIGHT },
    });
    // The height is the caption's own 32 CSS pixels, the same number the overlay was given.
    expect(TITLE_BAR_HEIGHT).toBe(32);
  });

  it("tells the page to draw nothing where the native caption is still there", () => {
    expect(titleBarStatusMessage("darwin")).toEqual({
      type: "desktop-titlebar-status",
      status: { enabled: false, height: TITLE_BAR_HEIGHT },
    });
  });
});

describe("parseTitleBarCommand", () => {
  it("reads a well-formed command, passing colour strings through as written", () => {
    expect(
      parseTitleBarCommand({
        type: "desktop-titlebar-command",
        color: "rgb(20, 20, 20)",
        symbolColor: "#eee",
      }),
    ).toEqual({ color: "rgb(20, 20, 20)", symbolColor: "#eee" });
  });

  it("keeps only the fields it can read; an ill-typed colour is dropped, not guessed", () => {
    expect(parseTitleBarCommand({ type: "desktop-titlebar-command", color: "#000" })).toEqual({
      color: "#000",
    });
    expect(
      parseTitleBarCommand({ type: "desktop-titlebar-command", color: 0, symbolColor: null }),
    ).toEqual({});
  });

  it("returns null for anything that is not a title-bar command", () => {
    for (const data of [
      null,
      "command",
      42,
      {},
      { type: "desktop-pet-command", showPet: true },
      { type: "desktop-titlebar-status", status: { enabled: true, height: 32 } },
    ]) {
      expect(parseTitleBarCommand(data), JSON.stringify(data)).toBeNull();
    }
  });
});

describe("overlayOptionsFor", () => {
  it("builds the options a window's overlay is re-coloured with", () => {
    expect(overlayOptionsFor({ color: "#111", symbolColor: "#fff" })).toEqual({
      color: "#111",
      symbolColor: "#fff",
    });
    // A one-colour command changes one thing: the field it does not carry must not be sent as
    // undefined, which Electron reads as "no colour".
    expect(overlayOptionsFor({ color: "#111" })).toEqual({ color: "#111" });
    expect(overlayOptionsFor({ symbolColor: "#fff" })).toEqual({ symbolColor: "#fff" });
  });

  it("has nothing to apply when the command carried nothing", () => {
    expect(overlayOptionsFor({})).toBeNull();
  });
});
