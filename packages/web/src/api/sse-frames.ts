/**
 * Browser-side record of the SSE frames this page actually RECEIVED (api/sse.ts feeds it), read
 * by the Trace panel's Transport view. It answers the one question a silent stream raises and no
 * other surface can: did the server write and nothing arrived, or was nothing ever written?
 * The page holds the received half only — the server's own writes are not visible from here.
 *
 * On by default, and the reader can turn it off (the Trace panel's Transport toggle writes
 * `penguin.sseFrames` with the OFF choice). It used to default off, and that turned out to
 * defeat the point: a stream that went quiet is noticed AFTER the fact, and frames recorded
 * only from the moment the reader switches it on are exactly the frames that are already gone.
 * The cost is what keeps it bearable rather than the default: entries live in this page's memory
 * only (never written to storage, never sent anywhere), the ring keeps the recent past (300
 * entries), and a payload is kept as its first characters (SSE_PREVIEW_CHARS).
 *
 * Bounded: frames arrive at up to a few per second, so the ring keeps the recent past
 * (SSE_FRAME_CAP) and the oldest fall out. A channel that went quiet for longer than the
 * server's heartbeat interval leaves one `silence` marker, so "nothing arrived for 40 s" is
 * distinguishable from "nothing was written in that time".
 */
/** How many entries the ring keeps; the newest win, the oldest fall out. */
export const SSE_FRAME_CAP = 300;
/** A quiet stretch longer than this is marked as one `silence` entry (the server's heartbeat is 20 s). */
export const SSE_QUIET_MS = 20_000;
/** How much of a payload's text an entry keeps. */
export const SSE_PREVIEW_CHARS = 120;
/** Identical consecutive lifecycle markers closer together than this are one entry (a browser retrying a dead connection repeats itself). */
const LIFECYCLE_DEDUPE_MS = 10_000;

/** The localStorage key the Transport toggle writes. */
const STORAGE_KEY = "penguin.sseFrames";

/** Which of the two subscriptions a frame came from. */
export type SseChannel = "session" | "events";

export interface SseFrameEntry {
  /** This browser's clock at the moment of the entry. */
  at: number;
  /**
   * A received frame, a connection marker (`open` / `reopen` / `probe` / `stalled` / `live` /
   * `error` / `closed`), or one `silence` gap between frames.
   */
  kind: "frame" | "lifecycle" | "gap";
  channel: SseChannel;
  /** The Session whose channel this is; null for the user-level stream (GET /api/events). */
  sessionId: string | null;
  /** A frame: its SSE event name (`message`, `server_event`, `ping`). A marker: its own name. */
  event: string;
  id: string | null;
  /** A frame: the payload's length in bytes. 0 for markers. */
  bytes: number;
  /** A frame: the payload's opening text (SSE_PREVIEW_CHARS at most). */
  preview: string;
  /** A `silence` entry: how long the channel had been quiet. */
  gapMs?: number;
}

let entries: SseFrameEntry[] = [];
let lastFrameAt = 0;
let lastAt = 0;
let lastKey = "";
const listeners = new Set<() => void>();

/** Bytes of a payload, counted on the payload's own encoding rather than on UTF-16 code units. */
const encoder = new TextEncoder();

/**
 * Whether this browser is recording frames. On unless the reader turned it off; anything
 * unreadable (private browsing, no storage) reads as on, since the entries never leave memory.
 */
export function sseFramesEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Switches recording on or off and keeps the choice in localStorage. Turning it off drops what
 * was collected: the ring describes the connection as it was recorded, and a frozen list left on
 * screen would read as a stream that stopped.
 */
export function setSseFramesEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, "0");
  } catch {
    /* best-effort persistence (private browsing, quota) — the current page still records */
  }
  if (!on) clearSseFrames();
  else notify();
}

/** The recorded entries, oldest first. */
export function sseFrames(): readonly SseFrameEntry[] {
  return entries;
}

/** Drops every entry (the Transport view's clear button). */
export function clearSseFrames(): void {
  if (entries.length === 0) return;
  entries = [];
  lastFrameAt = 0;
  lastAt = 0;
  lastKey = "";
  notify();
}

/** Called after every change to the ring; the Transport view re-renders on it. */
export function subscribeSseFrames(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A received frame's stored form: the payload's opening text and its byte length. */
export function frameRecord(data: string): { bytes: number; preview: string } {
  return { bytes: encoder.encode(data).length, preview: data.slice(0, SSE_PREVIEW_CHARS) };
}

/** Records one frame, connection marker or gap. A no-op while recording is off. */
export function noteSseFrame(entry: Omit<SseFrameEntry, "at">): void {
  if (!sseFramesEnabled()) return;
  const at = Date.now();
  const key = entryKey({ ...entry, at });
  if (entry.kind === "lifecycle" && key === lastKey && at - lastAt < LIFECYCLE_DEDUPE_MS) return;
  if (entry.kind === "frame" && lastFrameAt !== 0 && at - lastFrameAt > SSE_QUIET_MS) {
    push({
      at,
      kind: "gap",
      channel: entry.channel,
      sessionId: entry.sessionId,
      event: "silence",
      id: null,
      bytes: 0,
      preview: "",
      gapMs: at - lastFrameAt,
    });
  }
  push({ ...entry, at });
}

function entryKey(e: SseFrameEntry): string {
  return `${e.kind}|${e.channel}|${e.sessionId ?? ""}|${e.event}|${e.preview}`;
}

function push(e: SseFrameEntry): void {
  entries.push(e);
  if (entries.length > SSE_FRAME_CAP) entries = entries.slice(-SSE_FRAME_CAP);
  lastAt = e.at;
  lastKey = entryKey(e);
  if (e.kind === "frame") lastFrameAt = e.at;
  notify();
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** A connection marker (`open` / `reopen` / `stalled` / …) for one channel — the shape api/sse.ts records. */
export function lifecycleEntry(
  channel: SseChannel,
  sessionId: string | null,
  event: string,
): Omit<SseFrameEntry, "at"> {
  return { kind: "lifecycle", channel, sessionId, event, id: null, bytes: 0, preview: "" };
}

/** A frame one channel received — the shape api/sse.ts records. */
export function receivedEntry(
  channel: SseChannel,
  sessionId: string | null,
  event: string,
  id: string | null,
  data: string,
): Omit<SseFrameEntry, "at"> {
  return { kind: "frame", channel, sessionId, event, id, ...frameRecord(data) };
}
