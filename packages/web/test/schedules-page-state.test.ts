/**
 * The scheduled-tasks page's pure rules (src/features/schedules/schedule-page-state.ts): how the
 * Project's one flat list of tasks becomes the page's per-Agent groups and which Agent comes
 * first, and how the cross-Project answer becomes the "all projects" overview's groups.
 */
import { describe, expect, it } from "vitest";
import type {
  AllProjectSchedulesResponse,
  ProjectScheduleItem,
} from "@lmliheng/penguin-server/api";
import {
  crossProjectGroups,
  groupSchedulesByAgent,
} from "../src/features/schedules/schedule-page-state";

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

/** One Project of the cross-Project answer, with the Project's own tasks and skipped files. */
function project(
  projectId: string,
  name: string,
  schedules: ProjectScheduleItem[],
  invalidFiles: AllProjectSchedulesResponse["projects"][number]["invalidFiles"] = [],
): AllProjectSchedulesResponse["projects"][number] {
  return { projectId, name, schedules, invalidFiles };
}

describe("crossProjectGroups", () => {
  it("keeps the server's Project order and splits each Project's tasks by their owning Agent", () => {
    const groups = crossProjectGroups(
      [
        project("a", "Alpha", [task("one", "writer"), task("two", "reviewer")]),
        project("b", "Beta", [task("three", "default_agent")]),
      ],
      "all",
      "",
    );
    expect(groups.map((g) => [g.projectId, g.name, g.count])).toEqual([
      ["a", "Alpha", 2],
      ["b", "Beta", 1],
    ]);
    expect(groups[0]?.groups.map((g) => [g.agentId, g.items.map((i) => i.name)])).toEqual([
      ["writer", ["one"]],
      ["reviewer", ["two"]],
    ]);
  });

  it("drops a Project the filter leaves empty rather than drawing a heading over nothing", () => {
    const groups = crossProjectGroups(
      [
        project("a", "Alpha", [task("daily-report", "writer")]),
        project("b", "Beta", [{ ...task("nightly", "writer"), status: "disabled" }]),
      ],
      "active",
      "",
    );
    expect(groups.map((g) => g.projectId)).toEqual(["a"]);
  });

  it("keeps a Project that only has unparseable files, which are never filtered", () => {
    const groups = crossProjectGroups(
      [
        project("a", "Alpha", [task("daily-report", "writer")]),
        project("b", "Beta", [], [{ agentId: "writer", name: "broken", error: "bad toml" }]),
      ],
      "active",
      "nothing matches this",
    );
    expect(groups.map((g) => g.projectId)).toEqual(["b"]);
    expect(groups[0]?.count).toBe(0);
    expect(groups[0]?.invalidFiles).toEqual([
      { agentId: "writer", name: "broken", error: "bad toml" },
    ]);
  });

  it("narrows by the search box on names and prompts, across every Project", () => {
    const groups = crossProjectGroups(
      [
        project("a", "Alpha", [task("daily-report", "writer"), task("cleanup", "writer")]),
        project("b", "Beta", [task("weekly-report", "writer")]),
      ],
      "all",
      "report",
    );
    expect(groups.map((g) => [g.projectId, g.groups[0]?.items.map((i) => i.name)])).toEqual([
      ["a", ["daily-report"]],
      ["b", ["weekly-report"]],
    ]);
  });

  it("answers nothing for a server answer with no Projects (or none yet read)", () => {
    expect(crossProjectGroups([], "all", "")).toEqual([]);
  });
});
