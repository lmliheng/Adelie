/**
 * Which conversation the agents panel is showing, kept outside the component.
 *
 * The panel is a dock body: crossing the breakpoint (the wide window's right dock ↔ the narrow
 * merged surface) moves the active panel from one mount to the other, so React unmounts this body
 * and mounts a fresh one — its own `selected` state does not survive that. Round 268 and 269 gave
 * the child composer's text, the panel's refusal lines and the staged chips a record to live in
 * across that mount (subagent-composer-keep.ts); the pick itself was still missing, so a resize
 * fell back to the auto-focus (the displayed Task's first child) even when the reader had picked
 * another child — or the root — from the graph above, and the conversation they were reading was
 * replaced by a different one.
 *
 * Keyed by the PARENT session, unlike the composer record: this is a property of the panel (which
 * of *this* conversation's children it shows), the same on both mounts of the same panel, and it
 * has one entry per conversation the reader opened the panel in — a session id plus the origin
 * chain, so a tab that visits many conversations still keeps only a handful of short strings.
 *
 * Module state, not storage: the record says what this tab was looking at, not a preference the
 * next visit should honour — the same rule subagent-composer-keep.ts and `dismissedWindowNotices`
 * in chat-input.tsx follow.
 */

/** A conversation the panel can show: a child Session and its `ctx.origin` chain (the root has none). */
export interface SubagentSelection {
  sessionId: string;
  /** `ctx.origin` chain of the shown conversation, ending with its own session id (empty = the root). */
  origin: string[];
}

/**
 * The pick a fresh mount should start from: the remembered one while its conversation is still in
 * the displayed Task's graph, otherwise null (the auto-focus takes over, exactly as before this
 * record existed). The graph is the authority on both counts — a child from a Task that is no
 * longer displayed (a chip re-pinned the scope, the stream resynced into a fresh model) must not
 * resurrect a panel nothing can render, and the origin chain is read from today's node rather than
 * from the record, so the two can never disagree.
 */
export function restoreSubagentSelection(
  remembered: SubagentSelection | null,
  nodes: readonly SubagentSelection[],
): SubagentSelection | null {
  if (remembered === null) return null;
  const node = nodes.find((n) => n.sessionId === remembered.sessionId);
  return node ? { sessionId: node.sessionId, origin: node.origin } : null;
}

const kept = new Map<string, SubagentSelection>();

/** What this conversation's panel was showing before the last remount (null = nothing picked). */
export function readSubagentSelection(parentSessionId: string): SubagentSelection | null {
  return kept.get(parentSessionId) ?? null;
}

/** Record this conversation's pick; null (nothing picked) drops the entry instead of storing an empty one. */
export function writeSubagentSelection(
  parentSessionId: string,
  selection: SubagentSelection | null,
): void {
  if (selection === null) {
    kept.delete(parentSessionId);
    return;
  }
  kept.set(parentSessionId, selection);
}
