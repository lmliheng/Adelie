/**
 * The Trace panel's own place, remembered across the move of the panel between dock surfaces (a
 * Session's side or bottom dock, and the narrow window's merged surface).
 *
 * The panel keeps its place in component state — which rounds the reader has open, how far down
 * the file they had scrolled — and a layout move throws all of it away with the body: the same tab
 * is rendered by the other dock, or by the merged surface, as a fresh mount where the old one
 * stood. Measured in the browser, a reader who had closed the newest round and opened the first
 * one, then scrolled down, came back on the newest round with the first one closed and the panel
 * back at the round it opens on.
 *
 * A remount is not always a move, though, and only a move keeps the place (the same rule as the
 * Files and Memory panels', workspace-view-memory.ts / memory-place.ts). A tab closed and opened
 * again, or a conversation switched away from and back to, also mounts the body afresh — those
 * start the panel over, as they always have. What tells them apart is the surface the new body
 * arrived on: a move lands the panel somewhere else, everything else brings it back where it was.
 * So a place is stored with the surface it was left on and is restored only from a body on a
 * different one.
 *
 * What is deliberately not here: which Trace file the pills have selected (a multi-shard Session
 * has several, and the pill's own selection is a separate feeder of the same record — see the note
 * in the round that introduced this file), the pinned row a bar-click jumps to (it clears itself
 * after a couple of seconds), and the transport strip's switch. Nor is it persisted anywhere: a
 * place is worth keeping across a move of the panel, not across a reload of the app.
 */
import type { DockSurface } from "../dock/panel-context";

export interface TracePlace {
  /** The surface the place was left on; the place is restored only elsewhere (see above). */
  surface: DockSurface;
  /** The rounds the reader had open (taskIndex), in file order — the newest one is open on arrival. */
  expanded: number[];
  /** The panel's offset in pixels from its top (0 = the top). */
  scrollTop: number;
}

const places = new Map<string, TracePlace>();

/** A copy held apart from the caller's array: a record is a snapshot, not a shared one. */
const copyOf = (place: TracePlace): TracePlace => ({
  surface: place.surface,
  expanded: [...place.expanded],
  scrollTop: place.scrollTop,
});

/**
 * The place to come back to in this conversation from a body on `surface` — null when there is
 * none, or when the body is on the surface that place was left on (a remount that is not a move).
 */
export function recallTracePlace(sessionId: string, surface: DockSurface): TracePlace | null {
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
 * A place that is exactly where the panel would open by itself — no round open, at the top — is
 * dropped rather than kept: remembering "nothing" would make the panel come back as if the reader
 * had been somewhere. (Once an analysis lands the newest round opens, so this is the state before
 * that, or after a reader has closed every round.)
 */
export function rememberTracePlace(sessionId: string, place: TracePlace): void {
  if (place.expanded.length === 0 && place.scrollTop === 0) {
    places.delete(sessionId);
    return;
  }
  places.set(sessionId, copyOf(place));
}
