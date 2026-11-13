/**
 * The Transport view's row derivation (features/traces/transport-rows.ts):
 *
 * - this Session's frames and the page's own user-level ones are kept (the second marked by its
 *   null Session), another Session's channel is dropped;
 * - newest first, capped to the newest rows;
 * - a row's clock carries milliseconds, so frames milliseconds apart keep their order.
 */
import { expect, it } from "vitest";
import type { SseFrameEntry } from "../src/api/sse-frames";
import {
  FRAME_ROW_CAP,
  formatFrameTime,
  transportRows,
} from "../src/features/traces/transport-rows";

function frame(at: number, sessionId: string | null): SseFrameEntry {
  return {
    at,
    kind: "frame",
    channel: sessionId === null ? "events" : "session",
    sessionId,
    event: "ping",
    id: null,
    bytes: 2,
    preview: "{}",
  };
}

it("keeps this Session's frames and the user-level stream's, dropping another Session's", () => {
  const entries = [frame(1, "s1"), frame(2, null), frame(3, "s2"), frame(4, "s1")];
  expect(transportRows(entries, "s1").map((e) => e.at)).toEqual([4, 2, 1]);
});

it("is newest first and capped to the newest rows", () => {
  const entries = Array.from({ length: FRAME_ROW_CAP + 5 }, (_, i) => frame(i + 1, "s1"));
  const rows = transportRows(entries, "s1");
  expect(rows).toHaveLength(FRAME_ROW_CAP);
  expect(rows[0]!.at).toBe(FRAME_ROW_CAP + 5);
  expect(rows.at(-1)!.at).toBe(6);
});

it("reads a row's clock with milliseconds", () => {
  expect(formatFrameTime(new Date(2026, 0, 2, 3, 4, 5, 678).getTime())).toBe("03:04:05.678");
});
