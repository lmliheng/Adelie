/**
 * A compaction threshold the write refused (src/features/chat/context-threshold-refusal.ts):
 * which words the confirmation that asked for the write uses.
 *
 * The card stays open on the edited value and the Agent keeps the threshold it had, so the
 * sentence is the only thing saying the write did not land — and it must name the number that was
 * asked for, because that number lives nowhere else once the card is closed. Three things it has
 * to get right: a server answer speaks the interface's own language rather than the wire message,
 * a write that never reached the route keeps what it knows (7.19's rule), and an error with
 * nothing to say falls back to the generic text. The figures go through `humanizeTokens`, so the
 * sentence reads the same as the field and the ring above it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { humanizeTokens } from "../src/lib/format";
import { contextThresholdRefused } from "../src/features/chat/context-threshold-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("contextThresholdRefused", () => {
  it("reads a refusal through the code's own sentence, not the wire message", () => {
    const line = contextThresholdRefused(180000, new ApiError(500, "internal", "RAW ENGLISH"));
    expect(line).not.toContain("RAW ENGLISH");
    expect(line).toBe(
      S.chat.contextThresholdRefused(humanizeTokens(180000), S.errors.byCode.internal as string),
    );
  });

  it("keeps what a write that never reached the route has to say", () => {
    expect(contextThresholdRefused(60000, new Error("Failed to fetch"))).toBe(
      S.chat.contextThresholdRefused(humanizeTokens(60000), "Failed to fetch"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(contextThresholdRefused(60000, undefined)).toBe(
      S.chat.contextThresholdRefused(humanizeTokens(60000), S.common.unknownError),
    );
  });

  it("names the threshold that was asked for, in the figures the field shows", () => {
    const line = contextThresholdRefused(180000, new Error("boom"));
    expect(line).toContain(humanizeTokens(180000));
    // The plain number would be unreadable next to a field that says 180k.
    expect(line).not.toContain("180000");
  });

  it("says the Agent still holds the old value", () => {
    expect(contextThresholdRefused(60000, new Error("boom"))).toContain("原来的值");
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(contextThresholdRefused(180000, new Error("boom"))).toBe(
      `The compaction threshold was not changed to ${humanizeTokens(180000)} — the Agent still has the old value: boom`,
    );
    expect(contextThresholdRefused(180000, new ApiError(500, "internal", "RAW"))).toBe(
      EN.chat.contextThresholdRefused(humanizeTokens(180000), EN.errors.byCode.internal as string),
    );
  });
});
