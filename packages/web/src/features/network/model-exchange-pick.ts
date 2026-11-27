/**
 * Which of the server's model exchanges a panel row is about.
 *
 * A model row's boundaries come from the stream's own `request_begin` / `request_end` events, and
 * the bodies come from the server's ring (services/model-exchange-log.ts), fetched when the row is
 * opened. The pair is matched by time: the ring reports each call's `startedAt` / `endedAt` on the
 * SERVER's clock, and `request_end` carries the same clock's timestamp, so the nearest record to
 * that timestamp is this call. Nothing else ties the two together — the stream event has no field
 * the ring could be asked by.
 *
 * The window is what keeps a neighbour from being read as this row: a multi-step turn makes one
 * call per step, and a few seconds separate two of them. A record further away than the window is
 * a different call, so the row is left without bodies rather than filled with someone else's.
 */
export const MODEL_EXCHANGE_MATCH_MS = 5_000;

/** The fields this module needs from a record; the rest of the exchange is the caller's. */
export interface ModelExchangeTiming {
  endedAt: number;
}

/**
 * The record that ended closest to `endedAt`, or null when the ring has nothing within the window
 * (it keeps only the newest MODEL_EXCHANGE_CAP calls process-wide, so an older row has none).
 */
export function pickModelExchange<T extends ModelExchangeTiming>(
  exchanges: readonly T[],
  endedAt: number,
): T | null {
  let best: T | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const item of exchanges) {
    const gap = Math.abs(item.endedAt - endedAt);
    if (gap > MODEL_EXCHANGE_MATCH_MS) continue;
    if (gap < bestGap) {
      best = item;
      bestGap = gap;
    }
  }
  return best;
}
