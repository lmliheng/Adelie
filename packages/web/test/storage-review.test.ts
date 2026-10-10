/**
 * The bill's bookkeeping (features/settings/storage-review.ts), pinned by value.
 *
 * The page's whole safety argument is that a click cannot widen what moves, so the three things
 * that decide it are checked here rather than trusted to the component's rendering:
 *
 * - **the default is nothing.** A bill arrives with an empty selection, and an empty selection
 *   cannot become a request at all (the apply body is null rather than "everything");
 * - **"select all of this class" takes only what may move.** The rows this version can only
 *   report stay out of it, and so do the pinned ones — the server refuses an apply containing a
 *   pinned path as a whole, so a button that took one would lose the rest of the click;
 * - **the request says what was read.** The fingerprint sent back is the bill's own, and the
 *   paths are the bill's rows in the bill's order, so two builds of the same selection are the
 *   same request whatever order the boxes were ticked in.
 *
 * The rows are written out rather than derived, so a row or a class the API adds shows up here as
 * a failing expectation instead of passing quietly.
 */
import { describe, expect, it } from "vitest";
import {
  NO_SELECTION,
  storageApplyBody,
  storageBillGroups,
  storageClassFullySelected,
  storageMovableEntries,
  storageOpenPlan,
  storageSelectClass,
  storageSelectionTotals,
  storageTogglePath,
  storageUnselectClass,
} from "../src/features/settings/storage-review";
import type { StoragePlanEntryView, StoragePlanView } from "@lmliheng/penguin-server/api";

const tmp1 = "proj/agents/docs/workspaces/tmp-11111111";
const tmp2 = "proj/agents/docs/workspaces/tmp-22222222";
const drafts = "proj/agents/docs/scratchpad/session-2026-10-01-10-00-00-aaaaaaaa";
const trace = "proj/agents/docs/traces/session-2026-10-01-10-00-00-aaaaaaaa";

/** One bill row, with only the fields a test cares about spelled out. */
function row(over: Partial<StoragePlanEntryView> & { path: string }): StoragePlanEntryView {
  return {
    class: "tmp_workspaces",
    bytes: 1_000,
    files: 3,
    lastModifiedAt: "2026-10-01T10:00:00.000Z",
    rules: ["unreferenced"],
    fingerprint: "fp-row",
    executable: true,
    ...over,
  };
}

/** A bill of two movable temporary Workspaces, one draft row and one trace row (both report-only). */
function bill(over: Partial<StoragePlanView> = {}): StoragePlanView {
  return {
    id: "2026-10-10-09-12-00-4f2a1c",
    root: "/home/demo/.adelie/data",
    createdAt: "2026-10-10T09:12:00.000Z",
    expiresAt: "2026-10-11T09:12:00.000Z",
    fingerprint: "fp-bill",
    totalBytes: 2_000 + 700 + 500 + 100,
    entries: [
      row({ path: tmp1, bytes: 2_000, files: 4 }),
      row({ path: tmp2, bytes: 700, files: 2 }),
      row({
        path: drafts,
        class: "session_drafts",
        bytes: 500,
        files: 1,
        rules: ["orphan"],
        executable: false,
      }),
      row({
        path: trace,
        class: "traces",
        bytes: 100,
        files: 1,
        rules: ["idle"],
        executable: false,
      }),
    ],
    excluded: [],
    executableClasses: ["tmp_workspaces"],
    appliedAt: null,
    appliedPaths: [],
    usable: true,
    expired: false,
    ...over,
  };
}

const EMPTY_PINS: ReadonlySet<string> = new Set<string>();

describe("storageBillGroups", () => {
  it("groups the bill by class, biggest class first and biggest row first inside it", () => {
    const groups = storageBillGroups(bill());
    expect(groups.map((group) => group.class)).toEqual([
      "tmp_workspaces",
      "session_drafts",
      "traces",
    ]);
    expect(groups[0]!.entries.map((entry) => entry.path)).toEqual([tmp1, tmp2]);
    expect(groups[0]!.bytes).toBe(2_700);
    expect(groups[0]!.files).toBe(6);
    // A class's figure is its own rows summed, never the report's number for the class: a bill
    // accounts for part of a class, and a group claiming the class total would overstate it.
    expect(groups.reduce((sum, group) => sum + group.bytes, 0)).toBeLessThanOrEqual(
      bill().totalBytes,
    );
  });

  it("orders two classes that account for the same size by id, not by the order they arrived", () => {
    const plan = bill({
      entries: [
        row({ path: trace, class: "traces", bytes: 400, executable: false }),
        row({ path: tmp1, bytes: 400 }),
      ],
    });
    expect(storageBillGroups(plan).map((group) => group.class)).toEqual([
      "tmp_workspaces",
      "traces",
    ]);
    const reversed = bill({
      entries: [
        row({ path: tmp1, bytes: 400 }),
        row({ path: trace, class: "traces", bytes: 400, executable: false }),
      ],
    });
    expect(storageBillGroups(reversed).map((group) => group.class)).toEqual([
      "tmp_workspaces",
      "traces",
    ]);
  });

  it("says nothing at all for a bill that found nothing", () => {
    expect(storageBillGroups(bill({ entries: [] }))).toEqual([]);
  });
});

describe("the selection", () => {
  it("starts empty, and copying it never mutates the shared default", () => {
    expect(NO_SELECTION.size).toBe(0);
    const next = storageTogglePath(bill(), NO_SELECTION, tmp1, EMPTY_PINS);
    expect([...next]).toEqual([tmp1]);
    expect(NO_SELECTION.size).toBe(0);
  });

  it("takes a row, and gives it back when the box is clicked again", () => {
    const plan = bill();
    const ticked = storageTogglePath(plan, NO_SELECTION, tmp1, EMPTY_PINS);
    expect(storageSelectionTotals(plan, ticked, EMPTY_PINS)).toEqual({ entries: 1, bytes: 2_000 });
    expect(storageTogglePath(plan, ticked, tmp1, EMPTY_PINS).size).toBe(0);
  });

  it("refuses a row this version can only report, and one that is pinned", () => {
    const plan = bill();
    const pins = new Set([tmp1]);
    expect([...storageTogglePath(plan, NO_SELECTION, drafts, EMPTY_PINS)]).toEqual([]);
    expect([...storageTogglePath(plan, NO_SELECTION, tmp1, pins)]).toEqual([]);
    // A path that is not on this bill at all is not a selection either: the apply would be
    // refused for naming something the bill never recorded.
    expect([...storageTogglePath(plan, NO_SELECTION, "proj/elsewhere", EMPTY_PINS)]).toEqual([]);
  });

  it("takes a whole class's movable rows and nothing else", () => {
    const plan = bill();
    const selected = storageSelectClass(plan, NO_SELECTION, "tmp_workspaces", EMPTY_PINS);
    expect([...selected].sort()).toEqual([tmp2, tmp1].sort());
    expect(storageClassFullySelected(plan, selected, "tmp_workspaces", EMPTY_PINS)).toBe(true);
    // A class with nothing movable can never read as fully selected: the button it drives would
    // otherwise offer to "clear" a selection that was never possible.
    expect(storageClassFullySelected(plan, selected, "session_drafts", EMPTY_PINS)).toBe(false);
  });

  it("leaves a pinned row out of its class, and out of what is already ticked", () => {
    const plan = bill();
    const pins = new Set([tmp1]);
    const selected = storageSelectClass(plan, NO_SELECTION, "tmp_workspaces", pins);
    expect([...selected]).toEqual([tmp2]);
    expect(storageMovableEntries(plan, pins).map((entry) => entry.path)).toEqual([tmp2]);
    expect(storageSelectionTotals(plan, new Set([tmp1, tmp2]), pins)).toEqual({
      entries: 1,
      bytes: 700,
    });
  });

  it("drops one class without touching another class's ticks", () => {
    const plan = bill();
    const both = storageSelectClass(
      plan,
      storageSelectClass(plan, NO_SELECTION, "tmp_workspaces", EMPTY_PINS),
      "tmp_workspaces",
      EMPTY_PINS,
    );
    expect(both.size).toBe(2);
    const cleared = storageUnselectClass(plan, both, "traces", EMPTY_PINS);
    expect(cleared.size).toBe(2);
    expect(storageUnselectClass(plan, both, "tmp_workspaces", EMPTY_PINS).size).toBe(0);
  });
});

describe("storageApplyBody", () => {
  it("is null while nothing is selected — an empty selection is not 'everything'", () => {
    expect(storageApplyBody(bill(), NO_SELECTION, EMPTY_PINS)).toBeNull();
    expect(storageApplyBody(bill(), new Set([drafts]), EMPTY_PINS)).toBeNull();
  });

  it("carries the displayed bill's own fingerprint and exactly the ticked paths", () => {
    const plan = bill();
    const selection = storageSelectClass(plan, NO_SELECTION, "tmp_workspaces", EMPTY_PINS);
    expect(storageApplyBody(plan, selection, EMPTY_PINS)).toEqual({
      planId: plan.id,
      fingerprint: "fp-bill",
      paths: [tmp1, tmp2],
    });
  });

  it("sends the paths in the bill's order, whatever order they were ticked in", () => {
    const plan = bill();
    const backwards = storageTogglePath(
      plan,
      storageTogglePath(plan, NO_SELECTION, tmp2, EMPTY_PINS),
      tmp1,
      EMPTY_PINS,
    );
    expect(storageApplyBody(plan, backwards, EMPTY_PINS)?.paths).toEqual([tmp1, tmp2]);
  });

  it("never sends a report-only or a pinned path, whatever the selection holds", () => {
    const plan = bill();
    const pins = new Set([tmp2]);
    const selection = new Set([tmp1, tmp2, drafts, trace]);
    expect(storageApplyBody(plan, selection, pins)).toEqual({
      planId: plan.id,
      fingerprint: "fp-bill",
      paths: [tmp1],
    });
  });
});

describe("storageOpenPlan", () => {
  it("adopts the newest bill the server still lets be approved", () => {
    // The list arrives newest first, so the spent one at the head is skipped rather than shown:
    // its boxes could not run, and the bill below it is the one a reviewer can still approve.
    const open = bill({ id: "newer" });
    expect(
      storageOpenPlan([
        bill({ id: "applied", appliedAt: "2026-10-10T10:00:00.000Z", usable: false }),
        open,
        bill({ id: "older" }),
      ]),
    ).toBe(open);
  });

  it("adopts nothing when every recent bill is spent, expired, or absent", () => {
    expect(
      storageOpenPlan([
        bill({ id: "applied", appliedAt: "2026-10-10T10:00:00.000Z", usable: false }),
        bill({ id: "expired", expired: true, usable: false }),
      ]),
    ).toBeNull();
    expect(storageOpenPlan([])).toBeNull();
  });
});
