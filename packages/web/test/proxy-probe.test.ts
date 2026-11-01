/**
 * Which run a failed probe's sentence belongs to (src/features/settings/proxy-probe.ts).
 *
 * The block fires one request per target, so one lost session produces six rejections carrying the
 * same words — and a save advances the run counter while some of them are still in flight. These
 * are the two rules that keep the block honest: one sentence per run, and none from a run that is
 * no longer the live one.
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { probeRefusalFor } from "../src/features/settings/proxy-probe";
import type { ProxyProbeRefusal } from "../src/features/settings/proxy-probe";
import { S } from "../src/lib/strings";

/** What a 500 from the probe route becomes: an enveloped code the dictionary has a sentence for. */
const failed = new ApiError(500, "internal", "Internal server error");
const INTERNAL = S.errors.byCode.internal;

const first: ProxyProbeRefusal = { run: 4, text: INTERNAL };

describe("probeRefusalFor", () => {
  it("draws a failed request's own sentence", () => {
    expect(probeRefusalFor(null, { run: 4, liveRun: 4, error: failed })).toEqual({
      run: 4,
      text: INTERNAL,
    });
  });

  it("keeps the run's first sentence: six rejected targets are one sentence, not six", () => {
    expect(probeRefusalFor(first, { run: 4, liveRun: 4, error: failed })).toBe(first);
  });

  it("says nothing for an answer from a run a save has superseded", () => {
    expect(probeRefusalFor(null, { run: 3, liveRun: 4, error: failed })).toBeNull();
    // A sentence already up is left alone too: this answer describes the path it was about.
    expect(probeRefusalFor(first, { run: 3, liveRun: 4, error: failed })).toBe(first);
  });

  it("lets the next run's sentence replace the last one's", () => {
    expect(probeRefusalFor(first, { run: 5, liveRun: 5, error: failed })).toEqual({
      run: 5,
      text: INTERNAL,
    });
  });

  it("uses the app's words for a dead connection, which is no ApiError from the server", () => {
    // A connection that never reaches the server is the client's own `network_error`, code 0.
    const offline = new ApiError(0, "network_error", S.errors.networkError);
    // `network_error` is not in the dictionary's code table: the client built the sentence itself.
    expect(probeRefusalFor(null, { run: 4, liveRun: 4, error: offline })).toEqual({
      run: 4,
      text: S.errors.networkError,
    });
  });

  it("falls back to the generic words for a value with nothing to say", () => {
    expect(probeRefusalFor(null, { run: 4, liveRun: 4, error: undefined })).toEqual({
      run: 4,
      text: S.common.unknownError,
    });
  });
});
