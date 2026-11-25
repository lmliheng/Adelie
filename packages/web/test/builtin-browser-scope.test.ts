/**
 * The conversation the built-in browser acts in (features/builtin-browser/scope.ts): a real
 * Session id while a conversation is on screen, the default scope `""` for a draft, a parked
 * draft row, or a page with no docks. This is what keeps one conversation's browser out of
 * another's: the panel, the pages and every action read it.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { memoryStorage } from "./helpers/storage";

let dock: typeof import("../src/features/dock/dock-state");
let browser: typeof import("../src/features/builtin-browser/scope");

beforeAll(async () => {
  // The dock store reads localStorage at import time; install the storage first.
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  dock = await import("../src/features/dock/dock-state");
  browser = await import("../src/features/builtin-browser/scope");
});

describe("the browser's scope", () => {
  it("is the conversation on screen when one is", () => {
    const session = "session-2026-01-01-00-00-00-abcdef01";
    dock.setDockScope(session);
    expect(browser.browserScope()).toBe(session);
    expect(browser.browserScope()).toBe(dock.currentDockScope());
  });

  it("is the default scope for a draft, a parked draft row, or no conversation", () => {
    dock.setDockScope("new");
    expect(browser.browserScope()).toBe("");
    dock.setDockScope("draft-3");
    expect(browser.browserScope()).toBe("");
    dock.setDockScope(null);
    expect(browser.browserScope()).toBe("");
  });
});
