/**
 * The Trace panel's place across a layout move (features/traces/trace-place.ts): what a body that
 * arrives on the other dock surface is handed back, and what it deliberately is not.
 *
 * - A place is restored only from a body on a DIFFERENT surface: that is what tells a move apart
 *   from a tab reopened or a conversation switched back to, which start the panel over.
 * - A record handed out is a copy: the arriving body's own reads and writes must not reach into
 *   the stored one.
 * - A place that is exactly where the panel opens by itself (no round open, at the top, on the
 *   newest shard) is dropped rather than kept.
 */
import { describe, expect, it } from "vitest";
import { recallTracePlace, rememberTracePlace } from "../src/features/traces/trace-place";

describe("the Trace panel's place", () => {
  it("comes back only from another surface", () => {
    rememberTracePlace("s-move", {
      surface: "right",
      expanded: [0],
      scrollTop: 320,
      fileIndex: null,
    });

    expect(recallTracePlace("s-move", "right")).toBeNull();
    expect(recallTracePlace("s-move", "merged")).toEqual({
      surface: "right",
      expanded: [0],
      scrollTop: 320,
      fileIndex: null,
    });
  });

  it("has nothing for a conversation that never left a place", () => {
    expect(recallTracePlace("s-none", "merged")).toBeNull();
  });

  it("hands out a copy, so the arriving body's writes stay its own", () => {
    rememberTracePlace("s-copy", {
      surface: "merged",
      expanded: [2, 3],
      scrollTop: 120,
      fileIndex: null,
    });

    const first = recallTracePlace("s-copy", "right");
    expect(first).not.toBeNull();
    first!.expanded.push(4);
    first!.scrollTop = 0;

    expect(recallTracePlace("s-copy", "right")).toEqual({
      surface: "merged",
      expanded: [2, 3],
      scrollTop: 120,
      fileIndex: null,
    });
  });

  it("keeps the newest write, including the surface it was made on", () => {
    // A body that arrived with a place stamps the record with its own surface: the next crossing,
    // back the other way, must find a place rather than "same surface, start over".
    rememberTracePlace("s-stamp", {
      surface: "right",
      expanded: [1],
      scrollTop: 200,
      fileIndex: 1,
    });
    const arrived = recallTracePlace("s-stamp", "merged")!;
    rememberTracePlace("s-stamp", { ...arrived, surface: "merged" });

    expect(recallTracePlace("s-stamp", "merged")).toBeNull();
    expect(recallTracePlace("s-stamp", "right")).toEqual({
      surface: "merged",
      expanded: [1],
      scrollTop: 200,
      fileIndex: 1,
    });
  });

  it("drops a place that is where the panel opens by itself", () => {
    rememberTracePlace("s-empty", {
      surface: "right",
      expanded: [0],
      scrollTop: 10,
      fileIndex: null,
    });
    expect(recallTracePlace("s-empty", "merged")).not.toBeNull();

    rememberTracePlace("s-empty", {
      surface: "merged",
      expanded: [],
      scrollTop: 0,
      fileIndex: null,
    });
    expect(recallTracePlace("s-empty", "right")).toBeNull();
  });

  it("keeps a place that only scrolled, and one that only opened a round", () => {
    rememberTracePlace("s-scroll", {
      surface: "right",
      expanded: [],
      scrollTop: 40,
      fileIndex: null,
    });
    expect(recallTracePlace("s-scroll", "merged")?.scrollTop).toBe(40);

    rememberTracePlace("s-rounds", {
      surface: "right",
      expanded: [7],
      scrollTop: 0,
      fileIndex: null,
    });
    expect(recallTracePlace("s-rounds", "merged")?.expanded).toEqual([7]);
  });

  it("keeps a place that only picked another shard, and drops it once the newest is back", () => {
    // A Session that compacted has several Trace files and the panel opens on the newest one, so a
    // reader who picked an older shard and changed nothing else is still somewhere worth returning
    // to — while picking the newest back leaves "where the panel opens by itself" (null = default).
    rememberTracePlace("s-shard", { surface: "right", expanded: [], scrollTop: 0, fileIndex: 2 });
    expect(recallTracePlace("s-shard", "merged")?.fileIndex).toBe(2);

    rememberTracePlace("s-shard", {
      surface: "merged",
      expanded: [],
      scrollTop: 0,
      fileIndex: null,
    });
    expect(recallTracePlace("s-shard", "right")).toBeNull();
  });
});
