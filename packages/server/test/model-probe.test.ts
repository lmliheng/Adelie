/**
 * Model connectivity-probe tests (testModel's pure parts): streamed-content detection, the
 * outcome verdict — in particular the reasoning-heavy-model case where the probe's tiny
 * max_tokens is burned entirely on thinking (finish_reason=length -> AgentHub
 * EmptyResponseError -> malformed outcome) yet the endpoint demonstrably works — and the
 * output-rate guard that keeps a too-small sample from being reported as throughput.
 */
import { describe, expect, it } from "vitest";
import {
  assistantText,
  partialText,
  partialThinking,
  thinkingMessage,
  tokenUsage,
  toolCall,
  emptyTokenCounts,
} from "@adelie/core";
import {
  isProbeContent,
  probeTps,
  probeVerdict,
  headerRefusalCause,
} from "../src/services/project-config-service.js";

describe("isProbeContent", () => {
  it("counts thinking and text content, partial or complete", () => {
    expect(isProbeContent(partialThinking("delta", "let me think"))).toBe(true);
    expect(isProbeContent(partialText("delta", "pong"))).toBe(true);
    expect(isProbeContent(thinkingMessage("burned the whole budget", "retryable"))).toBe(true);
    expect(isProbeContent(assistantText("pong"))).toBe(true);
  });

  it("ignores empty segments, events, and tool calls", () => {
    expect(isProbeContent(partialThinking("start"))).toBe(false);
    expect(isProbeContent(partialThinking("stop", "", "retryable"))).toBe(false);
    expect(isProbeContent(thinkingMessage("", "retryable", { id: "rs_1" }))).toBe(false);
    expect(isProbeContent(tokenUsage(emptyTokenCounts(), emptyTokenCounts()))).toBe(false);
    expect(isProbeContent(toolCall({ name: "t", arguments: "{}", toolCallId: "tc1" }))).toBe(false);
  });
});

describe("probeVerdict", () => {
  it("passes a completed probe", () => {
    expect(probeVerdict({ status: "completed" }, false)).toEqual({ ok: true });
  });

  it("passes a retryable ending when content was streamed (e.g. a reasoning model burned the tiny cap)", () => {
    const outcome = {
      status: "retryable" as const,
      errorMessage:
        'OpenaiClient returned no content other than thinking (finish_reason="length").',
    };
    expect(probeVerdict(outcome, true)).toEqual({ ok: true });
  });

  it("fails a retryable ending with nothing received (broken response, not a working endpoint)", () => {
    const verdict = probeVerdict({ status: "retryable", errorMessage: "unexpected EOF" }, false);
    expect(verdict).toEqual({ ok: false, message: "unexpected EOF" });
  });

  it("fails fatal rejections and aborts even when content was streamed", () => {
    expect(probeVerdict({ status: "fatal", errorMessage: "401 unauthorized" }, true)).toEqual({
      ok: false,
      message: "401 unauthorized",
    });
    expect(probeVerdict({ status: "aborted" }, true)).toEqual({ ok: false, message: "aborted" });
  });

  it("truncates long failure messages to 300 characters", () => {
    const verdict = probeVerdict({ status: "fatal", errorMessage: "x".repeat(500) }, false);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toHaveLength(300);
  });
});

describe("probeTps", () => {
  it("reports the rate for a sample that spans a real streaming window", () => {
    // The speed probe's 64-token cap: a full window is what the badge thresholds grade.
    expect(probeTps(64, 1000)).toBe(64);
    expect(probeTps(48, 900)).toBe(53.3);
  });

  it("reports at the sample floors", () => {
    expect(probeTps(16, 400)).toBe(40);
    expect(probeTps(16, 101)).toBe(158.4);
  });

  it("omits the rate for a one-word answer (jitter, not throughput)", () => {
    // 2 tokens in 30ms would read as 66.7 tok/s; 30ms of jitter later, as 33.3 — the caller
    // still reports ttftMs, just no rate.
    expect(probeTps(2, 30)).toBeUndefined();
    expect(probeTps(2, 60)).toBeUndefined();
    expect(probeTps(15, 300)).toBeUndefined();
  });

  it("omits the rate for a window too short to time, however many tokens arrived", () => {
    expect(probeTps(64, 100)).toBeUndefined();
    expect(probeTps(64, 0)).toBeUndefined();
  });

  it("omits the rate when no usage was reported (malformed thinking-only ending)", () => {
    expect(probeTps(0, 5000)).toBeUndefined();
  });
});

describe("headerRefusalCause", () => {
  it("names the credential when the transport refused a header value", () => {
    // Exactly what undici raises for a header carrying a character above U+00FF (here a key that
    // picked up 「纠」 while being pasted), which AgentHub hands back as a retryable network
    // outcome: without this the dialog relayed it as "连通失败：Cannot convert argument to a
    // ByteString…" and the reader went looking at their network.
    expect(
      headerRefusalCause(
        "Cannot convert argument to a ByteString because the character at index 67 has a value of 32416 which is greater than 255.",
      ),
    ).toBe("key_not_latin1");
  });

  it("leaves every other failure to the sentence it already has", () => {
    expect(headerRefusalCause("unexpected EOF")).toBeUndefined();
    expect(headerRefusalCause("401 unauthorized")).toBeUndefined();
    expect(headerRefusalCause("fetch failed")).toBeUndefined();
    // The refusal is recognized by the transport's own wording, so a message that merely mentions
    // a character position is not one.
    expect(headerRefusalCause('invalid character at index 3 in "sk-x"')).toBeUndefined();
  });
});
