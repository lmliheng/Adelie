/**
 * The ceilings the command-policy route enforces, mirrored for the security-policy page
 * (`components/layout/project-dialogs.tsx`).
 *
 * Two kinds of them, and two different silences.
 *
 * The list is capped at 64 rules (`MAX_RULES`, `packages/server/src/http/routes/command-policy.ts`)
 * and a longer one is answered with `rules exceeds 64 entries.` — a refusal the page could only
 * read after the fact: "Add rule" opened at 64, the 65th rule was typed and saved, and the limit
 * was first mentioned by the refusal that rejected it. The page therefore mirrors the number, and
 * the ceiling sits at the entry point: the row that opens the form goes inert and says why
 * (`ruleLimitHint`), instead of letting that 65th rule be written.
 *
 * Each rule's three text fields have a ceiling too (name 64, pattern 512, description 300), and
 * there the silence is worse than a late refusal: the fields carry `maxLength`, so the browser
 * quietly CUTS anything longer — a pattern pasted from a long deny list arrives truncated with
 * nothing on screen saying a character was dropped. A cut pattern that still compiles is then saved
 * as a rule that matches something else than what was pasted, so "saved" stops meaning "what I
 * wrote". `ruleFieldLimitHint` names the ceiling under the field that reached it, at the moment it
 * reaches it.
 *
 * The numbers must agree with the route's, and nothing at runtime keeps them in step — so the
 * module's test reads the route's own constants out of the server source and compares.
 */
import { S } from "./strings";

/** Mirrors `MAX_RULES` in the server's command-policy route. */
export const COMMAND_POLICY_RULE_LIMIT = 64;

/** The three text fields of a rule the route bounds by length. */
export type CommandPolicyRuleField = "name" | "pattern" | "description";

/** Mirrors `MAX_RULE_NAME_LEN` / `MAX_RULE_PATTERN_LEN` / `MAX_RULE_DESCRIPTION_LEN`. */
export const COMMAND_POLICY_FIELD_LIMITS: Record<CommandPolicyRuleField, number> = {
  name: 64,
  pattern: 512,
  description: 300,
};

/**
 * The line beside the rule count once no more rules fit, or null while one still does. It says
 * what to do about it: the count next to it already says how many are stored. The same null is
 * what the add entry point reads, so the sentence and the inert button cannot disagree.
 */
export function ruleLimitHint(count: number): string | null {
  return count >= COMMAND_POLICY_RULE_LIMIT
    ? S.project.commandPolicyRuleLimit(COMMAND_POLICY_RULE_LIMIT)
    : null;
}

/**
 * The line under one rule field once its value reaches that field's ceiling, or null below it. At
 * the ceiling the browser may already have dropped the tail of a paste, so the sentence says that
 * rather than only naming a number: what the field shows is what gets saved, and a cut pattern can
 * match something other than what was written.
 */
export function ruleFieldLimitHint(field: CommandPolicyRuleField, length: number): string | null {
  const limit = COMMAND_POLICY_FIELD_LIMITS[field];
  return length >= limit ? S.project.commandPolicyFieldLimit(limit) : null;
}
