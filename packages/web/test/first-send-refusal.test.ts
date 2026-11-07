/**
 * A draft's first message that did not go out (src/features/chat/first-send-refusal.ts): which
 * words the sentence under the input card uses.
 *
 * The card keeps the message and its send button is the retry, so the sentence is what says why
 * the press changed nothing — after six seconds a notification would have said nothing at all.
 * Two things it must get right: a server answer speaks the interface's language (with the model's
 * name where the copy needs it), and a send that never reached the route keeps what it knows
 * instead of flattening to the generic text (7.19's rule).
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { sendRefusalReason, sendRefused } from "../src/features/chat/first-send-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("sendRefusalReason", () => {
  it("reads a refusal through the code's own sentence, not the wire message", () => {
    // `no_default_model` has an interface sentence of its own; the English body must not reach it.
    const reason = sendRefusalReason(new ApiError(400, "no_default_model", "RAW ENGLISH"));
    expect(reason).toBe(S.errors.noDefaultModel);
    expect(reason).not.toContain("RAW ENGLISH");
  });

  it("names the model the draft was aimed at when the key is missing", () => {
    // The body of `model_credential_missing` carries no model id; the draft's own pick supplies it.
    const reason = sendRefusalReason(
      new ApiError(400, "model_credential_missing", "RAW ENGLISH"),
      "deepseek-flash",
    );
    expect(reason).toBe(S.errors.modelCredentialMissing("deepseek-flash"));
    expect(reason).toContain("deepseek-flash");
  });

  it("keeps what a send that never reached the route has to say", () => {
    expect(sendRefusalReason(new Error("Failed to fetch"))).toBe("Failed to fetch");
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(sendRefusalReason(undefined)).toBe(S.common.unknownError);
    expect(sendRefusalReason(new Error("  "))).toBe(S.common.unknownError);
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(sendRefusalReason(new ApiError(400, "no_default_model", "no default"))).toBe(
      EN.errors.noDefaultModel,
    );
  });
});

describe("sendRefused", () => {
  it("names what failed, then the reason", () => {
    const line = sendRefused("没有可用的默认模型。");
    expect(line).toBe(S.chat.draftSendRefused("没有可用的默认模型。"));
    expect(line.endsWith("没有可用的默认模型。")).toBe(true);
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(sendRefused("denied")).toBe(EN.chat.draftSendRefused("denied"));
    expect(sendRefused("denied")).toBe("Could not send this message: denied");
  });
});
