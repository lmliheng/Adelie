# Generate with AI uses only the Project's free models

- **Date:** 2026-11-14
- **Type:** feature
- **Scope:** `server`, `web`, `docs`

[中文版](2026-11-14-free-model-id-suggestions.zh.md)

**Generate with AI**, the button beside every id field (Project, Agent, Benchmark, organization, channel), used the **default model configured for that Project** — and a new Project is seeded with a paid one (`deepseek/deepseek-flash`). So an action whose whole purpose is naming something spent money on the reader's own key. It never showed up in the cost center (the request is deliberately not metered), but the provider billed it.

The ask now looks only for **free models**: the entries in that Project whose `pricing` says 0 on all three buckets — the ones the models page badges as free. Free endpoints get throttled and get retired, so it does not stop at the first: they are tried **in config order**, at most four, sharing a 30-second budget, and the first one that produces a usable id wins. Every $0 entry that carries a key sits on that walk — OpenRouter's `:free` rows and its free router among them.

The Project's **default model is no longer consulted here**, so generating an id never costs anything. The trade-off: with no usable free model in the Project, a non-English name falls back to the ASCII slug of the name, and a name with no ASCII at all lands on a dated placeholder that says why. The reason code `no_default_model` became `no_free_model`, in both languages.

## Details

- `packages/server/src/services/project-config-service.ts`: `completeOnce` went from reading the `default_model` entry to walking the free ones. New pure `freeModelEntries(raw)` — the entries whose `pricing` is present with all three buckets at 0, in config order, one row per reference. An entry with no `pricing` at all reads as unpriced rather than free, and a self-hosted (vLLM/custom) row that bills nobody through a rate the catalog cannot know is deliberately left out.
- A candidate that **cannot be built** (no credential, no routable id) is skipped without consuming one of the four attempts or any waiting time — otherwise a config full of unusable free rows would eat the budget of the one that works. Each attempt's timeout is the smaller of the single-attempt cap (15 s) and what is left of the walk's budget, so the last candidate cannot overshoot it either.
- Nothing was ever sent — no free entry, or none usable — reports `cause: "no_model"`; something was sent and none answered reports `cause: "failed"`. Both are recorded by the route in the errors panel (`id_suggest` / `id_suggest_failed`), so it can say why only a placeholder was filled in.
- `packages/server/src/api/types.ts`: the `SemanticIdSuggestReason` value `no_default_model` was renamed `no_free_model`. A client that does not know a reason still draws a sentence for it (`reasonUnknown`), so mixed old/new builds do not lose the note.
- `packages/web/src/lib/strings.ts`, `strings-en.ts`: the `no_free_model` and `model_failed` phrases now talk about free models.

## Tests

- `packages/server/test/utility-completion.test.ts`: `freeModelEntries`' selection, config order, de-duplication and "a missing bucket is 0, a price on any bucket is not free"; `completeOnce` reporting `no_model` with the new wording when the Project holds only paid rows — even the default one; and a walk over two credentialless free rows that **skips the first** and reports the second's dead end, which only holds if it really moved on. Plus `utilityCompletionConfig`'s timeout parameter: 15 s by default, shortened to what is left of the budget on the walk.
- `packages/server/test/suggest-id-routes.test.ts`, `packages/server/test/organization-runtime.test.ts`: reason code and wording.
- `packages/web/test/id-suggest-notice.test.ts`: the reason dictionary matches the new code.

## Compatibility

The wire contract changes by one enum value (`reason`). No new dependency, no Project config change, no database change. The behaviour is a **change** rather than a pure addition: an id that used to come from the default model now appears only when the Project carries a usable free model; otherwise the name transliteration or the placeholder answers. To get the old behaviour back, put a key on a $0 entry in the Project.
