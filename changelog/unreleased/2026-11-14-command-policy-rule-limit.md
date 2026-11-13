# The security-policy page declares its rule ceiling and closes the add entry point at it

- **Date:** 2026-11-14
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文版](2026-11-14-command-policy-rule-limit.zh.md)

The server caps a command policy at 64 rules and answers the 65th with `rules exceeds 64 entries.`
The page used to say nothing about that ceiling and stop nothing at it: the count row read
"Rules · 64", "Add rule" stayed live, the form opened, the rule could be typed and saved — and was
refused, the refusal being the first mention that a ceiling existed at all.

The count row now says it at the ceiling and the add entry point goes inert at the same moment:
clicking it there does nothing (not a dimmed button that still opens the form), and deleting a
rule brings both the sentence and the button back together. The number mirrors the route's
`MAX_RULES` — the same way this page's rule fields already mirror the route's per-field length
limits, except that this one's test reads the server source and compares, so the two cannot drift.

## Details

- `packages/web/src/lib/command-policy-rule-limit.ts` (new): `COMMAND_POLICY_RULE_LIMIT` (mirrors
  `MAX_RULES`) and `ruleLimitHint(count)` — `null` while one more rule fits, the sentence at (and
  past) the ceiling. The button and the sentence read one value, so they cannot disagree.
- `packages/web/src/components/layout/project-dialogs.tsx` (`SecurityPolicySection`): the sentence
  is drawn beside the count (`data-testid="command-policy-rule-limit"`, attention ink, two lines
  max) and `disabled` on "Add rule" gains the same condition; "Restore defaults" is untouched (it
  shortens the list). The section's own header comment claimed failures toast — stale since the
  refusal moved beside the button — and is corrected here.
- Dictionaries (`strings.ts` / `strings-en.ts`): one sentence carrying the number.
- No API change, no new dependency, no server-side behaviour change.

## Tests

- `packages/web/test/command-policy-rule-limit.test.ts` (new, 5 cases): nothing is said while one
  more rule fits; the ceiling is named once reached, with the number in the sentence itself; a list
  already past it (stored by an older build) still speaks; the sentence follows the active
  dictionary; the constant equals the route's `MAX_RULES`, read out of the server source the way
  `avatar-image.test.ts` pins the avatar cap.
- `packages/web/e2e/command-policy-rule-limit.spec.mjs` (new, 2 cases, real server + real browser):
  with 64 rules stored, the sentence is there, the button is `disabled`, and pressing it opens no
  form; deleting one rule brings both back and the form really opens. One short of the ceiling,
  nothing is said and the button works.
- `packages/web/e2e/command-policy-save-refusal.spec.mjs` (changed): last round's two refused-Save
  cases were triggered by adding the 65th rule through the form — exactly what this guard makes
  impossible. Their setup is now "store 63 rules, let the form fill it to 64, and let the outgoing
  PUT carry one rule more": the server sees the shape only a build without the guard would store,
  and its validation, status code and words are its own; nothing in the page is stubbed. The
  assertions themselves are unchanged.

## Compatibility

No wire change: the same PUT, the same validation. What changes is that the page states its
ceiling and stops the entry point there, instead of letting the 65th rule reach Save and be
refused.
