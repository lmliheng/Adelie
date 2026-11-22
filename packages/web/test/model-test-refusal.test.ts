/**
 * The model config dialog's "test connection" line (src/features/models/model-test-refusal.ts):
 * which answers leave a sentence under the button row, and whose words that sentence uses.
 *
 * A failed probe changes nothing else in the dialog — the form keeps every value it was asked
 * with, and nothing is written — so this line is the only thing that accounts for the failure once
 * the six-second toast is gone. The cases below are the three shapes the answer comes in, the two
 * pieces of routing advice that replace the route's own vocabulary, and the two languages; the
 * rule that matters most is the first: a probe that connected leaves nothing behind.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { modelTestRefusal } from "../src/features/models/model-test-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("modelTestRefusal", () => {
  it("leaves no line when the probe connected", () => {
    // The latency travels in the success toast; there is no failure for the dialog to keep.
    expect(modelTestRefusal({ result: { ok: true, latencyMs: 120 } }, null)).toBeNull();
    expect(modelTestRefusal({ result: { ok: true } }, null)).toBeNull();
  });

  it("carries the route's own detail behind the sentence's lead-in", () => {
    // What a wrong key or a wrong endpoint looks like: the route's words, relayed as they are.
    const detail = "401 Unauthorized: invalid api key";
    expect(modelTestRefusal({ result: { ok: false, message: detail } }, null)).toBe(
      S.models.testFailed(detail),
    );
  });

  it("still says something when the route refused without a detail", () => {
    expect(modelTestRefusal({ result: { ok: false } }, null)).toBe(
      S.models.testFailed(S.common.unknownError),
    );
  });

  it("reads a failed request through its code, so the line is the localized one", () => {
    const refused = modelTestRefusal(
      { result: null, error: new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE") },
      null,
    );
    expect(refused).toBe(S.models.testFailed(S.errors.byCode["internal"] as string));
    expect(refused).not.toContain("RAW ENGLISH SERVER MESSAGE");
  });

  it("keeps the message of an error the client itself raised", () => {
    // `refusalText`'s rule: only an ApiError goes through the code table; anything else with
    // something to say is shown as it is (a dropped connection, say), not as "unknown".
    expect(modelTestRefusal({ result: null, error: new Error("network down") }, null)).toBe(
      S.models.testFailed("network down"),
    );
    expect(modelTestRefusal({ result: null, error: undefined }, null)).toBe(
      S.models.testFailed(S.common.unknownError),
    );
  });

  it("replaces an unroutable answer with the advice its own shape calls for", () => {
    // The upstream sentence names client types the reader cannot act on, so the line carries the
    // advice instead — the same split the card makes (`unroutableFix`).
    const answer = { result: { ok: false, message: "model X is not supported for client openai" } };
    expect(modelTestRefusal(answer, "sync")).toBe(S.models.testStalePin);
    expect(modelTestRefusal(answer, "custom")).toBe(S.models.testNotRoutable);
    // The advice is about the entry, not about one kind of answer: a request that failed on the
    // way out gets it too.
    expect(modelTestRefusal({ result: null, error: new Error("boom") }, "custom")).toBe(
      S.models.testNotRoutable,
    );
  });

  it("writes its own sentence for a probe that never left the server", () => {
    // `no_endpoint`: a self-hosted group (vLLM, custom, a user-defined one) presets no address,
    // and the form carried none either — so the server refused before dialing instead of waiting
    // out a 20-second timeout at the SDK's own default endpoint. The route's words explain that
    // to an API client; the dialog's line is the interface's, in the reader's language.
    const answer = {
      result: {
        ok: false,
        cause: "no_endpoint" as const,
        message:
          "Model vllm/Qwen/Qwen3.5-9B has no base URL, and its group has none of its own: set the base URL on the model entry to the address the endpoint answers on.",
      },
    };
    expect(modelTestRefusal(answer, null)).toBe(S.models.testNoEndpoint);
    expect(modelTestRefusal(answer, null)).not.toContain("has no base URL");
  });

  it("names the key, not the network, when the credential holds a character no header can carry", () => {
    // undici refuses a header value above U+00FF, and AgentHub hands that back as a retryable
    // network failure whose sentence points at a character position inside a string the reader
    // never sees. Relayed verbatim it read as "连通失败：Cannot convert argument to a ByteString…",
    // which says nothing about the one field that can fix it. The line says which field instead.
    const answer = {
      result: {
        ok: false,
        cause: "key_not_latin1" as const,
        message:
          "Cannot convert argument to a ByteString because the character at index 67 has a value of 32416 which is greater than 255.",
      },
    };
    expect(modelTestRefusal(answer, null)).toBe(S.models.testKeyNotLatin1);
    expect(modelTestRefusal(answer, null)).not.toContain("ByteString");
  });

  it("speaks the active language", () => {
    setActiveStrings(EN);
    expect(modelTestRefusal({ result: { ok: false } }, null)).toBe(
      EN.models.testFailed(EN.common.unknownError),
    );
    expect(modelTestRefusal({ result: { ok: false } }, "sync")).toBe(EN.models.testStalePin);
    expect(modelTestRefusal({ result: { ok: false, cause: "no_endpoint" } }, null)).toBe(
      EN.models.testNoEndpoint,
    );
    expect(modelTestRefusal({ result: { ok: false, cause: "key_not_latin1" } }, null)).toBe(
      EN.models.testKeyNotLatin1,
    );
  });
});
