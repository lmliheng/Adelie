/**
 * Pure state of the scheduled-tasks page (features/schedules/schedules-page.tsx): how the
 * Project's one flat list of tasks becomes the page's per-Agent groups, and how the cross-Project
 * answer becomes the "all projects" overview's groups. Kept apart from the component so the
 * ordering and narrowing rules run in the node-only unit tests (test/schedules-page-state.ts).
 *
 * The page groups rather than sorts flat, because the two questions a task raises are answered
 * by its owner: a file lives in one Agent's agent_state/schedule/, and the Agent is the only
 * thing that says where a task's workspace, model and Session picker point. The filter and the
 * search box narrow the rows inside the groups; they never dissolve the groups.
 */
import type {
  AllProjectSchedulesResponse,
  ProjectScheduleItem,
} from "@lmliheng/penguin-server/api";
import { filterSchedules } from "./schedule-panel-state";
import type { ScheduleFilter } from "./schedule-panel-state";

/** One Agent's tasks, in the order the server listed them (its own listing's order). */
export interface ScheduleAgentGroup<T> {
  agentId: string;
  items: T[];
}

/**
 * The list split by owning Agent: `agentOrder` is the Project's Agent list, so the groups come
 * out in the order the settings pages, pickers and the Agent list all use.
 *
 * An Agent with no task is omitted rather than drawn as an empty group — the page answers "what
 * is scheduled", and a heading over nothing is a row the reader has to skip on every visit. A
 * task whose Agent is missing from `agentOrder` is not dropped: the caller may hold a stale Agent
 * list (an Agent deleted or added since it was loaded, or a task file written by hand), and
 * hiding those rows would hide real tasks. They come last, in the order they first appear in the
 * list, which for the server's own ordering is Agent id order.
 *
 * Generic in the item so the caller keeps what it passed in: the page draws ProjectScheduleItem
 * rows and needs each one's `name` and `agentId` for its own writes.
 */
export function groupSchedulesByAgent<T extends { agentId: string }>(
  items: readonly T[],
  agentOrder: readonly string[],
): ScheduleAgentGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const bucket = groups.get(item.agentId);
    if (bucket === undefined) groups.set(item.agentId, [item]);
    else bucket.push(item);
  }
  // `Array.prototype.sort` is stable, so the Agents absent from `agentOrder` - all sharing one
  // rank - keep the first-seen order the Map already gave them.
  const rank = new Map(agentOrder.map((agentId, index) => [agentId, index]));
  return [...groups.entries()]
    .sort(([a], [b]) => (rank.get(a) ?? agentOrder.length) - (rank.get(b) ?? agentOrder.length))
    .map(([agentId, group]) => ({ agentId, items: group }));
}

/** One Project of the cross-Project overview: the tasks the search box and the chips leave, grouped by their owning Agent. */
export interface ScheduleProjectGroup {
  projectId: string;
  /** The Project's display name as the server named it (its id when its config carries none). */
  name: string;
  groups: ScheduleAgentGroup<ProjectScheduleItem>[];
  /** Count of visible tasks: what a Project heading reports, so it cannot disagree with the rows under it. */
  count: number;
  /** The Project's unparseable files, unfiltered: nothing about a broken file is searchable, and hiding it is how it stays invisible. */
  invalidFiles: AllProjectSchedulesResponse["projects"][number]["invalidFiles"];
}

/**
 * The cross-Project answer shaped for the overview: one group per Project, its tasks split by the
 * Agent whose directory holds them. Order is the server's (Project order, then Agent id) — the
 * page holds the Agent list of the Project it is *on*, so ordering another Project's rows by a
 * list it does not have would be a guess; the owning Agent is named on each group instead.
 *
 * A Project left with no visible task is dropped rather than drawn as a heading over nothing, the
 * same rule the per-Agent grouping follows — but only when its filter matches nothing anywhere:
 * a Project that only has unparseable files keeps its heading, because that is the one place the
 * page shows them.
 */
export function crossProjectGroups(
  projects: readonly AllProjectSchedulesResponse["projects"][number][],
  filter: ScheduleFilter,
  query: string,
): ScheduleProjectGroup[] {
  const out: ScheduleProjectGroup[] = [];
  for (const project of projects) {
    const visible = filterSchedules(project.schedules, filter, query);
    if (visible.length === 0 && project.invalidFiles.length === 0) continue;
    // No Agent order to sort by (see above): the server's own per-Agent ordering is kept.
    const groups = groupSchedulesByAgent(visible, []);
    out.push({
      projectId: project.projectId,
      name: project.name,
      groups,
      count: visible.length,
      invalidFiles: project.invalidFiles,
    });
  }
  return out;
}
