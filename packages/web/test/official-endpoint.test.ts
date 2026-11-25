/**
 * official-endpoint.ts: the address a built-in row's locked base URL field shows.
 *
 * The point of the helper is that it can never disagree with the credential fallback — both
 * read the same tables — so these cases pin the exact host per provider and the two groups
 * that must stay silent (custom, vLLM) rather than re-deriving them.
 */
import { describe, expect, it } from "vitest";
import { VENDOR_ENDPOINTS, providerInfo } from "@adelie/core/model-catalog";
import { officialEndpoint } from "../src/features/models/official-endpoint";

describe("officialEndpoint", () => {
  it("names a gateway's preset endpoint", () => {
    for (const [provider, url] of [
      ["openrouter", "https://openrouter.ai/api/v1"],
      ["tokendance", "https://tokendance.space/gateway/v1"],
      ["siliconflow", "https://api.siliconflow.cn/v1"],
      ["fireworks", "https://api.fireworks.ai/inference/v1"],
    ] as const) {
      expect(officialEndpoint(providerInfo(provider)), provider).toBe(url);
    }
  });

  it("names a first-party vendor's own host", () => {
    for (const [provider, url] of [
      ["google", "https://generativelanguage.googleapis.com"],
      ["openai", "https://api.openai.com/v1"],
      ["anthropic", "https://api.anthropic.com"],
      ["deepseek", "https://api.deepseek.com"],
      ["minimax", "https://api.minimax.io/v1"],
    ] as const) {
      expect(officialEndpoint(providerInfo(provider)), provider).toBe(url);
    }
  });

  it("takes the default host where a vendor runs two", () => {
    // Z.AI's international host and Moonshot's mainland one are the first entries; the other
    // side is what providerEnvNotes tells the reader to type, so the two agree.
    expect(officialEndpoint(providerInfo("zhipu"))).toBe(VENDOR_ENDPOINTS.ZAI_API_KEY![0]);
    expect(officialEndpoint(providerInfo("moonshot"))).toBe(VENDOR_ENDPOINTS.MOONSHOT_API_KEY![0]);
    expect(officialEndpoint(providerInfo("zhipu"))).toBe("https://api.z.ai/api/paas/v4");
    expect(officialEndpoint(providerInfo("moonshot"))).toBe("https://api.moonshot.cn/v1");
  });

  it("stays silent where the address is the user's own", () => {
    // vLLM and custom are addable: their rows carry a per-deployment URL, so there is no fixed
    // address to name and no borrowed OpenAI host to fall back to.
    expect(officialEndpoint(providerInfo("vllm"))).toBeUndefined();
    expect(officialEndpoint(providerInfo("custom"))).toBeUndefined();
    // A user-defined group has no catalog entry at all.
    expect(officialEndpoint(providerInfo("my-gateway"))).toBeUndefined();
    expect(officialEndpoint(undefined)).toBeUndefined();
  });
});
