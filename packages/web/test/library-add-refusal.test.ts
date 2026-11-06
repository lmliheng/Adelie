/**
 * A published plugin's row after its "add to the library" write was refused
 * (src/features/plugins/library-add-refusal.ts): which words the row keeps, and whose.
 *
 * The write fetches the package into the plugin library and changes nothing else, so a refusal
 * leaves the same row with the same button — that is where the sentence belongs, and it is the
 * whole reason this test exists: a toast would be gone after six seconds while the retry stayed
 * on screen. The 409 that turns into a question never reaches here (the page asks first).
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { libraryAddRefused } from "../src/features/plugins/library-add-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("libraryAddRefused", () => {
  it("wraps the plugin routes' own words for the codes they answer with", () => {
    // `download_failed` has copy of its own in S.plugins.importErrors — the server's message is
    // English-only and the interface may not be.
    const line = libraryAddRefused(
      new ApiError(502, "download_failed", "RAW ENGLISH SERVER MESSAGE"),
    );
    expect(line).toBe(S.plugins.libraryAddRefused(S.plugins.importErrors.download_failed));
    expect(line).not.toContain("RAW ENGLISH");
  });

  it("falls back to the shared code table for a code the plugin routes do not own", () => {
    const line = libraryAddRefused(new ApiError(500, "internal", "RAW ENGLISH"));
    expect(line).toBe(S.plugins.libraryAddRefused(S.errors.byCode["internal"] as string));
  });

  it("shows an error the client raised itself as it wrote it", () => {
    // `refusalText`'s rule: only an ApiError is read through a code table.
    expect(libraryAddRefused(new TypeError("Failed to fetch"))).toBe(
      S.plugins.libraryAddRefused("Failed to fetch"),
    );
    expect(libraryAddRefused(undefined)).toBe(S.plugins.libraryAddRefused(S.common.unknownError));
  });

  it("names the verb the row offers, so the sentence says which write failed", () => {
    // The row's verb is "add to the library", not the Project's install: the reason has to
    // match the button above it.
    expect(libraryAddRefused(undefined)).toContain(S.plugins.addToLibrary);
  });

  it("speaks the interface language", () => {
    setActiveStrings(EN);
    expect(libraryAddRefused(new ApiError(502, "download_failed", "raw"))).toBe(
      S.plugins.libraryAddRefused(S.plugins.importErrors.download_failed),
    );
    expect(S.plugins.libraryAddRefused("x").toLowerCase()).toContain("add it to the library");
  });
});
