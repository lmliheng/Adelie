/**
 * The MCP server modal's "test connection" line (src/features/agents/mcp-test-refusal.ts): which
 * answers leave a sentence under the button, and whose words that sentence uses.
 *
 * A failed probe changes nothing else on the card — the form keeps every value it was asked with —
 * so this line is the only thing that accounts for the failure once the six-second toast is gone.
 * The cases below are the three shapes the answer comes in plus the two languages, and the rule
 * that matters most: a probe that connected leaves nothing behind.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { en as EN } from "../src/lib/strings-en";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { mcpTestRefusal } from "../src/features/agents/mcp-test-refusal";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("mcpTestRefusal", () => {
  it("leaves no line when the probe connected", () => {
    expect(mcpTestRefusal({ result: { ok: true, tools: ["mcp__fs__read"], latencyMs: 120 } })).toBe(
      null,
    );
    // A server that exposed nothing still connected — the toast says so, and there is no failure
    // for the card to keep.
    expect(mcpTestRefusal({ result: { ok: true, tools: [], latencyMs: 8 } })).toBeNull();
  });

  it("carries the route's own detail verbatim, behind the sentence's lead-in", () => {
    // What the route sends on a stdio spawn failure: its own words, sometimes a stderr tail.
    const detail = "spawn npx ENOENT · stderr: cannot find module";
    expect(mcpTestRefusal({ result: { ok: false, error: detail } })).toBe(
      S.agent.mcpTestFail(detail),
    );
  });

  it("still says something when the route refused without a detail", () => {
    // An empty line under the button would say less than the toast it replaced.
    expect(mcpTestRefusal({ result: { ok: false } })).toBe(
      S.agent.mcpTestFail(S.common.unknownError),
    );
  });

  it("reads a failed request through its code, so the line is the localized one", () => {
    const refused = mcpTestRefusal({
      result: null,
      error: new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE"),
    });
    expect(refused).toBe(S.agent.mcpTestFail(S.errors.byCode["internal"] as string));
    expect(refused).not.toContain("RAW ENGLISH SERVER MESSAGE");
  });

  it("keeps the message of an error the client itself raised", () => {
    // `refusalText`'s rule: only an ApiError goes through the code table; anything else with
    // something to say is shown as it is (a dropped connection, say), not as "unknown".
    expect(mcpTestRefusal({ result: null, error: new Error("network down") })).toBe(
      S.agent.mcpTestFail("network down"),
    );
    expect(mcpTestRefusal({ result: null, error: undefined })).toBe(
      S.agent.mcpTestFail(S.common.unknownError),
    );
  });

  it("follows the interface language", () => {
    setActiveStrings(EN);
    expect(mcpTestRefusal({ result: { ok: false, error: "spawn npx ENOENT" } })).toBe(
      "Connection failed: spawn npx ENOENT",
    );
  });
});
