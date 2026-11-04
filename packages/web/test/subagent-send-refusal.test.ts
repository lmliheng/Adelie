/**
 * The subagent panel's composer: what a message that never reached the child leaves above the box
 * (src/features/chat/subagent-send-refusal.ts).
 *
 * The composer keeps what was typed when `onSend` answers `false`, so after a refusal the reader
 * is still looking at the draft they meant to send. The line has to name the action, take the
 * server's own words for the reason, and keep the one answer that is about the child rather than
 * the message.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { subagentSendRefused } from "../src/features/chat/subagent-send-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("subagentSendRefused", () => {
  it("names the action and relays the server's words", () => {
    const line = subagentSendRefused(
      new ApiError(500, "subagent_busy", "RAW ENGLISH SERVER MESSAGE"),
    );
    expect(line).toContain("RAW ENGLISH SERVER MESSAGE");
    expect(line).toBe(S.subagentPanel.sendRefused("RAW ENGLISH SERVER MESSAGE"));
  });

  it("draws a released child as the child's sentence, not the message's", () => {
    // `subagent_gone` is about the child: nothing was sent, and the panel is what has to change.
    expect(subagentSendRefused(new ApiError(404, "subagent_gone", "no such subagent"))).toBe(
      S.subagentPanel.subagentGone,
    );
  });

  it("reads a request that failed on the way out through refusalText's rule", () => {
    // A connection that never reached the route raises a plain Error whose message is the only
    // thing known; 7.19 keeps it rather than flattening it to the generic text.
    expect(subagentSendRefused(new Error("Failed to fetch"))).toBe(
      S.subagentPanel.sendRefused("Failed to fetch"),
    );
  });

  it("falls back to the generic sentence when the value has nothing to say", () => {
    expect(subagentSendRefused(undefined)).toBe(S.subagentPanel.sendRefused(S.common.unknownError));
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(subagentSendRefused(new ApiError(409, "subagent_busy", "busy"))).toBe(
      EN.subagentPanel.sendRefused("busy"),
    );
  });
});
