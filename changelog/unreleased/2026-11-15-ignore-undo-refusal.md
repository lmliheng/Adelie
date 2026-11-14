# A refused undo of an ignore rule says why, under the button that asked

- **Date:** 2026-11-15
- **Kind:** fix
- **Scope:** `web`

[中文](2026-11-15-ignore-undo-refusal.zh.md)

In the cost centre's errors panel, the notice that "Ignore this kind" leaves behind carries an
`Undo`, and a rule's own row in the ignored view carries `Stop ignoring` — two buttons asking for
the same DELETE. When it was refused, nothing on screen moved: the notice still said how many
records it had hidden and its button was still there, the rule was still listed, so the retry was
that same button. Only the reason was missing, and it arrived as a notification that dismissed
itself after six seconds over the top of the page. When a rule cannot be deleted, the one thing the
reader needs is "those records are still hidden" — and a page that looks as if nothing was pressed
says nothing.

The refusal now stays under the button that asked, keyed by the place that asked as well as by the
rule, so it only ever appears where it was pressed: a refused `Undo` puts the sentence inside the
notice, a refused `Stop ignoring` puts it under that row, and the other host on the page (the same
rule's notice) does not speak for it. The sentence names the silenced class and says outright that
the ignore rule is still in place and those records stay hidden. Every attempt starts by clearing
the last one, a successful one clears it too, and neither button pops a notification any more.

Along the way, the one refusal this path actually produces in practice got its wording: a stale
list or a rule removed elsewhere answers `ignore_rule_not_found`, which had no localized sentence
and fell back to the server's English text.

## Details

- `packages/web/src/features/usage/ignore-undo-refusal.ts` (new): `ignoreUndoRefused(host, id,
  label, error)` with `host` being `notice` / `rule`; the reason goes through `refusalText` and the
  sentence lives in the dictionary. The file header explains why the host is part of the key (the
  notice and the rule row name the same rule id, so the id alone cannot tell them apart).
- `packages/web/src/features/usage/errors-panel.tsx`: a new `undoRefusal` state; `unignore(host, id,
  label)` clears it on every attempt and stores the sentence instead of toasting; the notice and
  `IgnoreRulesBox` each draw it in their own place (`data-testid` `ignore-notice-undo-refusal` /
  `ignore-rule-undo-refusal`, `role="alert"`, danger tone, two lines, the whole sentence in the
  tooltip). `IgnoreRulesBox` takes an optional `refusal`; the sentence takes a line of its own
  (`basis-full`) and the rule keeps its button.
- `packages/web/src/lib/strings.ts`, `strings-en.ts`: `usage.errorsUnignoreRefused(label, reason)`,
  and `errors.byCode.ignore_rule_not_found` in both languages.

## Tests

- `packages/web/test/ignore-undo-refusal.test.ts`: the 404 reads as the dictionary's sentence rather
  than the wire's English, host and rule id come back with it, the wording says "still in place"
  rather than "showing again", a failure raised by this codebase keeps what it knows, a value with
  nothing to say falls back, and it follows the active dictionary.
- `packages/web/test/errors-panel.test.ts`: two rules and one refusal — the sentence is drawn on the
  matching row only, and both rows keep their button.
- `packages/web/e2e/errors-ignore.spec.mjs`: two cases against a real server and a real browser —
  the notice's `Undo` refused (sentence inside the notice, no dismissible button in the notification
  region, still there seven seconds later, rule and hidden state untouched, and the same button
  lands once let through) and the rule row's `Stop ignoring` refused (sentence on that row, the
  notice does not claim it, still one rule, and once let through: no rules and the records back
  under `All`). The refusal is a 500 from `page.route`; rule counts and record counts are read back
  through the API on both sides.

## Compatibility

No API change, no new dependency, no configuration change. The notifications those two buttons used
to pop are gone in favour of one line at each button's own place; the new `ignore_rule_not_found`
sentence only affects wording.
