/**
 * A Save the Project settings dialog refused (src/lib/chat-defaults-save-refusal.ts): the
 * sentence the new-chat-defaults page draws under its controls.
 *
 * One Save is up to two writes — the `[default_chat]` block, then the default model — so the
 * sentence's whole job is to say what the Project holds now: a refused block wrote nothing, a
 * refused model write may have arrived after the block landed. Three things it has to get right:
 * an answer the server gave speaks the interface's own language rather than the wire message
 * where a code is mapped (7.19's rule), a failure this codebase raised itself keeps what it
 * knows, and the two halves are never described as the same thing.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { chatDefaultsSaveRefused } from "../src/lib/chat-defaults-save-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("chatDefaultsSaveRefused", () => {
  it("a refused block says nothing was saved, and reads the reason through its code", () => {
    const refusal = chatDefaultsSaveRefused(
      { write: "defaults", defaultsLanded: false },
      new ApiError(404, "agent_not_found", "Agent does not exist: ghost."),
    );
    expect(refusal.attempt).toEqual({ write: "defaults", defaultsLanded: false });
    expect(refusal.text).not.toContain("Agent does not exist");
    expect(refusal.text).toBe(
      S.project.chatDefaultsRefused(S.errors.byCode.agent_not_found as string),
    );
  });

  it("a refused model write after the block landed says which half the Project took", () => {
    const refusal = chatDefaultsSaveRefused(
      { write: "model", defaultsLanded: true },
      new ApiError(400, "bad_request", "defaultModel must be included in models."),
    );
    // The sentence says the block was saved — the one thing a bare error message cannot.
    expect(refusal.text).toBe(
      S.project.chatDefaultsModelRefusedAfterSave("defaultModel must be included in models."),
    );
    expect(refusal.text).toContain("已保存");
    expect(refusal.text).toContain("defaultModel must be included in models.");
  });

  it("a refused model write on its own does not claim anything else was saved", () => {
    const refusal = chatDefaultsSaveRefused(
      { write: "model", defaultsLanded: false },
      new ApiError(400, "bad_request", "defaultModel must be included in models."),
    );
    expect(refusal.text).toBe(
      S.project.chatDefaultsModelRefused("defaultModel must be included in models."),
    );
    expect(refusal.text).not.toContain("已保存");
  });

  it("keeps what a failure that never reached the route has to say", () => {
    expect(
      chatDefaultsSaveRefused(
        { write: "defaults", defaultsLanded: false },
        new Error("Failed to fetch"),
      ).text,
    ).toBe(S.project.chatDefaultsRefused("Failed to fetch"));
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(chatDefaultsSaveRefused({ write: "model", defaultsLanded: true }, undefined).text).toBe(
      S.project.chatDefaultsModelRefusedAfterSave(S.common.unknownError),
    );
  });

  it("speaks the language the interface is in, not the one it was built in", () => {
    setActiveStrings(EN);
    expect(
      chatDefaultsSaveRefused({ write: "model", defaultsLanded: true }, new Error("boom")).text,
    ).toBe(EN.project.chatDefaultsModelRefusedAfterSave("boom"));
  });
});
