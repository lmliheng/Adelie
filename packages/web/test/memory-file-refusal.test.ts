/**
 * A memory that did not open (src/features/agents/memory-file-refusal.ts): the sentence the row
 * that asked draws — and the one thing it must not do, speak for another memory.
 *
 * Opening a memory only reads one file: the panel never comes up when the read fails, so nothing is
 * written and the row keeps its eye button as the retry. A reader who asked for a panel and did not
 * get one wonders whether the memory survived it, which is what the sentence answers. What it has to
 * get right: an answer the server gave speaks the interface's own language rather than the wire
 * message (7.19's rule), a value with nothing to say falls back rather than showing an empty colon,
 * and it names the memory it is about.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import {
  memoryFileRefusalFor,
  memoryViewRefused,
} from "../src/features/agents/memory-file-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("memoryViewRefused", () => {
  it("reads a refusal through the code's own sentence, not the wire message", () => {
    const line = memoryViewRefused("probe.md", new ApiError(500, "internal", "RAW ENGLISH"));
    expect(line).not.toContain("RAW ENGLISH");
    expect(line).toBe(S.memory.viewRefused("probe.md", S.errors.byCode.internal as string));
  });

  it("keeps what a failure that never reached the route has to say", () => {
    expect(memoryViewRefused("probe.md", new Error("Failed to fetch"))).toBe(
      S.memory.viewRefused("probe.md", "Failed to fetch"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(memoryViewRefused("probe.md", undefined)).toBe(
      S.memory.viewRefused("probe.md", S.common.unknownError),
    );
  });

  it("names the memory that did not open", () => {
    expect(memoryViewRefused("probe-memory.md", new Error("boom"))).toContain("probe-memory.md");
  });

  it("says opening only read, so no memory changed", () => {
    // A panel that fails to appear is the one moment a reader wonders whether the attempt touched
    // the file; the sentence answers that without claiming anything about its content.
    expect(memoryViewRefused("probe.md", new Error("boom"))).toContain("记忆一条都没有被改动");
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(memoryViewRefused("probe.md", new ApiError(500, "internal", "RAW"))).toBe(
      EN.memory.viewRefused("probe.md", EN.errors.byCode.internal as string),
    );
    expect(memoryViewRefused("probe.md", new Error("boom"))).toContain("no memory was changed");
  });
});

describe("memoryFileRefusalFor", () => {
  it("draws nothing when no read was refused", () => {
    expect(memoryFileRefusalFor(null, "user", "probe.md")).toBeUndefined();
  });

  it("draws the reason in the row that asked, and only there", () => {
    const refusal = { scopeKey: "user", fileName: "probe.md", text: "did not open" };
    expect(memoryFileRefusalFor(refusal, "user", "probe.md")).toBe("did not open");
    // Every other row must read exactly as it did before the attempt.
    expect(memoryFileRefusalFor(refusal, "user", "other.md")).toBeUndefined();
    expect(memoryFileRefusalFor(refusal, "ws:/root/adelie", "probe.md")).toBeUndefined();
  });

  it("claims by scope key and file name, so two memories that read alike stay apart", () => {
    // A memory's title is a label it may share with a memory in another group; the key and the
    // file name are what the request was for.
    const refusal = { scopeKey: "ws:/root/a/adelie", fileName: "notes.md", text: "did not open" };
    expect(memoryFileRefusalFor(refusal, "ws:/root/b/adelie", "notes.md")).toBeUndefined();
    expect(memoryFileRefusalFor(refusal, "ws:/root/a/adelie", "notes.md")).toBe("did not open");
  });
});
