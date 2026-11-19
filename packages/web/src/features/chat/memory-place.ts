/**
 * The Memory panel's own place, remembered across the move of the panel between dock surfaces (a
 * Session's side or bottom dock, and the narrow window's merged surface).
 *
 * The panel keeps its place in component state — which level the reader is at (the list, or one
 * memory's text) and how far down that level they had scrolled — and a layout move throws all of it
 * away with the body: the same tab is rendered by the other dock, or by the merged surface, as a
 * fresh mount where the old one stood. Measured in the browser, a memory being read came back to
 * the list, and both levels came back at their top.
 *
 * A remount is not always a move, though, and only a move keeps the place (the same rule as the
 * Files panel's, workspace-view-memory.ts). A tab closed and opened again, or a conversation
 * switched away from and back to, also mounts the body afresh — those start the panel over, as they
 * always have. What tells them apart is the surface the new body arrived on: a move lands the panel
 * somewhere else, everything else brings it back where it was. So a place is stored with the
 * surface it was left on and is restored only from a body on a different one.
 *
 * What is deliberately not here: the listing and the memory's own text (the server's answers — the
 * panel reads them back on the way in), and the memory-changes card's state (that card is the
 * conversation's, not this panel's). Nor is it persisted anywhere: a place is worth keeping across
 * a move of the panel, not across a reload of the app.
 */
import { memoryRowKey } from "../../lib/omni/memory-changes";
import type { DockSurface } from "../dock/panel-context";
import type { MemoryNavMode } from "./memory-nav";

export type MemoryPlace = {
  /** The surface the place was left on; the place is restored only elsewhere (see above). */
  surface: DockSurface;
  /** The level the reader was at: the list, or one memory's text. */
  mode: MemoryNavMode;
  /** The list's offset in pixels from its top (0 = the top). */
  listScroll: number;
  /**
   * The open memory's offset in pixels. It belongs to that memory, not to the panel, so it is
   * cleared whenever the reader moves to another level or another memory.
   */
  detailScroll: number;
};

const places = new Map<string, MemoryPlace>();

/** A copy held apart from the caller's objects: a record is a snapshot, not a shared one. */
const copyOf = (place: MemoryPlace): MemoryPlace => ({
  surface: place.surface,
  mode:
    place.mode.kind === "detail"
      ? { kind: "detail", target: { ...place.mode.target } }
      : { kind: "list" },
  listScroll: place.listScroll,
  detailScroll: place.detailScroll,
});

/**
 * The place to come back to in this conversation from a body on `surface` — null when there is
 * none, or when the body is on the surface that place was left on (a remount that is not a move).
 */
export function recallMemoryPlace(sessionId: string, surface: DockSurface): MemoryPlace | null {
  const place = places.get(sessionId);
  if (place === undefined || place.surface === surface) return null;
  return copyOf(place);
}

/**
 * Records where the panel is, called on every change (never on the way out: a layout move mounts the
 * arriving body before the leaving one is torn down, so an unmount-time write would land after the
 * new mount had already read the record — the ordering workspace-view-memory.ts sets down too).
 *
 * A place that is exactly where a fresh panel starts — the list, at its top — is dropped rather
 * than kept: remembering "nothing" would make the panel come back as if the reader had been
 * somewhere. A body that starts over reaches this too, so the place it left behind is gone rather
 * than lying in wait for the next move.
 */
export function rememberMemoryPlace(sessionId: string, place: MemoryPlace): void {
  if (place.mode.kind === "list" && place.listScroll === 0 && place.detailScroll === 0) {
    places.delete(sessionId);
    return;
  }
  places.set(sessionId, copyOf(place));
}

/** The key of the memory a mode names, or null for the list level. */
export function memoryPlaceKey(mode: MemoryNavMode): string | null {
  return mode.kind === "detail" ? memoryRowKey(mode.target) : null;
}
