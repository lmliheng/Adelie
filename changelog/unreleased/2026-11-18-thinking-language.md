# The default prompt asks the model to think in the user's language, not only answer in it

- **Date:** 2026-11-18
- **Type:** feature
- **Scope:** `core`

[中文版](2026-11-18-thinking-language.zh.md)

The default system prompt is written in English, and its one language line only governed the REPLY:
`always reply in the user's language`. So a conversation in Chinese still had its reasoning — the
thinking block the user reads on screen — written in English, a narration addressed to nobody in
particular rather than to the person being answered.

`# Personality` now carries, right beside the reply rule, the same requirement for thinking: the
user reads the reasoning, so it belongs in their language rather than defaulting to English. It is a
prompt line, not a switch: how literally a model takes it varies, so it reduces English reasoning
without promising none.

## Details

- `packages/core/src/state/default-config.ts`: one sentence in `DEFAULT_SYSTEM_PROMPT`'s
  `# Personality` (kept in English, the language that template is written in).
- A substantive change to the built-in defaults, so it goes through the kernel-version mechanism:
  `KERNEL_VERSION` in `packages/core/src/state/kernel-history.ts` moves from `2026-11-15` to
  `2026-11-18`; `KERNEL_DEFAULT_TAB_HASHES.prompt` takes the new hash `bdfdd83c…a2af2`, and the old
  one, `6dc01249…69825`, is appended to `KERNEL_SUPERSEDED_TAB_HASHES.prompt` (frozen — the record of
  what shipped); a line in the generation list says what moved.
- The effect: any Agent whose `system_config.yaml` stamp is behind the current version is judged per
  settings tab on the next load — an **untouched prompt tab advances** to the new default, a tab the
  user edited is kept whole. The rule therefore reaches every Agent with the new build, not only
  newly created ones.

## Tests

- `packages/core/test/kernel-version.test.ts`, all 19 pass: the pinned-hash guard named exactly one
  tab, `prompt`, and goes quiet once the record is advanced; alongside the LEGACY reconstruction, the
  tab-ownership checks and the `isKernelOutdated` / `applyKernelUpdate` cases.
- `packages/core` in full: 70 files, 1456 tests pass (6 skipped).
- The new hash comes from `computeKernelTabHashes(defaultSystemConfig())`; the other six tabs are
  unchanged from the previous generation.

## Compatibility

Prompt text and kernel version only; no config format or API change. Stored Agent configs are handled
by the existing kernel update: untouched prompt tabs advance, edited ones are kept, and restore
defaults remains the recourse.
