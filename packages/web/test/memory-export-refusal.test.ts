/**
 * A memory group's export that did not land (src/features/agents/memory-export-refusal.ts): the
 * sentence that group draws, and the one thing it must not do — speak for another group.
 *
 * The export writes nothing on the server and moves no client state, so a refusal leaves the
 * group, its memories and the same button on screen — the sentence is the only thing saying no
 * file was saved. Three things it has to get right: an answer the server gave speaks the
 * interface's own language rather than the wire message (7.19's rule), a failure this codebase
 * raised itself keeps what it knows, and it names the group it is about.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import {
  memoryExportRefusalFor,
  memoryExportRefused,
} from "../src/features/agents/memory-export-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("memoryExportRefused", () => {
  it("reads a refusal through the code's own sentence, not the wire message", () => {
    const line = memoryExportRefused("用户记忆", new ApiError(500, "internal", "RAW ENGLISH"));
    expect(line).not.toContain("RAW ENGLISH");
    expect(line).toBe(S.memory.exportRefused("用户记忆", S.errors.byCode.internal as string));
  });

  it("keeps what a failure that never reached the route has to say", () => {
    expect(memoryExportRefused("用户记忆", new Error("Failed to fetch"))).toBe(
      S.memory.exportRefused("用户记忆", "Failed to fetch"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(memoryExportRefused("用户记忆", undefined)).toBe(
      S.memory.exportRefused("用户记忆", S.common.unknownError),
    );
  });

  it("names the group that was not exported", () => {
    expect(memoryExportRefused("adelie-fork", new Error("boom"))).toContain("adelie-fork");
  });

  it("says the export only read, so no memory changed", () => {
    // A failed export is the one moment a reader wonders whether the attempt went through the
    // files; the sentence answers that without claiming the group still holds what it held.
    expect(memoryExportRefused("用户记忆", new Error("boom"))).toContain("记忆一条都没有被改动");
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(memoryExportRefused("User memory", new ApiError(500, "internal", "RAW"))).toBe(
      EN.memory.exportRefused("User memory", EN.errors.byCode.internal as string),
    );
    expect(memoryExportRefused("User memory", new Error("boom"))).toContain(
      "no memory was changed",
    );
  });
});

describe("memoryExportRefusalFor", () => {
  it("draws nothing when no attempt was refused", () => {
    expect(memoryExportRefusalFor(null, "user")).toBeUndefined();
  });

  it("draws the reason in the group the attempt was made for, and only there", () => {
    const refusal = { scopeKey: "user", text: "not exported" };
    expect(memoryExportRefusalFor(refusal, "user")).toBe("not exported");
    // Another group's card must read exactly as it did before the attempt.
    expect(memoryExportRefusalFor(refusal, "/root/adelie-fork")).toBeUndefined();
  });

  it("claims by key, so two groups whose titles read alike stay apart", () => {
    // Two Workspaces can end in the same folder name; the sentence belongs to one of them.
    const refusal = { scopeKey: "ws:/root/a/adelie", text: "not exported" };
    expect(memoryExportRefusalFor(refusal, "ws:/root/b/adelie")).toBeUndefined();
  });
});
