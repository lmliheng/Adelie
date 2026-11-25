# Each conversation's built-in browser is its own: tabs, active tab and cookies no longer cross between them

- **Date:** 2026-11-25
- **Type:** feature
- **Scope:** `server`, `web`, `desktop`, `cli`, `docs`
- **Breaking:** yes — the desktop app's built-in-browser connection protocol is now version 2; an older desktop app is told to update.

[中文](2026-11-25-builtin-browser-per-conversation.zh.md)

The built-in browser used to be one instance for the whole application: a single pool of tabs with a
single "active tab" pointer, and one Chromium partition shared by every page. Two conversations
using the browser at once therefore fought over it — the panel jumped back and forth between them,
the page one conversation was filling in lost focus when the other clicked or typed, and a
dangerous action could land on the other conversation's page. Cookies were shared too, so a login
one conversation made on a site was already there for the next one, and `penguin browser` had
nothing that bound it to the conversation it was meant to act in.

The browser is now scoped to a conversation. Each conversation has its own tab set and its own
active tab, so one conversation's open, switch or close never moves another's panel, and the panel
shows only the conversation it belongs to. Each conversation also runs its pages in its own
Chromium partition, so cookies and site storage are its own and two conversations logged into the
same site are two independent logins. The command line binds a command to a conversation with
`--session <id>`, falling back to `ADELIE_SESSION_ID`, and the default scope — no conversation, the
CLI outside a session — keeps the original partition, so nothing done before this existed is
orphaned.

## Details

- `packages/server/src/builtin-browser/partitions.ts` (new): one scope becomes a partition
  (`persist:penguin-browser` for the default scope, `persist:penguin-browser:<sessionId>`
  otherwise) and a partition the shell reports becomes a scope again.
- `packages/server/src/builtin-browser/service.ts`: a scope's tabs and active pointer live in that
  scope's own registry (`Map<scope, TabRegistry>` with a `tabId → scope` route), every action
  resolves `active` inside its own scope, and `builtin_browser_tabs` is published per scope with
  its `sessionId`.
- `packages/server/src/builtin-browser/routes.ts`: `/status`, `/tabs`, activation, close, import
  and clear-data read the scope from `?sessionId=` or the body.
- `packages/server/src/api/types.ts` / `shell-link.ts`: the shell's tabs carry `partition`, the
  commands carry it, and the connection protocol is version 2 (`MIN_PROTOCOL_VERSION = 2`).
- `packages/desktop/src/builtin-browser-rules.ts` / `builtin-browser.ts`: the shell accepts the
  partition family, hardens each guest into the partition its `<webview>` names, and keeps one
  `Session` per partition.
- `packages/web/src/features/builtin-browser/`: `scope.ts` (new) resolves the on-screen
  conversation to a scope; the store keeps tabs, active tab and closing state per scope; the
  panel, tab strip, toolbar and page layer read the current conversation's scope; each `<webview>`
  carries its conversation's partition.
- `packages/cli/src/commands/browser.ts`: `--session <id>` on every subcommand, ahead of
  `ADELIE_SESSION_ID`.
- Docs and the browser-automation skill updated to say the browser is per-conversation.

## Tests

- `packages/server/test/builtin-browser/`: 13 files / 181 cases, including five new
  per-conversation isolation cases (separate tab sets, separate active pointers, separate
  partitions, a restart that restores each tab's scope from its partition).
- `packages/web/test/builtin-browser-state.test.ts` (44, incl. a per-conversation isolation
  block), `builtin-browser-scope.test.ts` (2), `builtin-browser-events.test.ts`.
- `packages/cli/test/browser-commands.test.ts` (40, incl. two on which conversation a command acts
  in), `packages/desktop/test/builtin-browser-rules.test.ts`.
- `pnpm -r typecheck`, `pnpm lint` (0 warnings, 0 errors) and `pnpm -r test` pass across all
  packages.

## Compatibility

The desktop app and the server speak connection protocol 2: the shell reports its version when it
connects and the server refuses anything below 2, so an older desktop app is shown the "update the
desktop application" notice for the built-in browser until the app is updated. The default scope
keeps the original `persist:penguin-browser` partition, so a browser used before this change keeps
its cookies and logins; only a conversation gets a partition of its own.
