/**
 * A refused undo of an ignore rule (src/features/usage/ignore-undo-refusal.ts): the sentence the
 * errors panel draws under the button that was pressed.
 *
 * Both hosts of that button stay on screen — the notice keeps its 撤销, the rules list keeps
 * 取消忽略 — so the sentence is the only thing saying the records are still hidden. Four things it
 * has to get right: an answer the server gave speaks the interface's own language rather than the
 * wire message (7.19's rule), the rule it is about comes back with it (two different places on the
 * page may draw it), a failure this codebase raised itself keeps what it knows, and the wording
 * never claims the undo happened.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { ignoreUndoRefused } from "../src/features/usage/ignore-undo-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("ignoreUndoRefused", () => {
  it("names the silenced class and reads the refusal through its code's own sentence", () => {
    const refusal = ignoreUndoRefused(
      "notice",
      12,
      "[llm] llm_retried",
      new ApiError(404, "ignore_rule_not_found", "No such ignore rule in this Project."),
    );
    expect(refusal.id).toBe(12);
    expect(refusal.host).toBe("notice");
    // The wire message is English-only; the sentence the reader gets is the dictionary's, which
    // is also the one thing that says the rule is already gone.
    expect(refusal.text).not.toContain("No such ignore rule");
    expect(refusal.text).toBe(
      S.usage.errorsUnignoreRefused(
        "[llm] llm_retried",
        S.errors.byCode.ignore_rule_not_found as string,
      ),
    );
    expect(refusal.text).toContain("[llm] llm_retried");
  });

  it("keeps the rule's id and the host that asked: only that host may draw the sentence", () => {
    expect(ignoreUndoRefused("rule", 3, "a", new Error("x"))).toMatchObject({
      host: "rule",
      id: 3,
    });
    expect(ignoreUndoRefused("notice", 3, "a", new Error("x")).host).toBe("notice");
  });

  it("says the rule is still in place — the undo did not happen", () => {
    const refusal = ignoreUndoRefused("rule", 1, "label", new Error("boom"));
    expect(refusal.text).toContain("忽略规则还在");
    // Not the success sentence: "已恢复 label 的异常" would say the opposite of what is true.
    expect(refusal.text).not.toBe(S.usage.errorsUnignoreDone("label"));
  });

  it("keeps what a failure that never reached the route has to say", () => {
    expect(ignoreUndoRefused("rule", 1, "label", new Error("Failed to fetch")).text).toBe(
      S.usage.errorsUnignoreRefused("label", "Failed to fetch"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(ignoreUndoRefused("notice", 1, "label", undefined).text).toBe(
      S.usage.errorsUnignoreRefused("label", S.common.unknownError),
    );
  });

  it("speaks the language the interface is in, not the one it was built in", () => {
    setActiveStrings(EN);
    expect(ignoreUndoRefused("notice", 1, "label", new Error("boom")).text).toBe(
      EN.usage.errorsUnignoreRefused("label", "boom"),
    );
  });
});
