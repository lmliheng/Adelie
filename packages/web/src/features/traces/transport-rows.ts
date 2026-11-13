/**
 * The Transport view's rows (the component in sse-frame-list.tsx): which of the recorded frames
 * belong in this Session's panel, in which order, and how a frame's clock reads.
 *
 * Two channels belong here. The Session's own stream is the point of the view. The page's
 * user-level stream (GET /api/events — the one that carries session_created and the like) is kept
 * as well and marked as such: it is the same page and the same failure, and someone diagnosing a
 * silent stream needs to know which of the two was quiet. Every other Session's channel is
 * dropped — the panel is about this conversation.
 *
 * Newest first, because the reader is looking for the frame that just arrived, or for the fact
 * that none did, and capped: a long run holds hundreds of frames, and the ring's own cap is the
 * record where the list is only a window.
 */
import { formatTime } from "../../lib/format";
import type { SseFrameEntry } from "../../api/sse-frames";

/** How many rows the list renders — the newest; the ring keeps the rest. */
export const FRAME_ROW_CAP = 120;

/** This Session's frames and the page's own user-level ones, newest first, capped to the newest `cap`. */
export function transportRows(
  entries: readonly SseFrameEntry[],
  sessionId: string,
  cap: number = FRAME_ROW_CAP,
): SseFrameEntry[] {
  return entries
    .filter((e) => e.sessionId === sessionId || e.sessionId === null)
    .slice(-cap)
    .reverse();
}

/**
 * A row's clock: `HH:mm:ss.SSS`. Frames land tens of milliseconds apart while a reply streams,
 * so whole seconds would leave a run of rows that cannot be ordered.
 */
export function formatFrameTime(at: number): string {
  return `${formatTime(at)}.${String(new Date(at).getMilliseconds()).padStart(3, "0")}`;
}
