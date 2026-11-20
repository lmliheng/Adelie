/**
 * Where a refused save of the upload limits is drawn (src/features/settings/uploads-save-refusal.ts):
 * under the two numbers for the pair's own range, in the section for everything else.
 *
 * The form writes both numbers in one PUT, so the server's one statement about them
 * (`invalid_attachment_limit`) is about the pair and draws under both fields. Every other failure —
 * a lost session, a dead server, a 500 — is about the save: nothing was written and the two fields
 * still hold what was typed, so it goes above the Save row, where a toast used to be the only
 * account of it. The words are the app's own for the code the server sent (7.19's rule), and a
 * failure that never reached the route keeps what it knows.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { uploadsSaveRefusal } from "../src/features/settings/uploads-save-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("uploadsSaveRefusal", () => {
  it("puts the pair's own rejection under the two numbers, in the interface language", () => {
    const refusal = uploadsSaveRefusal(
      new ApiError(400, "invalid_attachment_limit", "attachmentMaxMb out of range."),
    );
    expect(refusal.slot).toBe("fields");
    expect(refusal.text).toBe(S.errors.byCode.invalid_attachment_limit as string);
    expect(refusal.text).not.toContain("out of range");
  });

  it("sends any other answer to the form-wide slot", () => {
    const lostSession = uploadsSaveRefusal(new ApiError(401, "unauthorized", "Not signed in."));
    const server = uploadsSaveRefusal(new ApiError(500, "internal", "Internal server error."));
    expect(lostSession.slot).toBe("section");
    expect(server.slot).toBe("section");
    // The reason is still the app's sentence for that code, not the wire's English.
    expect(server.text).toBe(S.errors.byCode.internal as string);
  });

  it("keeps what a failure that never reached the route has to say", () => {
    expect(uploadsSaveRefusal(new Error("Failed to fetch"))).toEqual({
      slot: "section",
      text: "Failed to fetch",
    });
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(uploadsSaveRefusal(undefined)).toEqual({ slot: "section", text: S.common.unknownError });
  });

  it("says both slots in the language the page is reading", () => {
    expect(uploadsSaveRefusal(new ApiError(400, "invalid_attachment_limit", "x")).text).toBe(
      ZH.errors.byCode.invalid_attachment_limit as string,
    );
    setActiveStrings(EN);
    expect(uploadsSaveRefusal(new ApiError(400, "invalid_attachment_limit", "x")).text).toBe(
      EN.errors.byCode.invalid_attachment_limit as string,
    );
    expect(uploadsSaveRefusal(new ApiError(500, "internal", "x")).text).toBe(
      EN.errors.byCode.internal as string,
    );
  });
});
