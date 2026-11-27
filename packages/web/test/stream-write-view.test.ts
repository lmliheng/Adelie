/**
 * The 事件流 tab's server-side reading (features/network/stream-write-view.ts): how many frames
 * the server wrote, newest first with offsets from the connection's open, and when the two
 * counts may be compared at all.
 *
 * The rule worth pinning: a record that lost its head cannot prove the browser lost anything, so
 * it reads as "unknown" rather than as a difference — a false alarm is worse than no number.
 */
import { describe, expect, it } from "vitest";
import type { StreamWritesRecord } from "@adelie/server/api";
import { viewStreamWrites } from "../src/features/network/stream-write-view";

const record = (over: Partial<StreamWritesRecord> = {}): StreamWritesRecord => ({
  requestId: "4-abc",
  openedAt: 1_000,
  endedAt: 2_000,
  connections: 1,
  frames: [
    { seq: 1, at: 1_000, event: "server_event", id: "e-1", bytes: 40 },
    { seq: 2, at: 1_250, event: null, id: null, bytes: 12 },
    { seq: 3, at: 1_500, event: "ping", id: null, bytes: 8 },
  ],
  dropped: 0,
  ...over,
});

describe("viewStreamWrites", () => {
  it("counts what was written, newest first, with offsets from the open", () => {
    const view = viewStreamWrites(record(), 3);
    expect(view.written).toBe(3);
    expect(view.kept).toBe(3);
    expect(view.dropped).toBe(0);
    expect(view.ended).toBe(true);
    expect(view.rows.map((r) => [r.seq, r.event, r.offsetMs])).toEqual([
      [3, "ping", 500],
      // The default event has no `event:` line; the protocol names it `message`.
      [2, "message", 250],
      [1, "server_event", 0],
    ]);
  });

  it("compares the two counts only when both are complete", () => {
    expect(viewStreamWrites(record(), 3).gap).toBe("same");
    expect(viewStreamWrites(record(), 2).gap).toBe("server-more");
    expect(viewStreamWrites(record(), 4).gap).toBe("page-more");
    // The page's row is still open: it has no count to compare against.
    expect(viewStreamWrites(record(), null).gap).toBe("unknown");
    // A partial record: the missing frames may simply be gone from the server.
    expect(viewStreamWrites(record({ dropped: 2 }), 5).gap).toBe("unknown");
  });

  it("a record that lost frames says how many, and counts them as written", () => {
    const view = viewStreamWrites(record({ dropped: 7 }), 6);
    expect(view.written).toBe(10);
    expect(view.kept).toBe(3);
    expect(view.dropped).toBe(7);
  });

  it("an open connection is not ended, and a reconnect is one record with two connections", () => {
    expect(viewStreamWrites(record({ endedAt: null }), null).ended).toBe(false);
    expect(viewStreamWrites(record({ connections: 2 }), 3).connections).toBe(2);
  });
});
