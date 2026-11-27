/**
 * Which record a model row reads: the nearest exchange by its end time, and nothing when the ring
 * has none near it.
 *
 * The panel gets the bodies from the server's ring, and the only key it has is the timestamp
 * `request_end` carried (the same clock the ring stamps records with). Getting the pick wrong is
 * silent — a multi-step turn makes one call per step, so a neighbour's prompt would be shown as
 * this row's — hence the window: a record further away is a different call, and the row is better
 * off saying the server does not have it than showing someone else's.
 */
import { describe, expect, it } from "vitest";
import {
  MODEL_EXCHANGE_MATCH_MS,
  pickModelExchange,
} from "../src/features/network/model-exchange-pick";

const record = (endedAt: number, seq: number) => ({ endedAt, seq });

describe("pickModelExchange", () => {
  it("takes the record that ended at the row's own timestamp", () => {
    const at = 1_760_000_000_000;
    const picked = pickModelExchange(
      [record(at - 4_000, 1), record(at, 2), record(at + 3_000, 3)],
      at,
    );
    expect(picked?.seq).toBe(2);
  });

  it("takes the closest one when two sit inside the window", () => {
    const at = 1_760_000_000_000;
    const picked = pickModelExchange([record(at - 900, 1), record(at + 200, 2)], at);
    expect(picked?.seq).toBe(2);
  });

  it("returns null when the ring has nothing near the row (an older call it no longer keeps)", () => {
    const at = 1_760_000_000_000;
    expect(pickModelExchange([record(at - 60_000, 1), record(at + 30_000, 2)], at)).toBeNull();
  });

  it("returns null for an empty ring, and treats the window's edge as still this call", () => {
    const at = 1_760_000_000_000;
    expect(pickModelExchange([], at)).toBeNull();
    expect(pickModelExchange([record(at - MODEL_EXCHANGE_MATCH_MS, 7)], at)?.seq).toBe(7);
    expect(pickModelExchange([record(at - MODEL_EXCHANGE_MATCH_MS - 1, 8)], at)).toBeNull();
  });
});
