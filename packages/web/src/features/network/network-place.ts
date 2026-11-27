/**
 * The Network panel's own place, remembered across the move of the panel between dock surfaces
 * (a Session's side or bottom dock, and the narrow window's merged surface).
 *
 * The panel keeps its place in component state — the search word, the scope and type filter, the
 * record whose detail is open and which of the detail's tabs is showing — and a layout move throws
 * all of it away with the body: the same tab is rendered by the other dock, or by the merged
 * surface, as a fresh mount where the old one stood. Measured in the browser, a reader who had
 * searched "stream", narrowed the type to streams, set the scope to the last five turns and opened
 * one record came back on the untouched list: every filter cleared and the detail shut.
 *
 * A remount is not always a move, though, and only a move keeps the place (the same rule as the
 * Files, Memory, Trace and messaging panels', workspace-view-memory.ts / memory-place.ts /
 * trace-place.ts / messaging-form-keep.ts). A tab closed and opened again, or a conversation
 * switched away from and back to, also mounts the body afresh — those start the panel over, as they
 * always have. What tells them apart is the surface the new body arrived on: a move lands the panel
 * somewhere else, everything else brings it back where it was. So a place is stored with the
 * surface it was left on and is restored only from a body on a different one.
 *
 * What is deliberately not here: whether raw values were revealed (the confirmation promises it
 * applies to the current request only, so a move asks again rather than carrying unmasked keys onto
 * another surface), the open "more" menu and the reveal confirmation (floating layers, not places),
 * and the fetched model bodies (the server's answer, read again when the row opens). Nor is it
 * persisted anywhere: a place is worth keeping across a move of the panel, not across a reload of
 * the app.
 */
import type { DockSurface } from "../dock/panel-context";
import type { NetScope, NetTypeFilter } from "./net-rows";

/** The detail's tabs, in the order the design lists them (network-panel.tsx draws them). */
export type NetDetailTab = "overview" | "request" | "response" | "events" | "related";

export interface NetworkPlace {
  /** The surface the place was left on; the place is restored only elsewhere (see above). */
  surface: DockSurface;
  /** The reading controls: the scope ("this reply" / last five turns / all), type and search. */
  scope: NetScope;
  type: NetTypeFilter;
  query: string;
  /** The turn a jump from the transcript's inline line pinned, or null when the scope follows. */
  pinnedTurn: number | null;
  /** The record whose detail was open, or null while the list itself was showing. */
  openId: number | null;
  /** The detail tab that was showing (meaningful only with `openId`). */
  tab: NetDetailTab;
}

/** Where a body that starts over opens: a search without a word, "this reply", every type, the list. */
const FRESH: Omit<NetworkPlace, "surface"> = {
  scope: "turn",
  type: "all",
  query: "",
  pinnedTurn: null,
  openId: null,
  tab: "overview",
};

const places = new Map<string, NetworkPlace>();

/** A copy held apart from the caller's object: a record is a snapshot, not a shared one. */
const copyOf = (place: NetworkPlace): NetworkPlace => ({ ...place });

/**
 * The place to come back to in this conversation from a body on `surface` — null when there is
 * none, or when the body is on the surface that place was left on (a remount that is not a move).
 */
export function recallNetworkPlace(sessionId: string, surface: DockSurface): NetworkPlace | null {
  const place = places.get(sessionId);
  if (place === undefined || place.surface === surface) return null;
  return copyOf(place);
}

/**
 * Records where the panel is, called on every change and once by a body that arrives with a place
 * (never on the way out: a layout move mounts the arriving body before the leaving one is torn
 * down, so an unmount-time write would land after the new mount had already read the record — the
 * same ordering workspace-view-memory.ts sets down).
 *
 * The write on arrival matters as much as the rest: the record is stamped with the surface the
 * body is on now, which is what makes the NEXT crossing — back the other way — find a place to
 * restore. A body that arrived with one and then changed nothing would otherwise leave the record
 * stamped with the surface it came from, and the crossing back would read "same surface, start
 * over".
 *
 * A place that is exactly where the panel would open by itself is dropped rather than kept:
 * remembering "nothing" would make the panel come back as if the reader had been somewhere. A body
 * that starts over reaches this too, so the place it left behind is gone rather than lying in wait
 * for the next move.
 */
export function rememberNetworkPlace(sessionId: string, place: NetworkPlace): void {
  const fresh =
    place.scope === FRESH.scope &&
    place.type === FRESH.type &&
    place.query === FRESH.query &&
    place.pinnedTurn === FRESH.pinnedTurn &&
    place.openId === FRESH.openId &&
    place.tab === FRESH.tab;
  if (fresh) {
    places.delete(sessionId);
    return;
  }
  places.set(sessionId, copyOf(place));
}
