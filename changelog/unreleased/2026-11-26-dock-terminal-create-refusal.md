# A terminal that fails to start from the dock's picker says why, under the picker

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-26-dock-terminal-create-refusal.zh.md)

Pressing the terminal row on an empty dock's picker when the server cannot start a shell used to
leave the screen exactly as it was: the row still there, no shell, and the reason in a notice
that dismissed itself after six seconds. Clicking again was the only thing to try, with nothing
on screen saying what had happened.

The picker is the surface that asked for the shell, so the sentence now stays under it — the
app's own words plus the server's reason (the body's `error.message`, not the raw wire line) —
until the next attempt. A create that lands takes it away, and a later attempt replaces it. Callers
with no surface of their own keep the toast: a "+" over a running tab, or the terminal shortcut
with the dock hidden (`dock.spec.mjs` still pins that path).

## Details

- `packages/web/src/features/dock/dock-terminal.ts`: a module store (`subscribeTerminalCreateRefusal`
  / `readTerminalCreateRefusal` / `clearTerminalCreateRefusal`) written when the picker is on
  screen — `dockViews()` listing a view with no tabs — and `terminalCreateRefused(detail)`, which
  reports a refusal as the server's `error.message` when the body carries one and as the whole
  detail otherwise.
- `packages/web/src/features/dock/dock-panel.tsx`: `role="alert"` line
  (`data-testid="dock-terminal-create-refusal"`) under the picker, retired when a tab takes the
  picker's place.
- `packages/web/src/lib/strings{,-en}.ts`: `terminal.createRefused(reason)`.
- `packages/web/test/dock-terminal-create-refusal.test.ts` (5 cases) and
  `packages/web/e2e/dock-terminal-create-refusal.spec.mjs` (the picker path: sentence stays past
  a toast's lifetime, no notification, and a recovered create clears it).

## Compatibility

The Web App only, and only the empty dock's picker: the keyboard path and the "+" over existing
tabs keep their toast, and nothing about the terminal API changes.
