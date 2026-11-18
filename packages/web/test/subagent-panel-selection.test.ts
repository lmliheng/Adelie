/**
 * Which conversation the agents panel shows, kept outside itself
 * (src/features/chat/subagent-panel-selection.ts).
 *
 * The panel body is remounted whenever the layout moves it between the desktop right dock and the
 * narrow merged surface, so the pick held in `selected` died there — measured, before this store
 * existed: after picking the root (or any child other than the auto-focused first one) and
 * crossing the breakpoint, the panel showed a different conversation. The rules this file pins are
 * the ones that keep that fix from inventing state: a pick is per parent conversation, a pick
 * nothing else can render is not restored, and the graph — not the record — says which origin
 * chain the restored conversation runs on.
 */
import { describe, expect, it } from "vitest";
import {
  readSubagentSelection,
  restoreSubagentSelection,
  writeSubagentSelection,
} from "../src/features/chat/subagent-panel-selection";

describe("subagent panel selection", () => {
  it("reads nothing for a conversation that never picked", () => {
    expect(readSubagentSelection("parent-never-seen")).toBeNull();
  });

  it("hands back the pick, for the parent conversation it was made in", () => {
    writeSubagentSelection("parent-a", { sessionId: "child-1", origin: ["child-1"] });
    expect(readSubagentSelection("parent-a")).toEqual({
      sessionId: "child-1",
      origin: ["child-1"],
    });
    expect(readSubagentSelection("parent-b")).toBeNull();
  });

  it("keeps the root pick too (an empty origin chain is still a pick)", () => {
    writeSubagentSelection("parent-root", { sessionId: "root-1", origin: [] });
    expect(readSubagentSelection("parent-root")).toEqual({ sessionId: "root-1", origin: [] });
  });

  it("drops the entry when the pick is cleared", () => {
    writeSubagentSelection("parent-clear", { sessionId: "child-1", origin: ["child-1"] });
    writeSubagentSelection("parent-clear", null);
    expect(readSubagentSelection("parent-clear")).toBeNull();
  });

  it("restores only while the picked conversation is in the displayed Task's graph", () => {
    const remembered = { sessionId: "child-2", origin: ["root-1", "child-2"] };
    expect(
      restoreSubagentSelection(remembered, [
        { sessionId: "root-1", origin: [] },
        { sessionId: "child-2", origin: ["root-1", "child-2"] },
      ]),
    ).toEqual({ sessionId: "child-2", origin: ["root-1", "child-2"] });
    // A Task later than the pick (or a resync into a fresh model) has no such node: the panel
    // falls back to its auto-focus rather than showing a conversation nothing can render.
    expect(restoreSubagentSelection(remembered, [{ sessionId: "root-1", origin: [] }])).toBeNull();
    expect(restoreSubagentSelection(null, [])).toBeNull();
  });

  it("reads the origin chain from the graph, not from the record", () => {
    // The record could be from a stream whose chain was spelled differently; what is rendered
    // is today's node, so the two can never disagree.
    expect(
      restoreSubagentSelection({ sessionId: "child-3", origin: ["stale"] }, [
        { sessionId: "child-3", origin: ["root-1", "child-3"] },
      ]),
    ).toEqual({ sessionId: "child-3", origin: ["root-1", "child-3"] });
  });
});
