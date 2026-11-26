# The default prompt checks the deliverable itself, and keeps a candidate saved while refining

- **Date:** 2026-11-27
- **Type:** feat
- **Scope:** `core`

[中文](2026-11-27-default-prompt-deliverable-check.zh.md)

Ported from upstream PenguinHarness (#1880, commit `ef6c8ce99`).

The built-in system prompt asked the agent to "check that every problem in the request has
been solved" and to verify with the project's own commands. Neither line said what to compare
the result against, so a deliverable could come back with its literals, paths, filters or
required outputs off by a detail and still be reported as verified.

`# Success criteria` now names what to check: the user's explicit requirements, including
literals, paths, filters and required outputs; a specified exact content is compared whole
(the file, the response, the field), and a transformation or filter is checked on one case it
should change or include and one it should preserve or exclude. The project's documented checks
are still run, but a requirement or concrete risk left unverified by them gets one focused
check — and only observed results are reported.

Two smaller rules joined as well: `# Stop rules` now says to use a low-cost check to tell
likely causes apart when the same failure recurs and the last check did not narrow it, rather
than rerunning the suite; `# Tool use` asks that once a candidate is in the requested format
with all its required parts, it be saved at the requested path before further refinement, so a
long build never ends with only a description of the file.

## Details

- `packages/core/src/state/default-config.ts`: `DEFAULT_SYSTEM_PROMPT`'s `# Success criteria`
  (two lines rewritten), `# Stop rules` (one line added) and `# Tool use` (one line added, the
  non-interactive-commands line extended for unattended Debian installs, long-lived services,
  background completion and the exit status).
- `packages/core/src/state/kernel-history.ts`: `KERNEL_VERSION` `2026-11-18` → `2026-11-27`;
  the old prompt-tab hash moves to `KERNEL_SUPERSEDED_TAB_HASHES.prompt` and the recomputed
  hash is written into `KERNEL_DEFAULT_TAB_HASHES.prompt`; the generation list gains the entry
  describing what moved. Only the prompt tab moved.

## Compatibility

The default changed substantively, so the kernel advances: an Agent whose prompt tab was never
edited advances with the next load, while an edited prompt tab is kept whole as before. No
interface, stored-data or dependency change; a stored config's own `kernel_version` is simply
re-stamped when the update applies.
