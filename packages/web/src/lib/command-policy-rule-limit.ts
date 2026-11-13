/**
 * The ceiling on a Project's command-policy rule list, and the line the security-policy page
 * shows once the list reaches it (`components/layout/project-dialogs.tsx`).
 *
 * The route caps a PUT at 64 rules (`MAX_RULES`, `packages/server/src/http/routes/command-policy.ts`)
 * and answers a longer one with `rules exceeds 64 entries.` — a refusal the page could only read
 * after the fact: "Add rule" opened at 64, the 65th rule was typed and saved, and the limit was
 * first mentioned by the refusal that rejected it. The page therefore mirrors the number, the same
 * way its rule fields already mirror the route's per-field limits (name 64, pattern 512,
 * description 300): the ceiling belongs at the entry point, so the row that opens the form goes
 * inert and says why instead of letting that 65th rule be written.
 *
 * The two numbers must agree, and nothing at runtime keeps them in step — so the module's test
 * reads the route's own `MAX_RULES` out of the server source and compares.
 */
import { S } from "./strings";

/** Mirrors `MAX_RULES` in the server's command-policy route. */
export const COMMAND_POLICY_RULE_LIMIT = 64;

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
