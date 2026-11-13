/**
 * The one-off utility completion behind semantic id proposals. It never throws and never
 * reaches for a network here: the config it would run with and the collector that drains the
 * stream are both pure, so the two things that decide whether an answer arrives — thinking
 * off, and a budget the answer fits in after the thinking — are asserted directly, and every
 * dead end is checked for carrying its reason rather than a bare "no answer".
 */
import fs from "node:fs/promises";
import { wire } from "@adelie/core/kernel";
import { describe, expect, it } from "vitest";
import {
  assistantText,
  partialText,
  partialThinking,
  projectConfigPath,
  projectDir,
  thinkingMessage,
  tokenUsage,
  emptyTokenCounts,
} from "@adelie/core";
import type { LLMOutcome, OmniMessage } from "@adelie/core";
import {
  ProjectConfigService,
  collectUtilityCompletion,
  freeModelEntries,
  utilityCompletionConfig,
} from "../src/services/project-config-service.js";
import { makeTempRoot } from "./helpers.js";

/** A stream shaped the way the real translator shapes one: partial fragments, then the complete backfill. */
async function* streamOf(
  messages: OmniMessage[],
  outcome: LLMOutcome,
): AsyncGenerator<OmniMessage, LLMOutcome> {
  for (const m of messages) yield m;
  return outcome;
}

describe("utilityCompletionConfig", () => {
  it("turns thinking off and asks for the shared meta budget, not a budget the size of an id", () => {
    const config = utilityCompletionConfig("m-bench", { api_key: "sk-1" });
    expect(config.thinkingLevel).toBe("none");
    expect(config.maxTokens).toBe(300);
    expect(config.apiKey).toBe("sk-1");
    expect(config.tools).toEqual([]);
  });

  it("still honours a per-model cap pinned below the budget, and the entry's protocol", () => {
    const config = utilityCompletionConfig("m-bench", {
      api_key: "sk-1",
      max_tokens: 128,
      base_url: "https://example.test/v1",
      // The pre-0.4.2 spelling is normalized like everywhere else.
      client_type: "openai",
    });
    expect(config.maxTokens).toBe(128);
    expect(config.baseUrl).toBe("https://example.test/v1");
    expect(config.clientType).toBe("openai-chat");
  });

  it("refuses a keyless entry whose endpoint is not the vendor's own (core's credential rule)", () => {
    // completeOnce reports this as a failure; the environment's OPENAI_API_KEY is never
    // borrowed for a third-party endpoint.
    expect(() =>
      utilityCompletionConfig("m-bench", {
        provider: "custom",
        base_url: "https://example.test/v1",
        client_type: "openai",
      }),
    ).toThrow(/has no API key/);
  });

  it("never tightens to an uncapped entry's -1", () => {
    expect(utilityCompletionConfig("m-bench", { api_key: "sk-1", max_tokens: -1 }).maxTokens).toBe(
      300,
    );
  });

  it("waits out the single-attempt timeout unless the walk hands it what is left of its budget", () => {
    expect(utilityCompletionConfig("m-bench", { api_key: "sk-1" }).requestTimeoutMs).toBe(15_000);
    expect(utilityCompletionConfig("m-bench", { api_key: "sk-1" }, 4_000).requestTimeoutMs).toBe(
      4_000,
    );
  });
});

describe("collectUtilityCompletion", () => {
  it("returns the text of a model that thought first and answered second", async () => {
    const result = await collectUtilityCompletion(
      streamOf(
        [
          partialThinking("start"),
          partialThinking("delta", "the name is Chinese, translate it"),
          partialThinking("stop", "", "completed"),
          thinkingMessage("the name is Chinese, translate it", "completed"),
          partialText("start"),
          partialText("delta", "research_paper"),
          partialText("delta", "_lab"),
          partialText("stop", "", "completed"),
          assistantText("research_paper_lab", "completed"),
          tokenUsage(emptyTokenCounts(), emptyTokenCounts()),
        ],
        { status: "completed" },
      ),
    );
    // The complete backfill is counted once; the partial deltas that built it are not counted again.
    expect(result).toEqual({ ok: true, text: "research_paper_lab" });
  });

  it("reports the provider's reason when the whole budget went to thinking", async () => {
    const result = await collectUtilityCompletion(
      streamOf(
        [
          partialThinking("start"),
          partialThinking("delta", "let me consider every possible identifier"),
          partialThinking("stop", "", "retryable"),
          thinkingMessage("let me consider every possible identifier", "retryable"),
        ],
        {
          status: "retryable",
          errorCode: "malformed",
          errorMessage:
            'OpenaiClient returned no content other than thinking (finish_reason="length").',
        },
      ),
    );
    expect(result).toEqual({
      ok: false,
      cause: "failed",
      error: 'OpenaiClient returned no content other than thinking (finish_reason="length").',
    });
  });

  it("falls back to the bare status when the outcome carries no message", async () => {
    expect(await collectUtilityCompletion(streamOf([], { status: "aborted" }))).toEqual({
      ok: false,
      cause: "failed",
      error: "aborted",
    });
  });

  it("treats a whitespace-only answer as no answer", async () => {
    const result = await collectUtilityCompletion(
      streamOf([assistantText("  \n ", "completed")], { status: "completed" }),
    );
    expect(result).toEqual({ ok: false, cause: "failed", error: "completed" });
  });
});

/** One `[[models]]` row, as the config stores one: a paired reference, plus whatever is given. */
const row = (provider: string, modelId: string, rest = ""): string =>
  `[[models]]\nprovider = "${provider}"\nmodel_id = "${modelId}"\n${rest}\n`;

/** The three-bucket pricing table a $0 row carries. */
const ZERO_PRICING =
  'pricing = { unit = "usd_per_mtok", cache_read = 0, cache_write = 0, output = 0 }\n';

describe("freeModelEntries", () => {
  it("keeps the Project's $0-priced rows in config order, and drops everything else", () => {
    const raw = {
      models: [
        {
          provider: "openrouter",
          model_id: "a:free",
          pricing: { cache_read: 0, cache_write: 0, output: 0 },
        },
        {
          provider: "deepseek",
          model_id: "paid",
          pricing: { cache_read: 0.04, cache_write: 2, output: 8 },
        },
        // No pricing at all is unpriced, not free.
        { provider: "vllm", model_id: "unpriced" },
        {
          provider: "zai",
          model_id: "glm-4.7-flash",
          pricing: { cache_read: 0, cache_write: 0, output: 0 },
        },
        // A hand-edited file may carry the same reference twice; it is asked once.
        {
          provider: "openrouter",
          model_id: "a:free",
          pricing: { cache_read: 0, cache_write: 0, output: 0 },
        },
        { model_id: "providerless" },
      ],
    };
    expect(freeModelEntries(raw).map((c) => `${c.provider}/${c.modelId}`)).toEqual([
      "openrouter/a:free",
      "zai/glm-4.7-flash",
    ]);
  });

  it("reads a missing bucket as 0 and any price on any bucket as not free", () => {
    const raw = {
      models: [
        { provider: "p", model_id: "one-bucket", pricing: { cache_read: 0 } },
        { provider: "p", model_id: "output-priced", pricing: { cache_read: 0, output: 0.5 } },
      ],
    };
    expect(freeModelEntries(raw).map((c) => c.modelId)).toEqual(["one-bucket"]);
  });
});

describe("completeOnce", () => {
  it("says there is no free model to run when the Project lists none", async () => {
    const root = await makeTempRoot();
    const service = wire(ProjectConfigService, { paths: { root } });
    // No `.project_config.toml` at all.
    expect(await service.completeOnce("p1", "Name: Plugin Marketplace")).toEqual({
      ok: false,
      cause: "no_model",
      error: "the Project has no free ($0-priced) model that can be run",
    });

    await fs.mkdir(projectDir(root, "p1"), { recursive: true });
    const file = projectConfigPath(root, "p1");
    // A paid row is not a candidate even when it is the Project's default model: this ask must
    // not spend anything, which is the whole point of the walk.
    await fs.writeFile(
      file,
      '[default_model]\nprovider = "deepseek"\nmodel_id = "deepseek-flash"\n\n' +
        row("deepseek", "deepseek-flash", 'api_key = "sk-paid"\n') +
        'pricing = { unit = "usd_per_mtok", cache_read = 0.04, cache_write = 2, output = 8 }\n',
      "utf8",
    );
    expect(await service.completeOnce("p1", "Name: Plugin Marketplace")).toEqual({
      ok: false,
      cause: "no_model",
      error: "the Project has no free ($0-priced) model that can be run",
    });
  });

  it("walks past a free row it cannot build and names the next one's dead end", async () => {
    const root = await makeTempRoot();
    const service = wire(ProjectConfigService, { paths: { root } });
    await fs.mkdir(projectDir(root, "p1"), { recursive: true });
    // Two free rows, neither carrying a credential: the first is skipped without being asked
    // and the second one's dead end is the one reported — which holds only if the walk moved on.
    await fs.writeFile(
      projectConfigPath(root, "p1"),
      row("custom", "free-one", ZERO_PRICING) + "\n" + row("custom", "free-two", ZERO_PRICING),
      "utf8",
    );
    const result = await service.completeOnce("p1", "Name: Plugin Marketplace");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Never asked, so "nothing to run it on" rather than a model that failed.
      expect(result.cause).toBe("no_model");
      expect(result.error).toContain("free-two");
    }
  });
});
