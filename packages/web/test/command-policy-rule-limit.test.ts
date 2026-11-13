/**
 * The rule-list ceiling on the Project settings security page
 * (src/lib/command-policy-rule-limit.ts): the line the count row shows at 64, and the same value
 * the add entry point goes inert on.
 *
 * The route rejects a PUT with more than 64 rules (`MAX_RULES`) and the page mirrors that number
 * rather than receiving it — so the last case reads the route's own constant out of the server
 * source, the way `avatar-image.test.ts` pins its cap. A page that drifted below the route would
 * let the 65th rule be written and refused; one that drifted above would block a rule the server
 * would have taken.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { COMMAND_POLICY_RULE_LIMIT, ruleLimitHint } from "../src/lib/command-policy-rule-limit";

afterEach(() => {
  setActiveStrings(ZH);
});

describe("ruleLimitHint", () => {
  it("says nothing while one more rule still fits", () => {
    expect(ruleLimitHint(0)).toBe(null);
    expect(ruleLimitHint(COMMAND_POLICY_RULE_LIMIT - 1)).toBe(null);
  });

  it("names the ceiling once the list reaches it", () => {
    const hint = ruleLimitHint(COMMAND_POLICY_RULE_LIMIT);
    expect(hint).toBe(S.project.commandPolicyRuleLimit(COMMAND_POLICY_RULE_LIMIT));
    // The number is in the sentence itself, not only in the constant beside it.
    expect(hint).toContain(String(COMMAND_POLICY_RULE_LIMIT));
  });

  it("still speaks for a list already over it (stored before the ceiling was honoured)", () => {
    expect(ruleLimitHint(COMMAND_POLICY_RULE_LIMIT + 1)).toBe(
      S.project.commandPolicyRuleLimit(COMMAND_POLICY_RULE_LIMIT),
    );
  });

  it("follows the active dictionary", () => {
    setActiveStrings(EN);
    expect(ruleLimitHint(COMMAND_POLICY_RULE_LIMIT)).toBe(
      S.project.commandPolicyRuleLimit(COMMAND_POLICY_RULE_LIMIT),
    );
    expect(ruleLimitHint(COMMAND_POLICY_RULE_LIMIT)).toContain("limit");
  });

  it("is the number the server enforces", () => {
    // The server is a type-only dependency of the Web App, so its route is read as text.
    const route = readFileSync(
      new URL("../../server/src/http/routes/command-policy.ts", import.meta.url),
      "utf8",
    );
    const serverCap = Number(/const MAX_RULES = (\d+);/.exec(route)?.[1]);
    expect(COMMAND_POLICY_RULE_LIMIT).toBe(serverCap);
  });
});
