# A preset a sync adds now takes the key its group already holds, instead of arriving unconfigured

- **Date:** 2026-10-30
- **Type:** fix
- **Scope:** `server`, `docs`
- **Breaking:** no

[中文版](2026-10-30-preset-key-follows-the-group.zh.md)

**Sync presets** adds the catalog models a Project does not have yet. In a gateway group — TokenDance,
OpenRouter, Fireworks AI, SiliconFlow, the two Qwen gateways, ModelScope — every row is answered by the same
endpoint behind the same login, so a preset that arrived without a key was drawn as having no key configured and
failed its own speed test next to a dozen working rows; the only cure was pasting the same key a thirteenth time.
Saving the model table now fills such a row from the key its group already holds, so the sync finishes the job the
one paste started.

## Details

- `packages/server/src/services/project-config-service.ts`: `groupApiKey(pool, provider, baseUrl)` answers the key
  a keyless row may borrow — the single `api_key` the table holds for that provider **and that base URL**, and
  nothing when those rows disagree. Two keys under one group are two accounts (or a deliberate split), and a
  different base URL is a different service, so in both cases the row stays keyless exactly as before rather than
  picking one.
- The pool a borrow is read from is the stored table **plus the rows the same request brings a key for**, so the
  answer does not depend on where in the table the page put the row it added: the page writes the whole table, and
  the row carrying the key may precede or follow the preset that needs it.
- Only rows the built-in catalog carries borrow. A model added by hand keeps the semantics it had: replacing it
  without its key still means the credential does not migrate.
- An explicit **Clear saved API key** is still an answer: a row a request asks to leave keyless is not filled back
  in by the row beside it.
- Tests: `packages/server/test/models.test.ts` gained four cases — the borrow itself (with the plaintext still
  absent from every response), a group holding two different keys, an explicit clear, and a preset pointed at
  another endpoint or added by hand.
- Docs: `packages/docs/content/models.{en,zh}.md`, "Sync preset models" — the list said syncing never touches API
  keys; it now names the one exception.

## Compatibility

- No breaking change: no protocol, DTO or file-layout change. A row that already had a key keeps it, a group with
  one key is the only shape that fills anything in, and an explicit clear is still respected.
- The key stays on the server: the borrow writes to `.project_config.toml` and a response carries only the mask.
