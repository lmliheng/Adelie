# The security page's rule fields declare their own length ceilings

- **Date:** 2026-11-14
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-14-command-policy-field-limit.zh.md)

The route bounds a rule's three fields at 64 characters for the name, 512 for the pattern and 300
for the description, and the inputs carry the same `maxLength`. A ceiling carried by the input
means the browser **silently cuts the tail off a longer paste**: nothing on screen shows that
characters went missing, and what gets saved is the cut copy. The pattern is the bad one — cut to
512 and still compiling, the rule then matches something other than what was pasted, so "saved" no
longer means "what I wrote".

Each of the three fields now says so **under itself** once it reaches its ceiling, and says what
that means (the rest was not written in — check it is still complete) rather than only naming a
number. One character back leaves the ceiling and the sentence goes with it; opening a rule that
already holds 512 characters shows it the moment the editor appears, because the value on screen is
the value that would save.

## Details

- `packages/web/src/lib/command-policy-rule-limit.ts`: `COMMAND_POLICY_FIELD_LIMITS` (mirrors the
  route's `MAX_RULE_NAME_LEN` / `MAX_RULE_PATTERN_LEN` / `MAX_RULE_DESCRIPTION_LEN`) and
  `ruleFieldLimitHint(field, length)` — `null` below the ceiling, the sentence at (and past) it.
  Last round's list ceiling (`ruleLimitHint`) lives in the same module; both are the same move —
  mirror the route's number and say it before it bites.
- `packages/web/src/components/layout/project-dialogs.tsx` (`RuleEditor`): the three `maxLength`
  values read the constants, and each field gains a line beneath it
  (`data-testid="command-policy-rule-{name,pattern,desc}-limit"`, attention ink, two lines max).
- Dictionaries (`strings.ts` / `strings-en.ts`): one sentence carrying the number.
- No API change, no new dependency, no server-side behaviour change.

## Tests

- `packages/web/test/command-policy-field-limit.test.ts` (new, 8 cases): nothing is said below the
  ceilings; the ceiling is named with the number in the sentence; a value already past it (stored
  by an older build) still speaks; the sentence says what was cut rather than only a number, in
  both dictionaries; the three constants equal the route's own, read out of the server source; the
  three inputs' `maxLength` are those numbers; opening a rule whose name is at the ceiling speaks
  only on that row; nothing is said while all three are short.
- `packages/web/e2e/command-policy-field-limit.spec.mjs` (new, 2 cases, real server + real
  browser): 632 characters typed into the pattern field with the keyboard — the value stops at
  512, the note is there, it is the only field speaking, and one Backspace takes it away; name and
  description reach their own ceilings the same way; and opening a rule that stores 512 characters
  shows the note as soon as the editor appears.

## Compatibility

No wire change: the same PUT, the same validation, the same ceilings. What changes is that the page
speaks at those ceilings instead of leaving the user to notice after saving that the paste had been
cut.
