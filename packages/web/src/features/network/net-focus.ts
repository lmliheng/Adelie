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
 * already shows that turn still re-activates the tab.
 */
let focus: { turn: number; at: number } | null = null;
const listeners = new Set<() => void>();

export interface NetFocus {
  turn: number;
  at: number;
}

export function requestNetworkFocus(turn: number): void {
  focus = { turn, at: Date.now() };
  for (const listener of [...listeners]) listener();
}

export function networkFocus(): NetFocus | null {
  return focus;
}

export function subscribeNetworkFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
