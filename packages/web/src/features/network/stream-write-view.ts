/**
 * The 事件流 tab's server side, read once and made readable: what the server wrote on one
 * connection (services/stream-writes.ts, served by GET …/stream-writes), set beside the frames
 * this page counted.
 *
 * The two numbers answer the one question a quiet stream cannot answer on its own — nothing was
 * written, or what was written never arrived — so the comparison is the whole point and it has
 * to stay honest: a record whose head fell out of the server's ring can prove a lower bound,
 * never a gap, and counts as unknown rather than reading as "the browser lost frames". Pure, so
 * those rules are unit-tested without a stream.
 */
import type { StreamWritesRecord } from "@adelie/server/api";

/** One frame as the list draws it: newest first, its moment relative to the connection's open. */
export interface StreamWriteRow {
  seq: number;
  event: string;
  /** Milliseconds after the connection opened — two clocks are involved, so only offsets compare. */
  offsetMs: number;
  bytes: number;
}

export interface StreamWriteView {
  /** Frames known written: the ones kept plus the ones the ring already let go. */
  written: number;
  kept: number;
  dropped: number;
  /** Subscriptions that carried this id (a browser reconnect reuses the URL). */
  connections: number;
  /** False while a connection under this id is open. */
  ended: boolean;
  /**
   * How the page's own count compares: "same", "server-more" (frames lost on the way),
   * "page-more" (the server's record is shorter than what arrived — a ring miss, or a record
   * that began late), or "unknown" while the page's row is still open or the record is partial.
   */
  gap: "same" | "server-more" | "page-more" | "unknown";
  /** Every kept frame, newest first. */
  rows: StreamWriteRow[];
}

/** The default event has no `event:` line; the protocol calls it `message`. */
const DEFAULT_EVENT = "message";

export function viewStreamWrites(
  record: StreamWritesRecord,
  received: number | null,
): StreamWriteView {
  const kept = record.frames.length;
  const written = kept + record.dropped;
  const gap = ((): StreamWriteView["gap"] => {
    // A partial record cannot prove a loss: the missing frames may simply not be in the ring.
    if (received === null || record.dropped > 0) return "unknown";
    if (received === written) return "same";
    return received < written ? "server-more" : "page-more";
  })();
  return {
    written,
    kept,
    dropped: record.dropped,
    connections: record.connections,
    ended: record.endedAt !== null,
    gap,
    rows: record.frames
      .map((frame) => ({
        seq: frame.seq,
        event: frame.event ?? DEFAULT_EVENT,
        offsetMs: Math.max(0, frame.at - record.openedAt),
        bytes: frame.bytes,
      }))
      .reverse(),
  };
}
