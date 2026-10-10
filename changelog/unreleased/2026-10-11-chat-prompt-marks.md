# `penguin chat` marks its prompts for terminals

- **Date:** 2026-10-11
- **Type:** feature
- **Scope:** `cli`, `docs`

[中文版](2026-10-11-chat-prompt-marks.zh.md)

Ported from upstream PenguinHarness (#1003, commit `c95ef950`).

On a terminal, `penguin chat` now writes the OSC 133 semantic prompt sequences (the ones shells
write for shell integration). A terminal that supports them can jump between the chat's prompts
and select one turn's output, and a program hosting the chat in a terminal of its own can tell
when the chat is back at its prompt and takes input, without matching the prompt text.

## Details

- `A` is written where the `> ` prompt starts and `B` where input starts after it. The
  continuation prompt, the approval question and the exit confirmation are not marked.
- `C` is written when a submitted prompt's turn starts, including `/compact`, `/clear`,
  `/switch-model` and `/goal`, and `D;0` when it ends, or `D;1` when it ended in an error.
  Commands answered locally, such as `/thinking` and `/verbose`, run no turn and are not
  enclosed.
- Nothing is written unless both stdin and stdout are a terminal and `TERM` is not `dumb`, so a
  redirected or piped output never carries them. The sequences are zero-width and terminals that
  do not know them ignore them.
- The CLI page describes the marks and notes that they are advisory, in both languages.
