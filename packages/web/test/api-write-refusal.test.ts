/**
 * The API tab's three ask-nothing-first writes (src/features/agents/api-write-refusal.ts): which
 * words a refusal leaves under the switch or the select that asked, and which fact each of those
 * sentences has to carry.
 *
 * The controls never move on their own — they show what the server stored — so a refused write
 * leaves them exactly where they were. Each sentence therefore names the state the reader is
 * actually in: the API still off, the mode still the stored one (with the mode asked for, which is
 * what fell back), and keyless access still open.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import {
  apiApprovalModeRefused,
  apiEnabledRefused,
  apiKeylessOffRefused,
} from "../src/features/agents/api-write-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("apiEnabledRefused", () => {
  it("says the API is still off, with the server's reason", () => {
    const line = apiEnabledRefused(new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"));
    expect(line).toBe(S.agent.apiEnableRefused(S.errors.byCode["internal"] as string));
    expect(line).toContain(S.errors.byCode["internal"] as string);
    expect(line).not.toContain("RAW ENGLISH SERVER MESSAGE");
  });

  it("keeps a sentence the interface raised itself", () => {
    expect(apiEnabledRefused(new Error("位置没有找到"))).toBe(
      S.agent.apiEnableRefused("位置没有找到"),
    );
  });

  it("falls back to the generic text when the value has nothing to say", () => {
    expect(apiEnabledRefused(undefined)).toBe(S.agent.apiEnableRefused(S.common.unknownError));
  });

  it("speaks the interface's own language in English too", () => {
    setActiveStrings(EN);
    expect(apiEnabledRefused(new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"))).toBe(
      EN.agent.apiEnableRefused(EN.errors.byCode["internal"] as string),
    );
  });
});

describe("apiApprovalModeRefused", () => {
  it("names the mode that was asked for, because the select fell back to the stored one", () => {
    const line = apiApprovalModeRefused(
      "always-ask",
      new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"),
    );
    expect(line).toBe(
      S.agent.apiApprovalModeRefused(
        S.chat.approvalModeNames["always-ask"] as string,
        S.errors.byCode["internal"] as string,
      ),
    );
    expect(line).toContain(S.chat.approvalModeNames["always-ask"] as string);
  });

  it("reads the reason through its code rather than the wire message", () => {
    const line = apiApprovalModeRefused("read-only", new ApiError(409, "internal", "RAW ENGLISH"));
    expect(line).not.toContain("RAW ENGLISH");
  });

  it("names the mode in English as well", () => {
    setActiveStrings(EN);
    expect(apiApprovalModeRefused("read-only", new ApiError(500, "internal", "RAW ENGLISH"))).toBe(
      EN.agent.apiApprovalModeRefused(
        EN.chat.approvalModeNames["read-only"] as string,
        EN.errors.byCode["internal"] as string,
      ),
    );
  });
});

describe("apiKeylessOffRefused", () => {
  it("says keyless access is still open — the exposure the press tried to close", () => {
    const line = apiKeylessOffRefused(new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"));
    expect(line).toBe(S.agent.apiKeylessOffRefused(S.errors.byCode["internal"] as string));
    // The half a reader has to act on: the switch never moved, so anything reaching the address
    // still gets in without a key.
    expect(line).toContain("仍然");
    expect(line).not.toContain("RAW ENGLISH SERVER MESSAGE");
  });

  it("keeps a sentence the interface raised itself", () => {
    expect(apiKeylessOffRefused(new Error("网络不通"))).toBe(
      S.agent.apiKeylessOffRefused("网络不通"),
    );
  });
});
