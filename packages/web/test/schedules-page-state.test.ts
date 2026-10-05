/**
 * The scheduled-tasks page's pure rules (src/features/schedules/schedule-page-state.ts): how the
 * Project's one flat list of tasks becomes the page's per-Agent groups, and which Agent comes
 * first.
 */
import { describe, expect, it } from "vitest";
import type { ProjectScheduleItem } from "@lmliheng/penguin-server/api";
import { groupSchedulesByAgent } from "../src/features/schedules/schedule-page-state";

function task(name: string, agentId: string): ProjectScheduleItem {
  return {
    name,
    agentId,
    prompt: "Summarize yesterday",
    enabled: true,
    startAt: "2026-09-01T00:00:00.000Z",
    status: "active",
    queued: false,
  };
}

/** The groups as assertions read them: `agentId` → the names under it. */
const shape = (items: ProjectScheduleItem[], order: string[]) =>
  groupSchedulesByAgent(items, order).map((g) => [g.agentId, g.items.map((i) => i.name)]);

describe("groupSchedulesByAgent", () => {
  it("collects each Agent's tasks under it, in the server's order", () => {
    const items = [task("a", "writer"), task("b", "writer"), task("c", "reviewer")];
    expect(shape(items, ["writer", "reviewer"])).toEqual([
      ["writer", ["a", "b"]],
      ["reviewer", ["c"]],
    ]);
  });

  it("follows the Agent list's order, not the order the tasks arrive in", () => {
    const items = [task("c", "reviewer"), task("a", "writer")];
    expect(shape(items, ["writer", "reviewer"])).toEqual([
      ["writer", ["a"]],
      ["reviewer", ["c"]],
    ]);
  });

  it("omits an Agent with no task rather than drawing an empty group", () => {
    expect(shape([task("a", "writer")], ["writer", "reviewer"])).toEqual([["writer", ["a"]]]);
    expect(shape([], ["writer"])).toEqual([]);
  });

  it("keeps a task whose Agent is not in the list, after the ones that are", () => {
    const items = [task("ghost", "retired"), task("a", "writer")];
    expect(shape(items, ["writer", "reviewer"])).toEqual([
      ["writer", ["a"]],
      ["retired", ["ghost"]],
    ]);
  });

  it("orders the unknown Agents by first appearance, among themselves", () => {
    const items = [task("g1", "b"), task("g2", "a"), task("g3", "b")];
    expect(shape(items, ["writer"])).toEqual([
      ["b", ["g1", "g3"]],
      ["a", ["g2"]],
    ]);
  });

  it("keeps the caller's item type, so the page still knows which Agent owns each task", () => {
    const items = [task("a", "writer")];
    // The annotation is the assertion: the page writes to a task's own agent directory, so a
    // grouping that handed back a narrower type would not compile here.
    const groups: { agentId: string; items: ProjectScheduleItem[] }[] = groupSchedulesByAgent(
      items,
      ["writer"],
    );
    expect(groups[0]?.items[0]?.agentId).toBe("writer");
  });
});
