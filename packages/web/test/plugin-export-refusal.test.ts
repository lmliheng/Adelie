/**
 * A user plugin's export that did not land (src/features/plugins/plugin-export-refusal.ts): the
 * sentence the card that asked draws.
 *
 * The export writes nothing on the server and moves no client state, so a refusal leaves the card,
 * the plugin and the same button on screen — the sentence is the only thing saying the zip was not
 * saved. Three things it has to get right: an answer the server gave speaks the interface's own
 * language rather than the wire message (7.19's rule), a failure this codebase raised itself keeps
 * what it knows, and it names the plugin it is about (the card is one of a list).
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { pluginExportRefused } from "../src/features/plugins/plugin-export-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("pluginExportRefused", () => {
  it("reads a refusal through the code's own sentence, not the wire message", () => {
    const line = pluginExportRefused(
      "my-plugin",
      new ApiError(404, "unknown_plugin", "RAW ENGLISH"),
    );
    expect(line).not.toContain("RAW ENGLISH");
    expect(line).toBe(
      S.plugins.exportRefused("my-plugin", S.errors.byCode.unknown_plugin as string),
    );
  });

  it("keeps what a failure that never reached the route has to say", () => {
    expect(pluginExportRefused("my-plugin", new Error("Failed to fetch"))).toBe(
      S.plugins.exportRefused("my-plugin", "Failed to fetch"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(pluginExportRefused("my-plugin", undefined)).toBe(
      S.plugins.exportRefused("my-plugin", S.common.unknownError),
    );
  });

  it("names the plugin that was not exported", () => {
    expect(pluginExportRefused("my-plugin", new Error("boom"))).toContain("my-plugin");
  });

  it("says the export only read, so nothing in the plugin changed", () => {
    // A failed export is the one moment a reader wonders whether the attempt touched the files;
    // the sentence answers that without claiming the plugin is still there (a 404 means it is not).
    expect(pluginExportRefused("my-plugin", new Error("boom"))).toContain("它的文件没有被改动");
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(pluginExportRefused("my-plugin", new ApiError(404, "unknown_plugin", "RAW"))).toBe(
      EN.plugins.exportRefused("my-plugin", EN.errors.byCode.unknown_plugin as string),
    );
    expect(pluginExportRefused("my-plugin", new Error("boom"))).toContain(
      "nothing in it was changed",
    );
  });
});
