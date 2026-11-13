/**
 * A member write the Project settings dialog was refused (src/lib/member-write-refusal.ts): the
 * sentence the Members page draws above its table.
 *
 * The table stays on screen whether the grant or the revocation was refused, so the sentence is
 * the only thing saying the list did not change — and it is a list, so it has to name the account
 * it is about. Three things it has to get right: an answer the server gave speaks the interface's
 * own language rather than the wire message (7.19's rule), a failure this codebase raised itself
 * keeps what it knows, and the write it is about comes back with it (the section holds one
 * refusal at a time, and which write it was is what a reader retries).
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { memberWriteRefused } from "../src/lib/member-write-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("memberWriteRefused", () => {
  it("names the account and reads the refusal through its code's own sentence", () => {
    const refusal = memberWriteRefused(
      { kind: "add", userId: "ghost" },
      new ApiError(404, "user_not_found", "User does not exist: ghost."),
    );
    expect(refusal.write).toEqual({ kind: "add", userId: "ghost" });
    expect(refusal.text).not.toContain("User does not exist");
    expect(refusal.text).toBe(
      S.project.memberAddRefused("ghost", S.errors.byCode.user_not_found as string),
    );
    expect(refusal.text).toContain("ghost");
  });

  it("says which direction was refused: a removal is not called an addition", () => {
    const add = memberWriteRefused(
      { kind: "add", userId: "bob" },
      new ApiError(409, "already_member", "already"),
    );
    const remove = memberWriteRefused(
      { kind: "remove", userId: "bob" },
      new ApiError(404, "member_not_found", "no such member"),
    );
    expect(remove.text).not.toBe(add.text);
    expect(remove.text).toBe(
      S.project.memberRemoveRefused("bob", S.errors.byCode.member_not_found as string),
    );
  });

  it("keeps what a failure that never reached the route has to say", () => {
    expect(
      memberWriteRefused({ kind: "add", userId: "carol" }, new Error("Failed to fetch")).text,
    ).toBe(S.project.memberAddRefused("carol", "Failed to fetch"));
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(memberWriteRefused({ kind: "remove", userId: "dan" }, undefined).text).toBe(
      S.project.memberRemoveRefused("dan", S.common.unknownError),
    );
  });

  it("speaks the language the interface is in, not the one it was built in", () => {
    setActiveStrings(EN);
    expect(memberWriteRefused({ kind: "add", userId: "eve" }, new Error("boom")).text).toBe(
      EN.project.memberAddRefused("eve", "boom"),
    );
  });
});
