/**
 * A hook package's export that did not land (src/features/agents/hook-export-refusal.ts): which
 * words the row that asked draws, and which row draws them.
 *
 * The export writes nothing on the server and moves no client state, so a refusal leaves the row,
 * the installed package and the same button on screen — the sentence is the only thing saying the
 * zip was not saved. Three things it has to get right: an answer the server gave speaks the
 * interface's own language rather than the wire message (7.19's rule), a failure this codebase
 * raised itself keeps what it knows, and a package's refusal never shows up under another
 * package's row.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import {
  hookExportRefusalFor,
  hookExportRefused,
} from "../src/features/agents/hook-export-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("hookExportRefused", () => {
  it("reads a refusal through the code's own sentence, not the wire message", () => {
    const line = hookExportRefused("shell-warden", new ApiError(500, "internal", "RAW ENGLISH"));
    expect(line).not.toContain("RAW ENGLISH");
    expect(line).toBe(S.hooks.exportRefused("shell-warden", S.errors.byCode.internal as string));
  });

  it("keeps what a failure that never reached the route has to say", () => {
    expect(hookExportRefused("shell-warden", new Error("Failed to fetch"))).toBe(
      S.hooks.exportRefused("shell-warden", "Failed to fetch"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(hookExportRefused("shell-warden", undefined)).toBe(
      S.hooks.exportRefused("shell-warden", S.common.unknownError),
    );
  });

  it("names the hook package that was not exported", () => {
    expect(hookExportRefused("shell-warden", new Error("boom"))).toContain("shell-warden");
  });

  it("says the package is still installed on the Agent", () => {
    expect(hookExportRefused("shell-warden", new Error("boom"))).toContain("仍然装在这个 Agent 上");
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(hookExportRefused("shell-warden", new ApiError(500, "internal", "RAW"))).toBe(
      EN.hooks.exportRefused("shell-warden", EN.errors.byCode.internal as string),
    );
    expect(hookExportRefused("shell-warden", new Error("boom"))).toContain("still installed");
  });
});

describe("hookExportRefusalFor", () => {
  const refusal = { hook: "shell-warden", text: "the sentence" };

  it("gives the refusal to the row whose package it carries", () => {
    expect(hookExportRefusalFor(refusal, "shell-warden")).toBe("the sentence");
  });

  it("leaves every other row alone", () => {
    expect(hookExportRefusalFor(refusal, "session-log")).toBeUndefined();
  });

  it("draws nothing when the last attempt landed or none was made", () => {
    expect(hookExportRefusalFor(null, "shell-warden")).toBeUndefined();
  });
});
