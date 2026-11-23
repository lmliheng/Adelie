# Commands only lose color when the user asks for it

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `core`

[中文](2026-11-24-command-color-preference.zh.md)

Commands an Agent starts through `exec_command` / `input_command` used to receive `NO_COLOR=1`
unconditionally. A user who wanted color — or a tool that flips to plain text merely because it
sees `NO_COLOR` — had one way out: put `FORCE_COLOR` in the Vault. The variable is no longer
pinned: a `NO_COLOR` in the host environment is inherited as usual, and nothing is set when there
is none, so a Vault entry works the same way.

## Details

- `packages/core/src/environment/tools/command/session-manager.ts`: `HARDENED_ENV` drops
  `NO_COLOR: "1"`. The rest of the table is untouched — `TERM=dumb`, `PAGER` / `GIT_PAGER`,
  `GIT_EDITOR` and `GIT_TERMINAL_PROMPT` all guard against a command hanging while it waits for
  input, and color was never one of those.
- `FORCE_COLOR` / `CLICOLOR_FORCE` are still **removed** from the child environment (removed, not
  blanked: Node reads an empty `FORCE_COLOR` as "force 16 colors on"), so a piped command still
  cannot be flooded with ANSI escapes by an inherited color-forcing variable — the `#102` rule is
  unchanged.
- `packages/web/src/lib/strip-ansi.ts` has its file header updated: ANSI is still stripped at
  render time, but what it defends against is now a Trace recorded before this fix and a program
  that colors unconditionally, not "the command tools pin `NO_COLOR=1`".
- `packages/docs/content/configuration.{zh,en}.md`: `NO_COLOR` moves out of the "always gets a
  fixed value" row of the environment table, with its new rule spelled out.

## Compatibility

Interfaces, the data root and the Vault's semantics are unchanged. The only visible difference is
that an Agent's commands no longer see `NO_COLOR` by default; set one in the Vault to keep the old
behaviour, or `FORCE_COLOR` to force color on.
