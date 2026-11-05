/**
 * The handbook editor's refusal line (src/features/company/handbook-save-refusal.ts): whose words
 * the sentence uses, and when it also says the draft never left the editor.
 *
 * A refused save leaves the editor open with the draft in it, so this line is the only thing on
 * screen that accounts for the failure once the six-second toast is gone. Two facts have to hold:
 * the reason is the localized one (never the server's English), and the line says the typed text
 * was not written only when the editor actually holds text the file does not.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { handbookSaveRefusal } from "../src/features/company/handbook-save-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("handbookSaveRefusal", () => {
  it("reads a refused write through its code, so the line is the localized one", () => {
    const line = handbookSaveRefusal(
      new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"),
      "draft",
      "stored",
    );
    expect(line).toContain(S.errors.byCode["internal"] as string);
    expect(line).not.toContain("RAW ENGLISH SERVER MESSAGE");
  });

  it("keeps the message of an error the client itself raised", () => {
    // `refusalText`'s rule: only an ApiError goes through the code table.
    expect(handbookSaveRefusal(new Error("disk full"), "draft", "stored")).toContain("disk full");
    expect(handbookSaveRefusal(undefined, "draft", "stored")).toContain(S.common.unknownError);
  });

  it("says the edits were not written while the editor holds text the file does not", () => {
    const line = handbookSaveRefusal(new Error("disk full"), "edited", "stored");
    expect(line).toBe(S.company.handbook.saveRefusedDraftKept("disk full"));
    expect(line).toContain("编辑器里的改动没有写进文件");
  });

  it("leaves that half out when the draft is exactly what the file holds", () => {
    // Save pressed on a document nobody edited: nothing was lost, so the line is just the reason.
    const line = handbookSaveRefusal(new Error("disk full"), "same", "same");
    expect(line).toBe(S.company.handbook.saveRefused("disk full"));
    expect(line).not.toContain("编辑器里的改动");
  });

  it("speaks the interface language", () => {
    setActiveStrings(EN);
    expect(handbookSaveRefusal(new Error("disk full"), "edited", "stored")).toBe(
      S.company.handbook.saveRefusedDraftKept("disk full"),
    );
    expect(S.company.handbook.saveRefusedDraftKept("disk full")).toContain("still in the editor");
  });
});
