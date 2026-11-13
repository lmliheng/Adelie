/**
 * Stream liveness (api/sse.ts), against the browser's EventSource contract.
 *
 * - Given a stream that has pinged, when it is silent for 50 s, its EventSource is closed and
 *   one new one opens with `?lastEventId=` set to the newest id seen (at 49 s nothing
 *   happens); silent again before the new one delivered an id, it resumes from the same id.
 * - Given pings every 20 s, the stream is never reopened.
 * - Given a tab whose timers did not run, becoming visible past the window reopens the stream
 *   at once; being hidden does not.
 * - Given a stream that spoke but never pinged (a server older than the heartbeat), nothing
 *   reopens it: no silence window applies to it, and its first frame retired the
 *   dead-on-arrival watch.
 * - Given a connection that delivers nothing at all, it is reopened at the deadline, and after
 *   three in a row the stream is judged stalled: no connection is held open, the caller is told
 *   once, and one fresh connection is tried a minute later; a frame on a probe returns it to
 *   live — and every reconnect, probes included, resumes from the newest id ever seen. A probe
 *   the browser gives up on schedules the next one: while stalled, nothing else is retrying.
 * - Once the caller closed it, or the browser gave up on it (reported as a closed error),
 *   nothing reopens it.
 */
import { afterEach, expect, it, vi } from "vitest";
import { openSessionStream } from "../src/api/sse";
import { clearSseFrames, sseFrames, sseFramesEnabled } from "../src/api/sse-frames";
import { FakeEventSource, stubEventSource, stubVisibility } from "./helpers/event-source";

afterEach(() => {
  vi.useRealTimers();
  clearSseFrames();
});

function subscribe() {
  vi.useFakeTimers();
  const sources = stubEventSource();
  const setVisibility = stubVisibility();
  const errors: boolean[] = [];
  const liveness: ("live" | "stalled")[] = [];
  const conn = openSessionStream("s1", {
    onOmniMessage: () => undefined,
    onServerEvent: () => undefined,
    onError: (closed) => errors.push(closed),
    onLiveness: (state) => liveness.push(state),
  });
  return { sources, setVisibility, conn, errors, liveness };
}
type Sub = ReturnType<typeof subscribe>;

/** What a current server sends first: the snapshot, with an id, then a ping. */
function greet(source: FakeEventSource, id: string): void {
  source.emit("server_event", JSON.stringify({ type: "task_state", state: "running" }), id);
  source.emit("ping");
}

/** How a stream dies on arrival: the connection opens and the body never arrives. */
const silence = (ms: number) => vi.advanceTimersByTime(ms);

const live = (sources: FakeEventSource[]) =>
  sources.filter((s) => s.readyState !== FakeEventSource.CLOSED);

it("a stream silent for 50 s is reopened, once, from the newest event id seen", () => {
  const { sources } = subscribe();
  greet(sources[0]!, "e-1");
  sources[0]!.emit("message", "{}", "e-2");

  vi.advanceTimersByTime(49_000);
  expect(sources).toHaveLength(1);
  vi.advanceTimersByTime(1_000);
  expect(sources[1]!.url).toBe("/api/sessions/s1/stream?lastEventId=e-2");
  expect(live(sources)).toEqual([sources[1]]);

  sources[1]!.emit("ping");
  vi.advanceTimersByTime(50_000);
  expect(sources[2]!.url).toBe("/api/sessions/s1/stream?lastEventId=e-2");
  expect(live(sources)).toEqual([sources[2]]);
});

it("a stream that keeps pinging is never reopened", () => {
  const { sources } = subscribe();
  greet(sources[0]!, "e-1");
  for (let beat = 0; beat < 10; beat++) {
    vi.advanceTimersByTime(20_000);
    sources[0]!.emit("ping");
  }
  expect(sources).toHaveLength(1);
});

it("becoming visible past the window reopens the stream at once, though no timer ran", () => {
  const { sources, setVisibility } = subscribe();
  greet(sources[0]!, "e-1");
  vi.setSystemTime(Date.now() + 120_000);
  setVisibility("hidden");
  expect(sources).toHaveLength(1);
  setVisibility("visible");
  expect(sources[1]!.url).toBe("/api/sessions/s1/stream?lastEventId=e-1");
  expect(live(sources)).toEqual([sources[1]]);
});

it("a stream that never pinged is left alone: no silence window, no dead-on-arrival watch", () => {
  const { sources, setVisibility } = subscribe();
  sources[0]!.emit("server_event", JSON.stringify({ type: "task_state", state: "idle" }), "e-1");
  vi.advanceTimersByTime(60 * 60_000);
  setVisibility("visible");
  expect(live(sources)).toEqual([sources[0]]);
});

it("a connection that delivers nothing is reopened at the deadline, and three of them stall the stream", () => {
  const { sources, liveness } = subscribe();
  silence(29_000);
  expect(sources).toHaveLength(1);
  silence(1_000);
  expect(sources[1]!.url).toBe("/api/sessions/s1/stream");

  silence(30_000);
  expect(sources).toHaveLength(3);
  silence(30_000);
  // Three in a row: nothing is left open, the caller is told once, and no connection is made
  // on the next tick.
  expect(liveness).toEqual(["stalled"]);
  expect(live(sources)).toEqual([]);
  silence(59_000);
  expect(sources).toHaveLength(3);

  // The probe opens one connection, which gets the same first-frame window as any other.
  silence(1_000);
  expect(sources).toHaveLength(4);
  expect(live(sources)).toEqual([sources[3]]);
  silence(30_000);
  expect(liveness).toEqual(["stalled"]);
  expect(live(sources)).toEqual([]);
});

it("one frame on a probe brings a stalled stream back to live, and the probing stops", () => {
  const { sources, liveness } = subscribe();
  silence(90_000);
  expect(liveness).toEqual(["stalled"]);
  silence(60_000);
  sources[3]!.emit("server_event", JSON.stringify({ type: "task_state", state: "idle" }), "e-9");
  expect(liveness).toEqual(["stalled", "live"]);
  silence(60 * 60_000);
  expect(sources).toHaveLength(4);
});

it("a probe the browser gives up on does not end the probing", () => {
  const { sources } = subscribe();
  silence(90_000);
  silence(60_000); // the probe
  expect(sources).toHaveLength(4);
  // The browser closes that probe (a non-200 answer): nothing retries it for us, so the stream
  // schedules the next probe itself rather than leaving the page with a dead stream forever.
  sources[3]!.fail();
  silence(59_000);
  expect(sources).toHaveLength(4);
  silence(1_000);
  expect(sources).toHaveLength(5);
});

it("a stalled stream keeps resuming from the newest id it ever saw", () => {
  const { sources } = subscribe();
  greet(sources[0]!, "e-5");
  silence(50_000); // the greeted connection goes quiet: one immediate reopen
  expect(sources[1]!.url).toBe("/api/sessions/s1/stream?lastEventId=e-5");
  silence(30_000 + 30_000 + 30_000); // three connections in a row with nothing on them
  silence(60_000); // the probe
  expect(sources[4]!.url).toBe("/api/sessions/s1/stream?lastEventId=e-5");
});

it("every frame received is recorded, once recording is on", () => {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key === "penguin.sseFrames" ? "1" : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  expect(sseFramesEnabled()).toBe(true);
  const { sources } = subscribe();
  greet(sources[0]!, "e-1");
  sources[0]!.emit("message", '{"a":1}', "e-2");
  const bytes = (data: string) => new TextEncoder().encode(data).length;
  const snapshot = JSON.stringify({ type: "task_state", state: "running" });
  const frames = sseFrames();
  expect(frames.map((f) => [f.kind, f.channel, f.sessionId, f.event, f.id, f.bytes])).toEqual([
    ["frame", "session", "s1", "server_event", "e-1", bytes(snapshot)],
    ["frame", "session", "s1", "ping", "e-1", bytes("{}")],
    ["frame", "session", "s1", "message", "e-2", bytes('{"a":1}')],
  ]);
  expect(frames[0]!.preview).toBe(snapshot);
});

it.each([
  { how: "the caller closed it", end: (s: Sub) => s.conn.close(), errors: [] },
  { how: "the browser gave up on it", end: (s: Sub) => s.sources[0]!.fail(), errors: [true] },
])("once $how, a stream is never reopened", ({ end, errors }) => {
  const sub = subscribe();
  greet(sub.sources[0]!, "e-1");
  end(sub);
  vi.advanceTimersByTime(60 * 60_000);
  sub.setVisibility("visible");
  expect(live(sub.sources)).toEqual([]);
  expect(sub.errors).toEqual(errors);
});
