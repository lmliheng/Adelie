/**
 * Where a refused save or check of the speech input is drawn (src/features/settings/
 * asr-save-refusal.ts): under the input the server named, or in the section for the form as a
 * whole.
 *
 * The three fields are one PUT and one POST, so a failure can be about any of them or about the
 * form. Getting the slot right is the whole point — a sentence under the wrong box sends the
 * reader to edit something the server never complained about — and the words are the app's own
 * for the code the server sent (7.19's rule), not the wire message. A failure that never reached
 * the route keeps what it knows.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { asrRefusal } from "../src/features/settings/asr-save-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("asrRefusal", () => {
  it("puts each field's own rejection under that field, in the interface language", () => {
    const baseUrl = asrRefusal(
      new ApiError(400, "invalid_asr_base_url", "baseUrl must be a full http(s) URL."),
    );
    const model = asrRefusal(new ApiError(400, "invalid_asr_model", "model must not be empty."));
    const apiKey = asrRefusal(
      new ApiError(400, "invalid_asr_api_key", "apiKey must not be empty."),
    );

    expect(baseUrl.slot).toBe("baseUrl");
    expect(model.slot).toBe("model");
    expect(apiKey.slot).toBe("apiKey");
    // The code's own sentence, not the English the wire carried.
    expect(model.text).toBe(S.errors.byCode.invalid_asr_model as string);
    expect(model.text).not.toContain("model must not be empty");
  });

  it("sends a code it has no field for to the section", () => {
    const refusal = asrRefusal(new ApiError(400, "asr_not_configured", "No speech model is set."));
    expect(refusal.slot).toBe("section");
    expect(refusal.text).toBe(S.errors.byCode.asr_not_configured as string);
  });

  it("keeps what a failure that never reached the route has to say", () => {
    expect(asrRefusal(new Error("Failed to fetch"))).toEqual({
      slot: "section",
      text: "Failed to fetch",
    });
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(asrRefusal(undefined)).toEqual({ slot: "section", text: S.common.unknownError });
  });

  it("says a form-wide failure in the language the page is reading", () => {
    const refusal = asrRefusal(new ApiError(500, "internal", "Internal server error"));
    setActiveStrings(EN);
    expect(asrRefusal(new ApiError(500, "internal", "Internal server error")).text).toBe(
      EN.errors.byCode.internal as string,
    );
    // The field's own sentence follows the same dictionary, not just the form-wide one.
    expect(asrRefusal(new ApiError(400, "invalid_asr_api_key", "x")).text).toBe(
      EN.errors.byCode.invalid_asr_api_key as string,
    );
    expect(refusal.text).toBe(ZH.errors.byCode.internal as string);
  });
});
