/**
 * A skill's export that did not land (src/features/agents/skill-export-refusal.ts): which words
 * the row that asked draws, and which row draws them.
 *
 * The export writes nothing on the server and moves no client state, so a refusal leaves the row,
 * the installed skill and the same button on screen — the sentence is the only thing saying the zip
 * was not saved. Three things it has to get right: an answer the server gave speaks the interface's
 * own language rather than the wire message (7.19's rule), a failure this codebase raised itself
 * keeps what it knows, and a skill's refusal never shows up under another skill's row.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import {
  skillExportRefusalFor,
  skillExportRefused,
} from "../src/features/agents/skill-export-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("skillExportRefused", () => {
  it("reads a refusal through the code's own sentence, not the wire message", () => {
    const line = skillExportRefused("pdf-tools", new ApiError(500, "internal", "RAW ENGLISH"));
    expect(line).not.toContain("RAW ENGLISH");
    expect(line).toBe(S.skills.exportRefused("pdf-tools", S.errors.byCode.internal as string));
  });

  it("keeps what a failure that never reached the route has to say", () => {
    expect(skillExportRefused("pdf-tools", new Error("Failed to fetch"))).toBe(
      S.skills.exportRefused("pdf-tools", "Failed to fetch"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(skillExportRefused("pdf-tools", undefined)).toBe(
      S.skills.exportRefused("pdf-tools", S.common.unknownError),
    );
  });

  it("names the skill that was not exported", () => {
    expect(skillExportRefused("pdf-tools", new Error("boom"))).toContain("pdf-tools");
  });

  it("says the skill is still installed on the Agent", () => {
    expect(skillExportRefused("pdf-tools", new Error("boom"))).toContain("仍然装在这个 Agent 上");
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(skillExportRefused("pdf-tools", new ApiError(500, "internal", "RAW"))).toBe(
      EN.skills.exportRefused("pdf-tools", EN.errors.byCode.internal as string),
    );
    expect(skillExportRefused("pdf-tools", new Error("boom"))).toContain("still installed");
  });
});

describe("skillExportRefusalFor", () => {
  const refusal = { skill: "pdf-tools", text: "the sentence" };

  it("gives the refusal to the row whose skill it carries", () => {
    expect(skillExportRefusalFor(refusal, "pdf-tools")).toBe("the sentence");
  });

  it("leaves every other row alone", () => {
    expect(skillExportRefusalFor(refusal, "web-search")).toBeUndefined();
  });

  it("draws nothing when the last attempt landed or none was made", () => {
    expect(skillExportRefusalFor(null, "pdf-tools")).toBeUndefined();
  });
});
