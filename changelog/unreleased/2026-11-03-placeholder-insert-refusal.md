# A refused placeholder insert says so under the strip that asked, past the toast it used to be

- **Date:** 2026-11-03
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-03-placeholder-insert-refusal.zh.md)

The top of the Memory tab — and of the Skills, Vault and Schedules tabs — carries a strip while the
Agent's prompt template still lacks its placeholder, and the strip's button asks the server to
write that placeholder in. Nothing on the page moves until the write lands, so a refused one leaves
the template without the placeholder and the strip — with its button — exactly where it was; the
reason used to arrive only as a six-second notification, and six seconds later the strip looked as
though it had never been pressed. This one is more than a settings write: it is the path that
adopts the whole feature into the context (memory entering it, the skills and vault sections
present, the schedules section present).

The reason now stays directly under the strip, in the words of the button that was pressed (a legacy
template's button migrates, so the sentence says "migrating" rather than "inserting"), names which
placeholder — four sections share the one sentence — and carries the server's reason as given. It
stays until the next insert; the strip's own button is the retry.

## Details

- `packages/web/src/features/agents/placeholder-insert-refusal.ts` (new):
  `placeholderInsertRefused(token, legacy, reason)` — the placeholder token, whether the button
  that was pressed inserts or migrates, and the server's reason.
- `packages/web/src/lib/strings{,-en}.ts`: the two sentences
  (`agent.placeholderInsertRefused` / `placeholderMigrateRefused`), plus four `placeholderToken`
  fields — memory, skills, vault, schedules — each written beside its own strip and button wording.
- `packages/web/src/features/agents/memory-tab.tsx` and `prompt-injection-controls.tsx`: one
  `insertRefusal` state each (cleared when a write starts, set when one is refused), drawn under the
  strip (`role="alert"`, danger ink, capped at two lines). The failure notification stays — this
  adds the account that outlives it, it does not take one away.

## Tests

- `packages/web/test/placeholder-insert-refusal.test.ts` (new, 5 cases): the insert and migrate
  wordings, each section's own token, the reason travelling verbatim (its punctuation included),
  the active language.
- `packages/web/e2e/placeholder-insert-refusal.spec.mjs` (new, two cases on a real server): the
  Agent's prompt template is first replaced with plain text (the default template carries every
  placeholder, so no strip would appear at all); one case on the Memory tab and one on Skills — a
  refusal leaves exactly one sentence under the strip, the strip and its button still there, no
  dismissible entry in the notification region, and seven seconds later the sentence is still
  there; with the refusal lifted the same button goes through, the sentence and the strip go, and
  the template holds the placeholder.

## Compatibility

- No interface, request or storage change: the same four
  `POST …/{memory,skills,vault,schedules}/template-placeholder` calls. Only where a refused one is
  drawn has moved — from a notification alone to a line under the strip, which the notification no
  longer has to carry on its own.
