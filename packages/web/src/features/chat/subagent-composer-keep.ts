/**
 * What the subagent panel's child composer has already said, kept outside the component.
 *
 * The panel is a dock body: a layout change (the desktop right dock ↔ the narrow merged surface)
 * moves the active panel from one mount to the other, so React unmounts this body and mounts a
 * fresh one — nothing held in the composer's own state survives that. What the record below keeps
 * is everything on that box the reader would still expect to find afterwards: the text they were
 * typing, the sentences the panel has already put on screen, and the thinking level it pinned
 * onto the child. (The same text also rides the Session's draft cache, use-session-draft.ts, so a
 * reload finds it too; the two are written from the same callback.)
 *
 * All of it is something the composer is not free to forget:
 * - A refusal line answers a press whose answer is still on screen — the draft in the box with
 *   the same Send button, or the Stop button with the run still going. A layout change is not a
 *   new attempt, so the sentence has to be there afterwards; it is the same rule 7.19 applies to
 *   every refusal, and the reason the lines live above the box instead of in a toast.
 * - The pinned thinking level replaces the fallback, which is what the child INHERITED at spawn.
 *   Once the PATCH has landed, that fallback is no longer what the child runs at, so dropping the
 *   pin would make the picker report a level the panel itself had already changed.
 * - The staged references (chips above the box: a file, a directory, a quoted range, or an excerpt
 *   of the child's own conversation, which its selection menu stages there). They are the reader's
 *   own staging and nothing was sent, so a move between docks must not unstage them. Unlike the
 *   text they do NOT ride the Session draft cache in either direction (see the `references` state
 *   in chat-input.tsx: a file quoted ten minutes ago may have moved on, and a chip restored from
 *   storage would claim a passage the file no longer holds), so this record is the only place
 *   they survive — for the tab, exactly like the sentences above.
 *
 * Module state, not storage: these describe a live press and belong to the tab that saw it — the
 * same rule `dismissedWindowNotices` in chat-input.tsx follows. Keyed by the CHILD's Session id,
 * the one identity that means the same thing on both mounts; one record per child, replaced by
 * the next press. A record with nothing in it is dropped, so a tab that visits many children
 * keeps only the ones with something to say.
 *
 * Kept out of the chat page on purpose: the parent page would have to thread a per-child record
 * through the dock context, while the panel body is the only writer and the only reader.
 */
import type { ComposerReference } from "../../lib/workspace-tree";

export interface SubagentComposerKeep {
  /**
   * The text in the box right now ("" = nothing typed). The Session draft cache holds the same
   * text for the long haul, but it writes on a 300 ms debounce and flushes on unmount — and that
   * flush lands AFTER the replacement mount has already read the cache (React renders the new
   * subtree before cleaning up the old one), so a resize inside the debounce window lost the last
   * keystrokes. This field is written on every edit instead, which is what a remount reads.
   */
  draft: string;
  /** Why a message never reached the child (subagent-send-refusal.ts): the draft and its Send button are the retry. */
  send: string | null;
  /** Why a Stop did not land (subagent-send-refusal.ts): the run is still going, and the same button is the retry. */
  stop: string | null;
  /** Why a thinking-level pin was refused (thinking-level-refusal.ts): the picker still reads what the child runs at. */
  level: string | null;
  /** The level this panel pinned onto the child and the server took ("" = the panel never pinned one). */
  pinnedLevel: string;
  /** The chips staged above the box (see the module header): empty = nothing staged. */
  references: ComposerReference[];
}

/** A child the panel has said nothing about: the record a fresh mount starts from. */
export const EMPTY_KEEP: SubagentComposerKeep = {
  draft: "",
  send: null,
  stop: null,
  level: null,
  pinnedLevel: "",
  references: [],
};

const kept = new Map<string, SubagentComposerKeep>();

/** Whether this record has anything to keep (an empty one is dropped instead of stored). */
function saysSomething(keep: SubagentComposerKeep): boolean {
  return (
    keep.draft !== "" ||
    keep.send !== null ||
    keep.stop !== null ||
    keep.level !== null ||
    keep.pinnedLevel !== "" ||
    keep.references.length > 0
  );
}

/** What is still on screen for this child (an unvisited child reads as EMPTY_KEEP). */
export function readSubagentComposerKeep(childSessionId: string): SubagentComposerKeep {
  return kept.get(childSessionId) ?? EMPTY_KEEP;
}

/** Replace this child's record; nothing left to say drops the entry instead of keeping an empty one. */
export function writeSubagentComposerKeep(
  childSessionId: string,
  next: SubagentComposerKeep,
): void {
  if (!saysSomething(next)) {
    kept.delete(childSessionId);
    return;
  }
  kept.set(childSessionId, next);
}
