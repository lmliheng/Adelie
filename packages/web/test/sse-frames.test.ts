/**
 * The SSE frame ring (api/sse-frames.ts), the Trace panel's Transport view's source:
 *
 * - recording is off until the toggle turns it on, and turning it off drops what was collected
 *   (a frozen list would read as a stream that stopped);
 * - the ring keeps the newest SSE_FRAME_CAP entries and lets the oldest fall out;
 * - a quiet stretch longer than the heartbeat leaves ONE `silence` marker carrying its length —
 *   at the interval exactly, nothing is marked;
 * - identical consecutive connection markers close together are one entry, or a browser
 *   retrying a dead connection would flush the ring; frames are never collapsed;
 * - a channel is recorded with its own name (`events` carries no Session: it is the user-level
 *   stream), and every change notifies the subscribers until they unsubscribe;
 * - a payload's byte length is counted on its UTF-8 encoding, its preview capped.
 */
import { beforeEach, expect, it, vi } from "vitest";
import {
  SSE_FRAME_CAP,
  SSE_PREVIEW_CHARS,
  SSE_QUIET_MS,
  clearSseFrames,
  frameRecord,
  lifecycleEntry,
  noteSseFrame,
  receivedEntry,
  setSseFramesEnabled,
  sseFrames,
  sseFramesEnabled,
  subscribeSseFrames,
} from "../src/api/sse-frames";

const T0 = 1_700_000_000_000;

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  clearSseFrames();
});

const frame = (id: string | null = null) =>
  receivedEntry("session", "s1", "ping", id, JSON.stringify({ type: "task_state" }));

it("records nothing until the toggle is on, and drops the ring when it goes off", () => {
  expect(sseFramesEnabled()).toBe(false);
  noteSseFrame(frame());
  expect(sseFrames()).toEqual([]);

  setSseFramesEnabled(true);
  expect(sseFramesEnabled()).toBe(true);
  noteSseFrame(frame());
  expect(sseFrames()).toHaveLength(1);

  setSseFramesEnabled(false);
  expect(sseFramesEnabled()).toBe(false);
  expect(sseFrames()).toEqual([]);
});

it("keeps the newest cap's worth, dropping the oldest", () => {
  setSseFramesEnabled(true);
  for (let i = 0; i < SSE_FRAME_CAP + 10; i++) noteSseFrame(frame(`e-${i}`));
  const frames = sseFrames();
  expect(frames).toHaveLength(SSE_FRAME_CAP);
  expect(frames[0]!.id).toBe("e-10");
  expect(frames.at(-1)!.id).toBe(`e-${SSE_FRAME_CAP + 9}`);
});

it("marks a quiet stretch past the heartbeat as one silence entry, and one at the interval as none", () => {
  setSseFramesEnabled(true);
  noteSseFrame(frame("e-1"));
  vi.setSystemTime(T0 + SSE_QUIET_MS);
  noteSseFrame(frame("e-2"));
  expect(sseFrames()).toHaveLength(2);

  vi.setSystemTime(T0 + SSE_QUIET_MS * 2 + 1);
  noteSseFrame(frame("e-3"));
  const frames = sseFrames();
  expect(frames).toHaveLength(4);
  expect(frames[2]).toMatchObject({
    kind: "gap",
    event: "silence",
    channel: "session",
    sessionId: "s1",
    gapMs: SSE_QUIET_MS + 1,
    bytes: 0,
  });
  // The marker carries the gap, not a frame: the ring's own frame clock moves on with e-3.
  vi.setSystemTime(T0 + SSE_QUIET_MS * 2 + 2);
  noteSseFrame(frame("e-4"));
  expect(sseFrames()).toHaveLength(5);
});

it("collapses identical consecutive markers, and never frames", () => {
  setSseFramesEnabled(true);
  noteSseFrame(lifecycleEntry("session", "s1", "error"));
  vi.setSystemTime(T0 + 3_000);
  noteSseFrame(lifecycleEntry("session", "s1", "error"));
  expect(sseFrames()).toHaveLength(1);

  // A different marker is its own entry, and so is the same one past the collapse window.
  noteSseFrame(lifecycleEntry("session", "s1", "open"));
  vi.setSystemTime(T0 + 20_000);
  noteSseFrame(lifecycleEntry("session", "s1", "error"));
  expect(sseFrames().map((f) => f.event)).toEqual(["error", "open", "error"]);

  noteSseFrame(frame());
  noteSseFrame(frame());
  expect(sseFrames()).toHaveLength(5);
});

it("records the user-level stream without a Session, and notifies subscribers until they leave", () => {
  setSseFramesEnabled(true);
  const first = vi.fn();
  const second = vi.fn();
  const leaveFirst = subscribeSseFrames(first);
  const leaveSecond = subscribeSseFrames(second);

  noteSseFrame(receivedEntry("events", null, "server_event", null, "{}"));
  expect(sseFrames()[0]).toMatchObject({ channel: "events", sessionId: null });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);

  leaveFirst();
  noteSseFrame(frame());
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(2);
  leaveSecond();
});

it("counts a payload's bytes on its UTF-8 encoding and caps its preview", () => {
  expect(frameRecord("中文")).toEqual({ bytes: 6, preview: "中文" });
  const long = "x".repeat(SSE_PREVIEW_CHARS + 50);
  expect(frameRecord(long).preview).toHaveLength(SSE_PREVIEW_CHARS);
  expect(frameRecord(long).bytes).toBe(SSE_PREVIEW_CHARS + 50);
});
