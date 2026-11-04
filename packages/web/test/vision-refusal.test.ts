/**
 * The model config dialog's vision-probe line (src/features/models/vision-refusal.ts): which
 * presses leave a sentence under the vision control, and whose words that sentence uses.
 *
 * The probe spends the user's own credential and, when it learns nothing, writes nothing — so this
 * line is the only thing that accounts for the press once the six-second toast is gone. Two of the
 * three outcomes are verdicts the switch itself reports, and the rule that matters most is the
 * first: neither of them leaves a line behind.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { visionProbeRefusal } from "../src/features/models/vision-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("visionProbeRefusal", () => {
  it("leaves no line when the model took the image", () => {
    // Vision was switched on in front of the reader, and that is the whole account of the press.
    expect(visionProbeRefusal({ kind: "answer", result: { outcome: "supported" } })).toBeNull();
  });

  it("leaves no line when the model refused the image", () => {
    // A verdict, not a refusal: the switch went off, which says what was learned.
    expect(visionProbeRefusal({ kind: "answer", result: { outcome: "unsupported" } })).toBeNull();
  });

  it("relays the provider's sentence when the probe learned nothing", () => {
    // The switch must stay where the reader left it, so the reason has to be on the form; the
    // route's own truncated text is what makes a wrong key or endpoint diagnosable.
    expect(
      visionProbeRefusal({
        kind: "answer",
        result: { outcome: "failed", message: "401 Unauthorized: invalid api key" },
      }),
    ).toBe(S.models.detectVisionFailed("401 Unauthorized: invalid api key"));
  });

  it("does not fall back to an empty line when the route names no reason", () => {
    // An empty line under the control would say less than the toast it replaced.
    expect(visionProbeRefusal({ kind: "answer", result: { outcome: "failed" } })).toBe(
      S.models.detectVisionFailed(S.common.unknownError),
    );
  });

  it("does not talk about protocol detection", () => {
    // The press was about images; the sentence that names the protocol is the other button's.
    const line = visionProbeRefusal({ kind: "answer", result: { outcome: "failed" } });
    expect(line).not.toBe(S.models.detectFailedBody);
  });

  it("reads a failed request through its code, so the advice is not misleading", () => {
    // The endpoint was never probed: relaying a provider sentence would claim an answer that never
    // came, so a 500 reads as a 500.
    const line = visionProbeRefusal({
      kind: "failed",
      error: new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"),
    });
    expect(line).toBe(S.models.detectVisionFailed(S.errors.byCode["internal"] as string));
    expect(line).not.toContain("RAW ENGLISH SERVER MESSAGE");
  });

  it("keeps the message of an error the client itself raised", () => {
    // `refusalText`'s rule: only an ApiError goes through the code table; anything else with
    // something to say is shown as it is, and nothing at all falls back to the generic text.
    expect(visionProbeRefusal({ kind: "failed", error: new Error("network down") })).toBe(
      S.models.detectVisionFailed("network down"),
    );
    expect(visionProbeRefusal({ kind: "failed", error: undefined })).toBe(
      S.models.detectVisionFailed(S.common.unknownError),
    );
  });

  it("says what is missing when the form has no model id yet", () => {
    // No id means the route is never asked; the press still has to explain itself.
    expect(visionProbeRefusal({ kind: "unprobeable" })).toBe(S.models.detectVisionNeedsId);
  });

  it("follows the active language", () => {
    setActiveStrings(EN);
    expect(visionProbeRefusal({ kind: "unprobeable" })).toBe(EN.models.detectVisionNeedsId);
    expect(visionProbeRefusal({ kind: "answer", result: { outcome: "failed" } })).toBe(
      EN.models.detectVisionFailed(EN.common.unknownError),
    );
  });
});
