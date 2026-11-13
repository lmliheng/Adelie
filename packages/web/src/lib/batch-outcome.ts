/**
 * What a batch action on the conversation list came back with.
 *
 * A batch is N writes, not one: the server has no bulk route, so the batch bar sends one request
 * per ticked conversation and each of them can answer on its own. Reading the outcomes as a whole
 * (`Promise.all`) would therefore drop the rows that DID land behind the first one that did not —
 * the list would then disagree with the server about rows nobody touched — and the refusal would
 * have nowhere to say which rows are still there to retry.
 *
 * So they are read per row (`Promise.allSettled`), here, once: what landed, what was refused, and
 * the first refusal's words (the host shows ONE reason; the rows themselves say which of them did
 * not go).
 */
import type { SessionInfo } from "@adelie/server/api";

/** A row that landed, with whatever its request answered (the archive's PATCH carries the row back). */
export interface BatchLanded<T> {
  target: SessionInfo;
  value: T;
}

export interface BatchOutcome<T> {
  landed: BatchLanded<T>[];
  /** Exactly the rows a retry would still act on, in the order they were ticked. */
  refused: SessionInfo[];
  /** The first refusal's reason, as the request threw it; `undefined` when nothing was refused. */
  firstReason: unknown;
}

/**
 * Splits settled per-row results against the rows they were sent for.
 *
 * `targets[i]` is `results[i]`'s row: both lists come from the same `targets.map(...)`, so a result
 * without its row (or the reverse) is not something to guess about — that pair is skipped rather
 * than counted as either outcome.
 */
export function splitBatchOutcome<T>(
  targets: readonly SessionInfo[],
  results: readonly PromiseSettledResult<T>[],
): BatchOutcome<T> {
  const landed: BatchLanded<T>[] = [];
  const refused: SessionInfo[] = [];
  let firstReason: unknown;
  results.forEach((result, i) => {
    const target = targets[i];
    if (target === undefined) return;
    if (result.status === "fulfilled") {
      landed.push({ target, value: result.value });
      return;
    }
    if (refused.length === 0) firstReason = result.reason;
    refused.push(target);
  });
  return { landed, refused, firstReason };
}
