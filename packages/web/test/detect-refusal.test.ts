/**
 * The model config dialog's protocol-detection line (src/features/models/detect-refusal.ts):
 * which presses leave a sentence under the base URL field, and whose words that sentence uses.
 *
 * A detection writes nothing on a miss — the form keeps every value it was asked with — so this
 * line is the only thing that accounts for the press once the six-second toast is gone. The cases
 * below are the three shapes a press comes in and the two languages; the rule that matters most is
 * the first: a press that found a protocol leaves nothing behind.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { detectProtocolRefusal } from "../src/features/models/detect-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("detectProtocolRefusal", () => {
  it("leaves no line when a protocol was found", () => {
    // Where it ended up is the field's suffix, and the hit travels in a toast of its own.
    expect(
      detectProtocolRefusal({
        kind: "answer",
        result: { detected: "openai-chat", baseUrl: "http://h/v1", probes: [] },
      }),
    ).toBeNull();
  });

  it("keeps the one sentence that names what the reader can change", () => {
    // Nothing matched: the route answered, but with no protocol. The per-probe detail behind that
    // is not something the reader can act on, so the sentence names the key and the URL only.
    expect(detectProtocolRefusal({ kind: "answer", result: { probes: [] } })).toBe(
      S.models.detectFailedBody,
    );
  });

  it("says the same for a URL that never left the browser", () => {
    // detectOnce refuses to send it (detectableBaseUrl); the route was never asked, and the answer
    // would have been the same complaint either way.
    expect(detectProtocolRefusal({ kind: "unprobeable" })).toBe(S.models.detectFailedBody);
  });

  it("reads a failed request through its code, so the advice is not misleading", () => {
    // The endpoint was never probed: telling the reader to check the key and the URL would send
    // them to fields that may well be fine, so a 500 reads as a 500.
    const line = detectProtocolRefusal({
      kind: "failed",
      error: new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"),
    });
    expect(line).toBe(S.errors.byCode["internal"] as string);
    expect(line).not.toContain("RAW ENGLISH SERVER MESSAGE");
    expect(line).not.toBe(S.models.detectFailedBody);
  });

  it("keeps the message of an error the client itself raised", () => {
    // `refusalText`'s rule: only an ApiError goes through the code table; anything else with
    // something to say is shown as it is, and nothing at all falls back to the generic text.
    expect(detectProtocolRefusal({ kind: "failed", error: new Error("network down") })).toBe(
      "network down",
    );
    expect(detectProtocolRefusal({ kind: "failed", error: undefined })).toBe(S.common.unknownError);
  });

  it("follows the active language", () => {
    setActiveStrings(EN);
    expect(detectProtocolRefusal({ kind: "answer", result: { probes: [] } })).toBe(
      EN.models.detectFailedBody,
    );
    expect(detectProtocolRefusal({ kind: "unprobeable" })).toBe(EN.models.detectFailedBody);
  });
});
