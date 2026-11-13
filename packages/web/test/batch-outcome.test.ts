/**
 * `lib/batch-outcome.ts` — how a batch action's per-row outcomes are read.
 *
 * The batch bar has no bulk route: it sends one request per ticked conversation, so a batch can
 * land halfway. Reading those as a whole (`Promise.all`) would drop the rows that did land behind
 * the first one that did not, and the list would then disagree with the server about rows nobody
 * touched. The splitter is what both the archive and the delete read their outcome through, so it
 * is pinned here: which rows landed (with what their request answered), which did not, and the one
 * reason a host has room for.
 */
import { describe, expect, it } from "vitest";
import { splitBatchOutcome } from "../src/lib/batch-outcome";
import type { SessionInfo } from "@adelie/server/api";

/** A row of the sidebar list, as far as a batch is concerned: only the id is read. */
const row = (sessionId: string): SessionInfo => ({ sessionId }) as SessionInfo;

const targets = [row("a"), row("b"), row("c")];

describe("splitBatchOutcome", () => {
  it("gives each row the answer its own request produced", () => {
    const outcome = splitBatchOutcome(targets, [
      { status: "fulfilled", value: "A" },
      { status: "fulfilled", value: "B" },
      { status: "fulfilled", value: "C" },
    ]);
    expect(outcome.landed.map((entry) => entry.target.sessionId)).toEqual(["a", "b", "c"]);
    expect(outcome.landed.map((entry) => entry.value)).toEqual(["A", "B", "C"]);
    expect(outcome.refused).toEqual([]);
    expect(outcome.firstReason).toBeUndefined();
  });

  it("keeps the landed rows of a batch a refusal cut in half", () => {
    const refusedReason = new Error("session store is read-only");
    const outcome = splitBatchOutcome(targets, [
      { status: "fulfilled", value: "A" },
      { status: "rejected", reason: refusedReason },
      { status: "fulfilled", value: "C" },
    ]);
    // The one that landed AFTER the refusal is still a landed row: its write already happened.
    expect(outcome.landed.map((entry) => entry.target.sessionId)).toEqual(["a", "c"]);
    expect(outcome.refused.map((entry) => entry.sessionId)).toEqual(["b"]);
    expect(outcome.firstReason).toBe(refusedReason);
  });

  it("keeps the FIRST refusal's reason — the one reason a host has room for", () => {
    const first = new Error("first");
    const outcome = splitBatchOutcome(targets, [
      { status: "rejected", reason: first },
      { status: "rejected", reason: new Error("second") },
      { status: "rejected", reason: new Error("third") },
    ]);
    expect(outcome.landed).toEqual([]);
    expect(outcome.refused.map((entry) => entry.sessionId)).toEqual(["a", "b", "c"]);
    expect(outcome.firstReason).toBe(first);
  });

  it("treats a batch refused whole as every row still there", () => {
    const outcome = splitBatchOutcome([row("only")], [{ status: "rejected", reason: "nope" }]);
    expect(outcome.refused.map((entry) => entry.sessionId)).toEqual(["only"]);
    expect(outcome.firstReason).toBe("nope");
  });

  it("counts a short result list as only what it answers for (no invented outcome)", () => {
    const outcome = splitBatchOutcome(targets, [{ status: "fulfilled", value: "A" }]);
    expect(outcome.landed.map((entry) => entry.target.sessionId)).toEqual(["a"]);
    expect(outcome.refused).toEqual([]);
    expect(outcome.firstReason).toBeUndefined();
  });

  it("does nothing with a result that has no row to belong to", () => {
    const outcome = splitBatchOutcome(targets, [
      { status: "fulfilled", value: "A" },
      { status: "fulfilled", value: "B" },
      { status: "fulfilled", value: "C" },
      { status: "rejected", reason: new Error("stray") },
    ]);
    expect(outcome.landed).toHaveLength(3);
    expect(outcome.refused).toEqual([]);
    expect(outcome.firstReason).toBeUndefined();
  });
});
