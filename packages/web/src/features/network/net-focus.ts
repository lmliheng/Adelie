/**
 * The one thing the transcript asks the Network panel for: show me this turn's requests.
 *
 * The assistant reply's inline request line (net-inline-row.tsx) and the panel are far apart in
 * the tree — the line is rendered inside the message stream, the panel inside a dock — and the
 * request is momentary (open the tab, land on one turn), so it travels as a store rather than
 * through React state the two do not share. Mirrors the chat page's other jump commands
 * (fileOpenRequest, subagentFocus): a value with a subscription, read and then left alone.
 *
 * `at` makes two requests for the same turn distinguishable, so a second click after the panel
 * already shows that turn still re-activates the tab. It is stamped monotonically (never equal to
 * an earlier one), because the body that applies a jump records how far it got: two clicks landing
 * in the same millisecond would otherwise be one request.
 *
 * A jump is consumed by the body that applies it (`markNetworkFocusApplied`): it asks the panel to
 * SHOW a turn now, not to remember it as a place. A body mounted later — the same tab moved to the
 * other dock, the tab closed and opened again — must not replay it: a layout move restores the
 * reader's own place (network-place.ts), and a replayed jump would clear that back to "this reply".
 * A second click stamps a new `at`, so it is still applied.
 */
let focus: { turn: number; at: number } | null = null;
/** The newest jump a body has applied; a jump at or below it is history, not a request. */
let appliedAt = 0;
const listeners = new Set<() => void>();

export interface NetFocus {
  turn: number;
  at: number;
}

export function requestNetworkFocus(turn: number): void {
  focus = { turn, at: Math.max(Date.now(), appliedAt + 1, (focus?.at ?? 0) + 1) };
  for (const listener of [...listeners]) listener();
}

/** The jump that still asks for something — null once a body has applied it (or none was made). */
export function networkFocus(): NetFocus | null {
  if (focus === null || focus.at <= appliedAt) return null;
  return focus;
}

/** Records that the body which applies a jump has done so (see this module's header). */
export function markNetworkFocusApplied(at: number): void {
  if (at <= appliedAt) return;
  appliedAt = at;
  for (const listener of [...listeners]) listener();
}

export function subscribeNetworkFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
