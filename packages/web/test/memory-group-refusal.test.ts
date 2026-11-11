/**
 * A memory group's whole-group attempt that did not land (src/features/agents/memory-group-refusal.ts):
 * the sentence that group draws — for an export the server would not serve, or a picked file the
 * import never got to read — and the one thing it must not do, speak for another group.
 *
 * Neither attempt writes anything: an export only reads, and a file that fails to parse stops
 * before a request leaves the page. So a refusal leaves the group, its memories and the same control
 * on screen, and the sentence is the only thing saying nothing was written. What it has to get
 * right: an answer the server gave speaks the interface's own language rather than the wire message
 * (7.19's rule), a document this codebase rejected keeps its own words, a value with nothing to say
 * falls back rather than showing a browser's English, and it names the group it is about.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import {
  memoryExportRefused,
  memoryGroupRefusalFor,
  memoryImportRefused,
} from "../src/features/agents/memory-group-refusal";
import { MemoryDocumentError } from "../src/features/agents/memory-transfer";

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

describe("memoryImportRefused", () => {
  it("keeps the document's own words for what is wrong with the file", () => {
    // "This file carries no memories" is the more useful sentence of the two the parser raises;
    // it must not be flattened into the generic one.
    const empty = new MemoryDocumentError(S.memory.importEmptyFile);
    expect(memoryImportRefused("用户记忆", empty)).toBe(
      S.memory.importRefused("用户记忆", S.memory.importEmptyFile),
    );
    expect(memoryImportRefused("用户记忆", empty)).not.toBe(
      S.memory.importRefused("用户记忆", S.memory.importInvalidFile),
    );
  });

  it("says the file is not a memory export when reading it failed for another reason", () => {
    // A File API rejection's message is the browser's own and never localized; the reader is left
    // with a file they cannot use, and that is what the sentence has to say.
    const browserFailure = new DOMException(
      "The requested file could not be read",
      "NotReadableError",
    );
    expect(memoryImportRefused("用户记忆", browserFailure)).toBe(
      S.memory.importRefused("用户记忆", S.memory.importInvalidFile),
    );
    expect(memoryImportRefused("用户记忆", browserFailure)).not.toContain("NotReadableError");
  });

  it("names the group the pick was made for", () => {
    expect(
      memoryImportRefused("adelie-fork", new MemoryDocumentError(S.memory.importInvalidFile)),
    ).toContain("adelie-fork");
  });

  it("says the file was never read, so no memory changed", () => {
    expect(
      memoryImportRefused("用户记忆", new MemoryDocumentError(S.memory.importInvalidFile)),
    ).toContain("记忆一条都没有被改动");
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(
      memoryImportRefused("User memory", new MemoryDocumentError(EN.memory.importInvalidFile)),
    ).toBe(EN.memory.importRefused("User memory", EN.memory.importInvalidFile));
    expect(
      memoryImportRefused("User memory", new DOMException("nope", "NotReadableError")),
    ).toContain("no memory was changed");
  });
});

describe("memoryGroupRefusalFor", () => {
  it("draws nothing when no attempt was refused", () => {
    expect(memoryGroupRefusalFor(null, "user")).toBeUndefined();
  });

  it("draws the reason in the group the attempt was made for, and only there", () => {
    const refusal = { scopeKey: "user", text: "not exported" };
    expect(memoryGroupRefusalFor(refusal, "user")).toBe("not exported");
    // Another group's card must read exactly as it did before the attempt.
    expect(memoryGroupRefusalFor(refusal, "/root/adelie-fork")).toBeUndefined();
  });

  it("claims by key, so two groups whose titles read alike stay apart", () => {
    // Two Workspaces can end in the same folder name; the sentence belongs to one of them.
    const refusal = { scopeKey: "ws:/root/a/adelie", text: "not exported" };
    expect(memoryGroupRefusalFor(refusal, "ws:/root/b/adelie")).toBeUndefined();
  });
});
