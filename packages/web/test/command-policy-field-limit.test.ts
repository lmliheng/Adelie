/**
 * The per-field length ceilings on the security page's rule editor
 * (src/lib/command-policy-rule-limit.ts): the sentence that appears under a field once its value
 * reaches the ceiling, and the `maxLength` the three inputs actually carry.
 *
 * The route bounds each field as well (`MAX_RULE_NAME_LEN` / `MAX_RULE_PATTERN_LEN` /
 * `MAX_RULE_DESCRIPTION_LEN`) and the page mirrors the numbers rather than receiving them — so the
 * last case reads the route's own constants out of the server source, the way
 * `command-policy-rule-limit.test.ts` pins `MAX_RULES`. A page that drifted below the route would
 * cut a paste the server would have taken; one that drifted above would let a field reach the
 * server and be refused whole.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import {
  COMMAND_POLICY_FIELD_LIMITS,
  ruleFieldLimitHint,
} from "../src/lib/command-policy-rule-limit";
import { RuleEditor } from "../src/components/layout/project-dialogs";

afterEach(() => {
  setActiveStrings(ZH);
});

/** The route's three field bounds, read as text (the server is a type-only dependency here). */
function serverFieldLimits(): Record<string, number> {
  const route = readFileSync(
    new URL("../../server/src/http/routes/command-policy.ts", import.meta.url),
    "utf8",
  );
  const read = (name: string) => Number(new RegExp(`const ${name} = (\\d+);`).exec(route)?.[1]);
  return {
    name: read("MAX_RULE_NAME_LEN"),
    pattern: read("MAX_RULE_PATTERN_LEN"),
    description: read("MAX_RULE_DESCRIPTION_LEN"),
  };
}

describe("ruleFieldLimitHint", () => {
  it("says nothing while the field is under its ceiling", () => {
    for (const field of ["name", "pattern", "description"] as const) {
      expect(ruleFieldLimitHint(field, 0)).toBe(null);
      expect(ruleFieldLimitHint(field, COMMAND_POLICY_FIELD_LIMITS[field] - 1)).toBe(null);
    }
  });

  it("names the ceiling once the field reaches it, with the number in the sentence", () => {
    for (const field of ["name", "pattern", "description"] as const) {
      const limit = COMMAND_POLICY_FIELD_LIMITS[field];
      const hint = ruleFieldLimitHint(field, limit);
      expect(hint).toBe(S.project.commandPolicyFieldLimit(limit));
      expect(hint).toContain(String(limit));
    }
  });

  it("still speaks past the ceiling (a value stored by a build without the input cap)", () => {
    expect(ruleFieldLimitHint("pattern", COMMAND_POLICY_FIELD_LIMITS.pattern + 1)).toBe(
      S.project.commandPolicyFieldLimit(COMMAND_POLICY_FIELD_LIMITS.pattern),
    );
  });

  it("says what the cut means, not only the number", () => {
    expect(ruleFieldLimitHint("pattern", COMMAND_POLICY_FIELD_LIMITS.pattern)).toContain("完整");
    setActiveStrings(EN);
    expect(ruleFieldLimitHint("pattern", COMMAND_POLICY_FIELD_LIMITS.pattern)).toContain(
      "not written in",
    );
  });

  it("is the three numbers the server enforces", () => {
    expect(COMMAND_POLICY_FIELD_LIMITS).toEqual(serverFieldLimits());
  });
});

describe("the rule editor's three inputs", () => {
  it("cap each field at the mirrored ceiling", () => {
    const html = renderToStaticMarkup(
      createElement(RuleEditor, { initial: null, onApply: () => {}, onCancel: () => {} }),
    );
    // React's server renderer keeps the prop's own spelling for `maxLength`; HTML attribute
    // names are case-insensitive, so the browser applies it either way.
    for (const [field, limit] of Object.entries(COMMAND_POLICY_FIELD_LIMITS)) {
      expect(html, field).toContain(`maxLength="${limit}"`);
    }
  });

  it("speaks under a field whose stored value already reaches the ceiling", () => {
    // A rule saved by a build without the cap, or one typed up to the limit: the note is up front,
    // before anything is touched, because the value it explains is already the one that saves.
    const html = renderToStaticMarkup(
      createElement(RuleEditor, {
        initial: {
          name: "a".repeat(COMMAND_POLICY_FIELD_LIMITS.name),
          pattern: "\\bx\\b",
          enabled: true,
        },
        onApply: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).toContain('data-testid="command-policy-rule-name-limit"');
    expect(html).not.toContain('data-testid="command-policy-rule-pattern-limit"');
    expect(html).not.toContain('data-testid="command-policy-rule-desc-limit"');
  });

  it("says nothing about any field while all three are short", () => {
    const html = renderToStaticMarkup(
      createElement(RuleEditor, {
        initial: { name: "rm", pattern: "\\brm\\b", description: "no rm", enabled: true },
        onApply: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).not.toContain("command-policy-rule-name-limit");
    expect(html).not.toContain("command-policy-rule-pattern-limit");
    expect(html).not.toContain("command-policy-rule-desc-limit");
  });
});
