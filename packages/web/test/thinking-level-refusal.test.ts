/**
 * A thinking level the write refused (src/features/chat/thinking-level-refusal.ts): which words the
 * sentence above the input card uses.
 *
 * Both pickers display the level they read back and never the one that was clicked, so a refused
 * write leaves the control reading as before and the button is the retry — the sentence is the only
 * thing saying why the press changed nothing. Three things it must get right: a server answer
 * speaks the interface's own language rather than the wire message, a write that never reached the
 * route keeps what it knows (7.19's rule), and the draft's picker says out loud that it also left
 * the Agent's default alone.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { thinkingLevelRefused } from "../src/features/chat/thinking-level-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("thinkingLevelRefused", () => {
  it("reads a refusal through the code's own sentence, not the wire message", () => {
    const line = thinkingLevelRefused(new ApiError(500, "internal", "RAW ENGLISH"));
    expect(line).not.toContain("RAW ENGLISH");
    expect(line).toBe(S.chat.thinkingLevelRefused(S.errors.byCode.internal as string));
  });

  it("keeps what a write that never reached the route has to say", () => {
    expect(thinkingLevelRefused(new Error("Failed to fetch"))).toBe(
      S.chat.thinkingLevelRefused("Failed to fetch"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(thinkingLevelRefused(undefined)).toBe(
      S.chat.thinkingLevelRefused(S.common.unknownError),
    );
  });

  it("says the Agent's default is unchanged too, for the draft's picker", () => {
    const line = thinkingLevelRefused(new ApiError(500, "internal", "RAW"), true);
    expect(line).toBe(S.chat.thinkingLevelRefused(S.errors.byCode.internal as string, true));
    expect(line).toContain("Agent");
    // The session's picker only pins this conversation and must not mention the Agent.
    expect(thinkingLevelRefused(new Error("boom"))).not.toContain("Agent");
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(thinkingLevelRefused(new Error("boom"))).toBe(
      "Could not change the thinking level: boom",
    );
    expect(thinkingLevelRefused(new Error("boom"), true)).toBe(
      EN.chat.thinkingLevelRefused("boom", true),
    );
  });
});
