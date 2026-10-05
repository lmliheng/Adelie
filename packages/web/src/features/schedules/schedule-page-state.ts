/**
 * Pure state of the scheduled-tasks page (features/schedules/schedules-page.tsx): how the
 * Project's one flat list of tasks becomes the page's per-Agent groups. Kept apart from the
 * component so the ordering rules run in the node-only unit tests (test/schedules-page-state.ts).
 *
 * The page groups rather than sorts flat, because the two questions a task raises are answered
 * by its owner: a file lives in one Agent's agent_state/schedule/, and the Agent is the only
 * thing that says where a task's workspace, model and Session picker point. The filter and the
 * search box narrow the rows inside the groups; they never dissolve the groups.
 */

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
