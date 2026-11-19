/**
 * One-shot commands handed to the dock panel bodies, claimed once
 * (src/features/chat/dock-command-once.ts).
 *
 * The page creates a command object per click and keeps it standing; the bodies that obey them
 * are remounted whenever the layout moves the panel between the desktop side column and the
 * narrow merged surface. Before the claim lived at module scope, each body held its own ref, so
 * the fresh mount forgot what the old one had already done and ran the command again — measured
 * in the browser: the Files panel reopened the file the reader had closed, and the Memory panel
 * went back to the memory it had been walked out of. What this file pins is the rule itself:
 * one object, one run, however many mounts see it.
 */
import { describe, expect, it, vi } from "vitest";

describe("dock command once", () => {
  it("runs a command on the first claim and not on the remount that follows", async () => {
    const { claimOnce } = await import("../src/features/chat/dock-command-once");
    const command = { path: "demo.html" };
    expect(claimOnce(command)).toBe(true);
    expect(claimOnce(command)).toBe(false); // the second mount, seeing the same object
    expect(claimOnce(command)).toBe(false);
  });

  it("gives every click its own claim", async () => {
    const { claimOnce } = await import("../src/features/chat/dock-command-once");
    const first = { path: "demo.html" };
    const second = { path: "demo.html" }; // clicking the same file again is a new command
    expect(claimOnce(first)).toBe(true);
    expect(claimOnce(second)).toBe(true);
    expect(claimOnce(first)).toBe(false);
  });

  it("claims objects of every command shape independently (a memory target, a child session)", async () => {
    const { claimOnce } = await import("../src/features/chat/dock-command-once");
    const memory = { target: { scope: "user", file: "probe.md" } };
    const focus = { sessionId: "child-1", origin: ["child-1"] };
    expect(claimOnce(memory)).toBe(true);
    expect(claimOnce(focus)).toBe(true);
    expect(claimOnce(memory)).toBe(false);
    expect(claimOnce(focus)).toBe(false);
  });

  it("forgets everything on a reload (a fresh module is a fresh tab)", async () => {
    const before = await import("../src/features/chat/dock-command-once");
    const command = { path: "demo.html" };
    expect(before.claimOnce(command)).toBe(true);

    vi.resetModules();
    const after = await import("../src/features/chat/dock-command-once");
    expect(after.claimOnce(command)).toBe(true);
  });
});
