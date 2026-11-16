/**
 * A decision a waiting call's approval block refused (src/features/chat/approval-refusal.ts):
 * which words that block draws above its two buttons.
 *
 * Nothing was written, so the block keeps asking with the same two buttons — they are the retry,
 * and the sentence is the only thing saying why the press changed nothing. What it must get
 * right: a server answer speaks the interface's own language rather than the wire message, a
 * write that never reached the route keeps what it knows (7.19's rule), the decision that did not
 * get through is named (the two buttons sit side by side), and the sentence says the call is
 * still waiting — the fact the unchanged block cannot state on its own.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { approvalAnswerRefused } from "../src/features/chat/approval-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("approvalAnswerRefused", () => {
  it("reads a refusal through the code's own sentence, not the wire message", () => {
    const line = approvalAnswerRefused("allow", new ApiError(500, "internal", "RAW ENGLISH"));
    expect(line).not.toContain("RAW ENGLISH");
    expect(line).toBe(
      S.chat.approvalAnswerRefused(S.chat.approve, S.errors.byCode.internal as string),
    );
  });

  it("names the decision that did not get through — allow and deny read differently", () => {
    const denied = approvalAnswerRefused("deny", new ApiError(500, "internal", "RAW ENGLISH"));
    expect(approvalAnswerRefused("allow", new ApiError(500, "internal", "RAW"))).toContain(
      S.chat.approve,
    );
    expect(denied).toContain(S.chat.deny);
    expect(denied).not.toContain(S.chat.approve);
  });

  it("keeps what a decision that never reached the route has to say", () => {
    expect(approvalAnswerRefused("allow", new Error("Failed to fetch"))).toBe(
      S.chat.approvalAnswerRefused(S.chat.approve, "Failed to fetch"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(approvalAnswerRefused("allow", undefined)).toBe(
      S.chat.approvalAnswerRefused(S.chat.approve, S.common.unknownError),
    );
  });

  it("says the call is still waiting, in both dictionaries", () => {
    // The unchanged block cannot state this on its own: it looks exactly like a call nobody has
    // answered yet, which is what it is again once the write is refused.
    expect(S.chat.approvalAnswerRefused(S.chat.approve, "x")).toContain("仍在等你回答");
    setActiveStrings(EN);
    expect(EN.chat.approvalAnswerRefused(EN.chat.approve, "x")).toContain("still waiting on you");
  });
});
