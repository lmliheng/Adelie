/**
 * Where a refused save of the proxy options lands (`proxySaveRefusal`). The address is the only
 * field the server validates, so its own rejection belongs under the input; every other way a
 * save can fail is about the whole form, and a toast would dismiss itself over a form that looks
 * untouched.
 *
 * - `invalid_proxy_url` → the address slot, in the app's own words for that code.
 * - Any other server code → the section slot, still localized (not the raw English message).
 * - A value the client raised itself → the section slot, with its own sentence.
 * - Nothing to say → the section slot, with the generic failure.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { proxySaveRefusal } from "../src/features/settings/proxy-save-refusal";

const serverError = (status: number, code: string): ApiError =>
  new ApiError(status, code, "RAW ENGLISH SERVER MESSAGE");

afterEach(() => {
  setActiveStrings(ZH);
});

describe("proxySaveRefusal", () => {
  it("draws the address's own rejection under the input", () => {
    const refusal = proxySaveRefusal(serverError(400, "invalid_proxy_url"));
    expect(refusal.field).toBe("address");
    // Localized from the code — the raw server message never reaches the reader.
    expect(refusal.text).toBe(S.errors.byCode.invalid_proxy_url);
    expect(refusal.text).not.toBe("RAW ENGLISH SERVER MESSAGE");
  });

  it("draws every other server refusal in the section", () => {
    const refusal = proxySaveRefusal(serverError(500, "internal"));
    expect(refusal.field).toBe("section");
    expect(refusal.text).toBe(S.errors.byCode.internal);
    expect(refusal.text).not.toBe("RAW ENGLISH SERVER MESSAGE");
  });

  it("keeps the app's own sentence for a failure raised here", () => {
    const refusal = proxySaveRefusal(new Error("连接已断开"));
    expect(refusal.field).toBe("section");
    expect(refusal.text).toBe("连接已断开");
  });

  it("falls back to the generic text when the value says nothing", () => {
    for (const value of [undefined, null, "boom", {}]) {
      const refusal = proxySaveRefusal(value);
      expect(refusal.field).toBe("section");
      expect(refusal.text).toBe(S.common.unknownError);
    }
  });

  it("follows the active language", () => {
    setActiveStrings(EN);
    const refusal = proxySaveRefusal(serverError(500, "internal"));
    expect(refusal.field).toBe("section");
    expect(refusal.text).toBe(EN.errors.byCode.internal);
    expect(refusal.text).not.toBe(ZH.errors.byCode.internal);
  });
});
