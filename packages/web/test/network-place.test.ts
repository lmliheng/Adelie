/**
 * The Network panel's place across a layout move (features/network/network-place.ts): what a body
 * that arrives on the other dock surface is handed back, and what it deliberately is not.
 *
 * - A place is restored only from a body on a DIFFERENT surface: that is what tells a move apart
 *   from a tab reopened or a conversation switched back to, which start the panel over.
 * - A record handed out is a copy: the arriving body's own reads and writes must not reach into
 *   the stored one.
 * - A place that is exactly where the panel opens by itself (no search word, "this reply", every
 *   type, the list) is dropped rather than kept.
 * - Places belong to one conversation each.
 */
import { describe, expect, it } from "vitest";
import { recallNetworkPlace, rememberNetworkPlace } from "../src/features/network/network-place";
import type { NetworkPlace } from "../src/features/network/network-place";

const moved: NetworkPlace = {
  surface: "right",
  scope: "recent",
  type: "stream",
  query: "stream",
  pinnedTurn: null,
  openId: 7,
  tab: "response",
};

describe("the Network panel's place", () => {
  it("comes back only from another surface", () => {
    rememberNetworkPlace("n-move", moved);

    expect(recallNetworkPlace("n-move", "right")).toBeNull();
    expect(recallNetworkPlace("n-move", "bottom")).toEqual(moved);
    expect(recallNetworkPlace("n-move", "merged")).toEqual(moved);
  });

  it("has nothing for a conversation that never left a place", () => {
    expect(recallNetworkPlace("n-none", "merged")).toBeNull();
  });

  it("hands out a copy, so the arriving body's writes stay its own", () => {
    rememberNetworkPlace("n-copy", moved);

    const first = recallNetworkPlace("n-copy", "bottom");
    expect(first).not.toBeNull();
    first!.query = "";
    first!.openId = null;

    expect(recallNetworkPlace("n-copy", "bottom")).toEqual(moved);
  });

  it("keeps the newest write, including the surface it was made on", () => {
    // A body that arrived with a place stamps the record with its own surface: the next crossing,
    // back the other way, must find a place rather than "same surface, start over".
    rememberNetworkPlace("n-back", moved);
    rememberNetworkPlace("n-back", { ...moved, surface: "bottom", tab: "request" });

    expect(recallNetworkPlace("n-back", "bottom")).toBeNull();
    expect(recallNetworkPlace("n-back", "right")).toEqual({
      ...moved,
      surface: "bottom",
      tab: "request",
    });
  });

  it("drops a place that is exactly where the panel opens by itself", () => {
    rememberNetworkPlace("n-fresh", moved);
    rememberNetworkPlace("n-fresh", {
      surface: "right",
      scope: "turn",
      type: "all",
      query: "",
      pinnedTurn: null,
      openId: null,
      tab: "overview",
    });

    expect(recallNetworkPlace("n-fresh", "bottom")).toBeNull();
  });

  it("keeps a search word on its own, with every other control where it started", () => {
    rememberNetworkPlace("n-query", {
      surface: "right",
      scope: "turn",
      type: "all",
      query: "todos",
      pinnedTurn: null,
      openId: null,
      tab: "overview",
    });

    expect(recallNetworkPlace("n-query", "bottom")).toEqual({
      surface: "right",
      scope: "turn",
      type: "all",
      query: "todos",
      pinnedTurn: null,
      openId: null,
      tab: "overview",
    });
  });

  it("keeps one place per conversation", () => {
    rememberNetworkPlace("n-a", moved);
    rememberNetworkPlace("n-b", { ...moved, query: "goal", openId: null });

    expect(recallNetworkPlace("n-a", "bottom")?.query).toBe("stream");
    expect(recallNetworkPlace("n-b", "bottom")?.query).toBe("goal");
  });
});
