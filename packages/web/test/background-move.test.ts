/**
 * "Send to background" refused (src/features/chat/background-move.ts): which answers settle the
 * row by themselves, and which words the sentence under that row uses.
 *
 * The route's two named answers (404 the call stopped, 409 the tool has no background form) leave
 * nothing to retry and nothing to explain — the card settles on its own — so they must produce no
 * sentence at all. Everything else did happen and did fail: the row is still there with its
 * action, which is the retry, and the sentence is the only thing saying why the press changed
 * nothing (7.19's rule: an answer the server gave speaks the interface's own language).
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { backgroundMoveAnswer, backgroundMoveRefused } from "../src/features/chat/background-move";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("backgroundMoveAnswer", () => {
  it("stays quiet about a call that stopped, and about a tool with no background form", () => {
    expect(backgroundMoveAnswer(new ApiError(404, "tool_call_not_found", "RAW"))).toEqual({
      kind: "settled",
    });
    expect(backgroundMoveAnswer(new ApiError(409, "tool_not_detachable", "RAW"))).toEqual({
      kind: "settled",
    });
    expect(backgroundMoveRefused(backgroundMoveAnswer(new ApiError(409, "x", "RAW")))).toBeNull();
  });

  it("carries every other failure back as the raw error, for the row to say", () => {
    const error = new ApiError(500, "internal", "RAW");
    expect(backgroundMoveAnswer(error)).toEqual({ kind: "refused", error });
    // A request that never reached the route is a failure too, not a silent no-op.
    expect(backgroundMoveAnswer(new Error("Failed to fetch")).kind).toBe("refused");
  });
});

describe("backgroundMoveRefused", () => {
  it("reads a refusal through the code's own sentence, not the wire message", () => {
    const line = backgroundMoveRefused(backgroundMoveAnswer(new ApiError(500, "internal", "RAW")));
    expect(line).not.toContain("RAW");
    expect(line).toBe(S.chat.backgroundMoveRefused(S.errors.byCode.internal as string));
  });

  it("keeps what a request that never reached the route has to say", () => {
    expect(backgroundMoveRefused(backgroundMoveAnswer(new Error("Failed to fetch")))).toBe(
      S.chat.backgroundMoveRefused("Failed to fetch"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(backgroundMoveRefused(backgroundMoveAnswer(undefined))).toBe(
      S.chat.backgroundMoveRefused(S.common.unknownError),
    );
  });

  it("says nothing when the call moved", () => {
    expect(backgroundMoveRefused({ kind: "moved" })).toBeNull();
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(backgroundMoveRefused(backgroundMoveAnswer(new Error("boom")))).toBe(
      "Couldn't send this call to the background: boom",
    );
    expect(backgroundMoveRefused(backgroundMoveAnswer(new Error("boom")))).toBe(
      EN.chat.backgroundMoveRefused("boom"),
    );
  });
});
