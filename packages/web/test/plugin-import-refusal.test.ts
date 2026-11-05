/**
 * The plugin import dialogs' failure branch (src/features/plugins/plugin-import-refusal.ts):
 * which of the three things one failed import does, and whose words it uses.
 *
 * A refused import writes nothing, so the dialog that asked is still open with the address or
 * the picked archive in it — that surface is where the sentence belongs, and it is the whole
 * reason this test exists: a toast would be gone after six seconds while the thing to fix sits
 * on screen. The two exceptions have to keep their old homes: a 409 is a question (the overwrite
 * confirmation), and a failure that lands after the dialog was closed has no surface to go to.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { importFailure } from "../src/features/plugins/plugin-import-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("importFailure", () => {
  it("asks about overwriting when the name is taken, naming the plugin", () => {
    // The route's own wording (see http/routes/plugins.ts): the name is in the message.
    const refused = new ApiError(
      409,
      "plugin_exists",
      "A user plugin named use-firecrawl is already installed.",
    );
    expect(importFailure(refused, "fallback-name", true)).toEqual({
      kind: "ask",
      pluginName: "use-firecrawl",
    });
    // Even with the dialog closed: a question is asked wherever the reader is, and the
    // confirmation carries its own Cancel (nothing is written without an answer).
    expect(importFailure(refused, "fallback-name", false).kind).toBe("ask");
  });

  it("gives the question a name the server did not, when the message carries none", () => {
    const refused = new ApiError(409, "plugin_exists", "that plugin is already installed");
    expect(importFailure(refused, "from-the-url", true)).toEqual({
      kind: "ask",
      pluginName: "from-the-url",
    });
  });

  it("keeps a refused import in the dialog that asked, while it is still open", () => {
    // `download_failed` has its own copy in S.plugins.importErrors — the reason the plugin
    // codes do not go through the generic table.
    const answer = importFailure(
      new ApiError(502, "download_failed", "RAW ENGLISH SERVER MESSAGE"),
      "x",
      true,
    );
    expect(answer).toEqual({ kind: "field", text: S.plugins.importErrors.download_failed });
    expect(S.plugins.importErrors.download_failed).not.toContain("RAW ENGLISH");
  });

  it("falls back to the shared code table for a code the plugin routes do not own", () => {
    const answer = importFailure(new ApiError(500, "internal", "RAW ENGLISH"), "x", true);
    expect(answer).toEqual({ kind: "field", text: S.errors.byCode["internal"] as string });
  });

  it("toasts instead when the dialog was closed before the answer came back", () => {
    // Both dialogs' Cancel stays live during an import, so the answer can land on a closed
    // dialog — a sentence drawn there would be a sentence nobody reads.
    expect(importFailure(new ApiError(500, "internal", "x"), "x", false)).toEqual({
      kind: "toast",
      text: S.errors.byCode["internal"] as string,
    });
  });

  it("shows an error the client raised itself as it wrote it", () => {
    // `refusalText`'s rule: only an ApiError is read through a code table.
    expect(importFailure(new TypeError("Failed to fetch"), "x", true)).toEqual({
      kind: "field",
      text: "Failed to fetch",
    });
    expect(importFailure(undefined, "x", true)).toEqual({
      kind: "field",
      text: S.common.unknownError,
    });
  });

  it("speaks the interface language", () => {
    setActiveStrings(EN);
    const answer = importFailure(new ApiError(502, "download_failed", "raw"), "x", true);
    expect(answer).toEqual({ kind: "field", text: S.plugins.importErrors.download_failed });
    expect(S.plugins.importErrors.download_failed).toContain("download failed");
  });
});
