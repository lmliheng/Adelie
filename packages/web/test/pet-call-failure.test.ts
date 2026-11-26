/**
 * A failed call says it in the window's own language.
 *
 * The transport names why the handshake did not happen, the relay names why the provider answered
 * as it did, and both do it in codes: before this, the transport's refusal was a Chinese sentence
 * whatever the window's language was, and the relay's was English in a Chinese one.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setActiveStrings, zh } from "../src/lib/strings";
import { en } from "../src/lib/strings-en";
import {
  closedCallText,
  connectFailureText,
  providerErrorText,
  proxyErrorText,
} from "../src/features/pet/voice/call-failure";
import { RealtimeConnectError } from "../src/features/pet/voice/realtime-client";

afterAll(() => setActiveStrings(zh));

describe("what a call that never opened says", () => {
  beforeEach(() => setActiveStrings(zh));

  it("names the socket and the closed handshake apart, in Chinese", () => {
    expect(connectFailureText(new RealtimeConnectError("connect_failed"))).toBe(
      zh.pet.callConnectFailed,
    );
    expect(connectFailureText(new RealtimeConnectError("closed"))).toBe(zh.pet.callClosed);
    // Neither sentence is the other's, and neither is the transport's own English message.
    expect(zh.pet.callConnectFailed).not.toBe(zh.pet.callClosed);
    expect(connectFailureText(new RealtimeConnectError("closed"))).not.toContain("realtime:");
  });

  it("says the same two things in English", () => {
    setActiveStrings(en);
    expect(connectFailureText(new RealtimeConnectError("connect_failed"))).toBe(
      en.pet.callConnectFailed,
    );
    expect(connectFailureText(new RealtimeConnectError("closed"))).toBe(en.pet.callClosed);
  });

  it("leaves an error of its own alone, and has a last resort", () => {
    expect(connectFailureText(new Error("boom"))).toBe("boom");
    expect(connectFailureText("not an error")).toBe(zh.pet.callServiceFailed);
    expect(connectFailureText(undefined)).toBe(zh.pet.callServiceFailed);
  });
});

describe("what the relay's proxy.error frame says", () => {
  beforeEach(() => setActiveStrings(zh));

  it("turns a refused provider into this window's sentence, keeping its answer", () => {
    const text = proxyErrorText({
      type: "proxy.error",
      code: "upstream_rejected",
      detail: "HTTP 401: no",
      message: "The speech service rejected the connection (HTTP 401: no)",
    });
    expect(text).toContain("HTTP 401: no");
    expect(text).not.toContain("rejected");
    // Both languages say it; the provider's own answer is quoted, not translated.
    setActiveStrings(en);
    expect(
      proxyErrorText({ type: "proxy.error", code: "upstream_rejected", detail: "HTTP 401" }),
    ).toContain("HTTP 401");
  });

  it("says nothing about the provider's words when it has none", () => {
    expect(proxyErrorText({ type: "proxy.error", code: "upstream_rejected", detail: "" })).toBe(
      zh.pet.callRejected(""),
    );
    expect(zh.pet.callRejected("")).not.toContain("（");
  });

  it("names a provider it could not reach", () => {
    expect(proxyErrorText({ type: "proxy.error", code: "upstream_unreachable", detail: "" })).toBe(
      zh.pet.callUnreachable,
    );
  });

  it("shows a frame from a server that only sent a sentence as it is", () => {
    expect(
      proxyErrorText({
        type: "proxy.error",
        message: "The speech service rejected the connection.",
      }),
    ).toBe("The speech service rejected the connection.");
    expect(proxyErrorText({ type: "proxy.error" })).toBe(zh.pet.callServiceFailed);
  });
});

describe("what the provider's own error frame says", () => {
  beforeEach(() => setActiveStrings(zh));

  it("keeps the provider's words, and has one of its own", () => {
    expect(providerErrorText({ type: "error", error: { message: "rate limited" } })).toBe(
      "rate limited",
    );
    expect(providerErrorText({ type: "error", error: {} })).toBe(zh.pet.callServiceError);
    expect(providerErrorText({ type: "error" })).toBe(zh.pet.callServiceError);
    setActiveStrings(en);
    expect(providerErrorText({ type: "error", error: {} })).toBe(en.pet.callServiceError);
  });
});

describe("what a call says once it has closed", () => {
  beforeEach(() => setActiveStrings(zh));

  it("keeps the sentence that already explained it", () => {
    const refusal = zh.pet.callRejected("HTTP 401: no");
    expect(closedCallText(refusal)).toBe(refusal);
  });

  it("never shows the socket's own reason, and has a sentence when nothing else said why", () => {
    // The reason arrives as a token — the relay's `upstream`, our own `bye` — and the stage used to
    // put it on screen, on top of the refusal that had just arrived.
    expect(closedCallText("")).toBe(zh.pet.callClosed);
    expect(zh.pet.callClosed).not.toBe("upstream");
    setActiveStrings(en);
    expect(closedCallText("")).toBe(en.pet.callClosed);
  });
});
