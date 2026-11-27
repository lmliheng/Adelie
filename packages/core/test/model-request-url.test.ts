/**
 * modelRequestUrl: the provider endpoint the Network panel's model rows name. The call is made by
 * AgentHub's own SDK client, which appends a fixed path to the configured base URL; this table is
 * that rule, kept next to the exchange record it feeds. A base URL that already names a version is
 * kept as it is (the SDKs do not add one), and no base URL means no guess.
 */
import { describe, expect, it } from "vitest";
import { modelRequestUrl } from "../src/llm/model-exchange.js";

describe("modelRequestUrl", () => {
  it("openai-chat endpoints append chat/completions", () => {
    expect(modelRequestUrl("https://api.deepseek.com", "openai-chat", "deepseek-chat")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
    expect(modelRequestUrl("https://openrouter.ai/api/v1", "openai-chat", "x")).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
  });

  it("claude endpoints speak the Anthropic messages path, named by the model when unpinned", () => {
    expect(modelRequestUrl("https://api.anthropic.com", null, "claude-4-8")).toBe(
      "https://api.anthropic.com/v1/messages",
    );
    expect(modelRequestUrl("https://gateway.example.com", "ant-messages", "any")).toBe(
      "https://gateway.example.com/v1/messages",
    );
  });

  it("responses-API clients append responses", () => {
    for (const [clientType, model] of [
      ["gpt-6", "gpt-6"],
      ["deepseek-v4", "deepseek-v4.1"],
      ["minimax-m3", "minimax-m3"],
      ["openai-responses", "gpt-5.4"],
    ] as const) {
      expect(modelRequestUrl("https://api.example.com/v1", clientType, model)).toBe(
        "https://api.example.com/v1/responses",
      );
    }
  });

  it("Gemini names the model in the path", () => {
    expect(
      modelRequestUrl("https://generativelanguage.googleapis.com", "gemini-3.8", "gemini-3.8-pro"),
    ).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-pro:streamGenerateContent?alt=sse",
    );
  });

  it("trims a trailing slash and gives no URL without a base URL", () => {
    expect(modelRequestUrl("https://api.example.com/", "openai-chat", "m")).toBe(
      "https://api.example.com/chat/completions",
    );
    expect(modelRequestUrl(null, "openai-chat", "m")).toBeNull();
    expect(modelRequestUrl("  ", "openai-chat", "m")).toBeNull();
  });
});
