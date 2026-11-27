/**
 * What the server wrote to each SSE stream — read back by the conversation's "网络" panel
 * (事件流 tab). The page records what arrived (api/net-log.ts, api/sse-frames.ts); only the
 * process that wrote a frame can say what it sent, and the difference between the two is the
 * one thing a quiet stream cannot answer on its own ("nothing was written" vs "what was written
 * never arrived").
 *
 * A browser names its connection with a `requestId` query parameter when it opens the stream
 * (packages/web/src/api/sse.ts — EventSource cannot set headers, so a parameter is the only
 * place it fits). Records are keyed by Session AND that id: the ids come from the page and two
 * pages number their rows from 1.
 *
 * Bounded twice, because this is a debugging aid rather than an archive: the newest
 * {@link STREAM_WRITE_STREAMS_CAP} connections are kept (a reconnect under the same id
 * accumulates onto its own record, since the browser's own reconnects reuse the URL), and a
 * record keeps at most {@link STREAM_WRITE_FRAMES_CAP} frames — the count of what fell out is
 * carried in `dropped`, so a record never reads as complete when it is not. An evicted
 * connection is not re-created by later writes: it would come back holding its tail and look
 * like the whole thing. Nothing here is written to disk; a restart empties it, which the panel
 * states as "no record for this connection".
 */

/** How many connections the ring keeps; the newest win. */
export const STREAM_WRITE_STREAMS_CAP = 50;

/** How many frames one connection's record keeps; the count of what fell out is `dropped`. */
export const STREAM_WRITE_FRAMES_CAP = 500;

/** The longest connection id accepted from a page (`<id>-<seq>`, and room to spare). */
export const STREAM_REQUEST_ID_MAX = 64;

/** One frame as it went out: its own clock, its SSE identity (both optional in the protocol) and its size. */
export interface StreamWriteFrame {
  /** 1-based, in write order; a gap means the frame fell out of the ring (see `dropped`). */
  seq: number;
  at: number;
  /** The `event:` name; null for the default (`message`) event. */
  event: string | null;
  /** The `id:` line; null when the frame carried none (the heartbeat). */
  id: string | null;
  /** Payload plus framing lines, approximated the way the page measures a body's size. */
  bytes: number;
}

/** What one connection id has written so far. */
export interface StreamWriteRecord {
  requestId: string;
  /** When the first connection under this id opened (ms, server clock). */
  openedAt: number;
  /** When the last connection under this id closed; null while one is open, or if it was cut off. */
  endedAt: number | null;
  /** How many connections have carried this id (a browser reconnect reuses the URL). */
  connections: number;
  frames: StreamWriteFrame[];
  /** Frames that fell out of the record (or were never recorded); the count says how many. */
  dropped: number;
}

interface Entry {
  sessionId: string | null;
  record: StreamWriteRecord;
}

/** Insertion order is the recency order (a write re-inserts its key), so the first key is the oldest. */
const streams = new Map<string, Entry>();

/** Ids that were evicted while still open: later writes must not resurrect a partial record. */
const evicted = new Set<string>();

function keyOf(sessionId: string | null, requestId: string): string {
  // A NUL cannot appear in either half, and both are page-supplied, so it keeps them apart.
  return `${sessionId ?? ""}\u0000${requestId}`;
}

function touch(key: string, entry: Entry): void {
  // Re-inserting moves the key to the end: Map iteration order is the recency order.
  streams.delete(key);
  streams.set(key, entry);
  while (streams.size > STREAM_WRITE_STREAMS_CAP) {
    const oldest = streams.keys().next().value as string;
    streams.delete(oldest);
    evicted.add(oldest);
  }
}

function ensure(sessionId: string | null, requestId: string, at: number): Entry | null {
  const key = keyOf(sessionId, requestId);
  if (evicted.has(key)) return null;
  let entry = streams.get(key);
  if (entry === undefined) {
    entry = {
      sessionId,
      record: {
        requestId,
        openedAt: at,
        endedAt: null,
        connections: 0,
        frames: [],
        dropped: 0,
      },
    };
    streams.set(key, entry);
  }
  return entry;
}

/** A connection carrying `requestId` just subscribed. */
export function noteStreamOpen(
  sessionId: string | null,
  requestId: string,
  at: number = Date.now(),
): void {
  const entry = ensure(sessionId, requestId, at);
  if (entry === null) return;
  entry.record.connections += 1;
  entry.record.endedAt = null;
  touch(keyOf(sessionId, requestId), entry);
}

/** One frame is about to be written. */
export function noteStreamWrite(
  sessionId: string | null,
  requestId: string,
  frame: { event: string | null; id: string | null; bytes: number },
  at: number = Date.now(),
): void {
  const key = keyOf(sessionId, requestId);
  const entry = ensure(sessionId, requestId, at);
  if (entry === null) return;
  const { record } = entry;
  if (record.frames.length >= STREAM_WRITE_FRAMES_CAP) {
    record.frames.shift();
    record.dropped += 1;
  }
  record.frames.push({
    seq: (record.frames.at(-1)?.seq ?? 0) + 1,
    at,
    event: frame.event,
    id: frame.id,
    bytes: frame.bytes,
  });
  touch(key, entry);
}

/** The connection ended (the peer left, the socket died, or the stream finished). */
export function noteStreamClose(
  sessionId: string | null,
  requestId: string,
  at: number = Date.now(),
): void {
  const entry = streams.get(keyOf(sessionId, requestId));
  if (entry === undefined) return;
  entry.record.endedAt = at;
}

/** This Session's record for `requestId`, or null when nothing was captured for it. */
export function readStreamWrites(
  sessionId: string | null,
  requestId: string,
): StreamWriteRecord | null {
  const entry = streams.get(keyOf(sessionId, requestId));
  if (entry === undefined) return null;
  // A copy: the caller is a response body, the ring keeps mutating while the stream writes.
  return { ...entry.record, frames: entry.record.frames.map((f) => ({ ...f })) };
}

/**
 * The `requestId` a page asked to be recorded under, or undefined when it named none (the CLI,
 * an Agent's own tools, a page used before this existed) or named something unusable.
 */
export function parseStreamRequestId(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (raw.length === 0 || raw.length > STREAM_REQUEST_ID_MAX) return undefined;
  return /^[A-Za-z0-9._:-]+$/.test(raw) ? raw : undefined;
}

/** Drop everything (tests only: a shared ring would otherwise leak one test's stream into the next). */
export function resetStreamWritesForTests(): void {
  streams.clear();
  evicted.clear();
}
