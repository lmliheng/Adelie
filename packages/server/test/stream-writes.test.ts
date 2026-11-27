/**
 * The server's record of what it wrote to an SSE stream (services/stream-writes.ts) and the
 * endpoint the "网络" panel reads it through.
 *
 * - The ring itself: frames in write order with a continuous seq, the per-connection frame cap
 *   carrying its own "how many fell out", the newest-N connections, and an evicted connection
 *   that later writes do not resurrect holding only its tail.
 * - Over a real stream: a page that names its connection (`?requestId=`) gets its frames
 *   recorded with the ids and event names that actually went out, and the route hands them back
 *   to the Session's own reader — and to nobody else.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sessionRow, uniqueSessionId } from "./fixtures/session.js";
import { createTestApp, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";
import {
  noteStreamClose,
  noteStreamOpen,
  noteStreamWrite,
  parseStreamRequestId,
  readStreamWrites,
  resetStreamWritesForTests,
  STREAM_WRITE_FRAMES_CAP,
  STREAM_WRITE_STREAMS_CAP,
} from "../src/services/stream-writes.js";

/** Reads the first `count` frames of an SSE response (skipping heartbeat comment lines), then cancels the stream. */
async function readSseFrames(res: Response, count: number, timeoutMs = 3000) {
  expect(res.status).toBe(200);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const frames: { event?: string; id?: string; data: string }[] = [];
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (frames.length < count) {
      if (Date.now() > deadline) throw new Error(`SSE read timed out (${frames.length} frames)`);
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        const frame: { event?: string; id?: string; data: string } = { data: "" };
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) frame.event = line.slice(6).trim();
          else if (line.startsWith("id:")) frame.id = line.slice(3).trim();
          else if (line.startsWith("data:")) frame.data += line.slice(5).trim();
        }
        frames.push(frame);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return frames;
}

describe("stream-writes ring", () => {
  beforeEach(() => {
    resetStreamWritesForTests();
  });

  it("keeps frames in write order with a continuous seq, and closes with a stamp", () => {
    noteStreamOpen("s1", "3-abc", 1_000);
    noteStreamWrite("s1", "3-abc", { event: "server_event", id: "e-1", bytes: 10 }, 1_010);
    noteStreamWrite("s1", "3-abc", { event: null, id: null, bytes: 4 }, 1_020);
    noteStreamClose("s1", "3-abc", 1_030);
    const record = readStreamWrites("s1", "3-abc");
    expect(record).not.toBeNull();
    expect(record!.openedAt).toBe(1_000);
    expect(record!.endedAt).toBe(1_030);
    expect(record!.connections).toBe(1);
    expect(record!.dropped).toBe(0);
    expect(record!.frames.map((f) => [f.seq, f.event, f.id, f.bytes])).toEqual([
      [1, "server_event", "e-1", 10],
      [2, null, null, 4],
    ]);
  });

  it("a reconnect under the same id adds a connection, not a record", () => {
    noteStreamOpen("s1", "8-abc", 1_000);
    noteStreamWrite("s1", "8-abc", { event: "ping", id: null, bytes: 4 }, 1_001);
    noteStreamClose("s1", "8-abc", 1_002);
    noteStreamOpen("s1", "8-abc", 2_000);
    expect(readStreamWrites("s1", "8-abc")).toMatchObject({ connections: 2, endedAt: null });
  });

  it("keeps the newest frames and counts what fell out; seq keeps counting", () => {
    noteStreamOpen("s1", "cap", 0);
    for (let i = 0; i < STREAM_WRITE_FRAMES_CAP + 5; i++) {
      noteStreamWrite("s1", "cap", { event: "message", id: null, bytes: 1 }, i);
    }
    const record = readStreamWrites("s1", "cap")!;
    expect(record.frames).toHaveLength(STREAM_WRITE_FRAMES_CAP);
    expect(record.dropped).toBe(5);
    expect(record.frames[0]!.seq).toBe(6);
    expect(record.frames.at(-1)!.seq).toBe(STREAM_WRITE_FRAMES_CAP + 5);
  });

  it("keeps the newest connections, and a write to an evicted one does not bring back a tail", () => {
    for (let i = 0; i < STREAM_WRITE_STREAMS_CAP; i++) noteStreamOpen("s1", `s-${i}`, i);
    noteStreamOpen("s1", "newest", 10_000);
    expect(readStreamWrites("s1", "s-0")).toBeNull();
    // The reporter under the evicted id is still open on the wire: its writes are dropped, not
    // filed as a fresh record that would read as the whole connection.
    noteStreamWrite("s1", "s-0", { event: "message", id: null, bytes: 2 }, 10_001);
    expect(readStreamWrites("s1", "s-0")).toBeNull();
    expect(readStreamWrites("s1", "newest")).not.toBeNull();
  });

  it("a record is per Session: two pages numbering from 1 do not share frames", () => {
    noteStreamWrite("a", "1-x", { event: "message", id: null, bytes: 1 }, 0);
    noteStreamWrite("b", "1-x", { event: "message", id: null, bytes: 1 }, 0);
    expect(readStreamWrites("a", "1-x")!.frames).toHaveLength(1);
    expect(readStreamWrites("c", "1-x")).toBeNull();
  });

  it("accepts only a plain connection id", () => {
    expect(parseStreamRequestId("12-m1abc2")).toBe("12-m1abc2");
    expect(parseStreamRequestId(undefined)).toBeUndefined();
    expect(parseStreamRequestId("")).toBeUndefined();
    expect(parseStreamRequestId("a/b")).toBeUndefined();
    expect(parseStreamRequestId("x".repeat(65))).toBeUndefined();
  });
});

describe("stream-writes over a real stream", () => {
  let t: TestApp;
  let cookie: string;
  let SID: string;
  /** The other user's cookie: the record is this Session's, not the process's. */
  let otherCookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    ({ cookie } = await provisionUser(t.app, "writer"));
    ({ cookie: otherCookie } = await provisionUser(t.app, "outsider"));
  });
  afterAll(async () => {
    await t.cleanup();
  });
  beforeEach(() => {
    resetStreamWritesForTests();
    SID = uniqueSessionId();
    t.deps.sessionsRepo.insert(sessionRow(SID, { projectId: "writer-default_project" }));
  });

  const readRoute = (requestId: string, as = cookie) =>
    t.app.request(`/api/sessions/${SID}/stream-writes?requestId=${requestId}`, {
      headers: { cookie: as },
    });

  it("records the frames a named connection really sent, and the route returns them", async () => {
    const requestId = "7-zz1";
    const frames = await readSseFrames(
      await t.app.request(`/api/sessions/${SID}/stream?requestId=${requestId}`, {
        headers: { cookie },
      }),
      2,
    );
    const res = await readRoute(requestId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      record: {
        requestId: string;
        frames: { seq: number; event: string | null; id: string | null }[];
      };
    };
    expect(body.record.requestId).toBe(requestId);
    // The snapshot and the opening ping, with the ids and names that went over the wire.
    expect(body.record.frames.map((f) => f.event)).toEqual(frames.map((f) => f.event ?? null));
    expect(body.record.frames[0]!.id).toBe(frames[0]!.id);
    expect(body.record.frames[1]!.id).toBeNull();
  });

  it("a stream nobody named leaves no record, and another user cannot read this Session's", async () => {
    await readSseFrames(
      await t.app.request(`/api/sessions/${SID}/stream`, { headers: { cookie } }),
      1,
    );
    resetStreamWritesForTests();
    const requestId = "9-zz2";
    await readSseFrames(
      await t.app.request(`/api/sessions/${SID}/stream?requestId=${requestId}`, {
        headers: { cookie },
      }),
      1,
    );
    expect((await (await readRoute("9-none")).json()) as { record: unknown }).toEqual({
      record: null,
    });
    expect((await readRoute(requestId, otherCookie)).status).toBe(404);
  });
});
