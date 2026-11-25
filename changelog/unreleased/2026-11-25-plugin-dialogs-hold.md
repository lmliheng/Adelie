# A plugin card's dialog stays open when the install snapshot lands

- **Date:** 2026-11-25
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-25-plugin-dialogs-hold.zh.md)

A plugin card opens three dialogs of its own: the install list ("管理安装"), the plugin's detail, and
the delete confirmation. Any of them could close itself a moment after it opened. The plugins page
enters with an empty install snapshot and fills it when every Agent's skills/hooks read answers;
that answer refiles the cards the working Agent holds into the other section, which is a different
list, so the card is unmounted and a new instance mounted in its place — and a dialog held in the
card instance went with the old one. A reader who clicked before that read landed (a loaded
machine, a slow first read) watched the dialog vanish with the click already spent. The page holds
which card dialog is open now, the way it already held the install refusal for the same reason.

## Details

- `packages/web/src/features/plugins/plugins-page.tsx`: one page state, `cardDialog` —
  `{ plugin, kind }` with `kind` being `installs`, `detail` or `delete` — instead of a `useState` in
  the card; `PluginCard` takes `dialog` / `onDialog` and draws the same three dialogs from them.
- A row's install or uninstall still ends with the install list closed: it is `closeAfterWrite` in
  the card now, because the remount that used to do it no longer takes the list with it. It closes
  on the answer either way — a refused install's reason is drawn under the card
  (`install-refusal.ts`), and the list would sit over it.
- `packages/web/e2e/plugin-card-dialogs-hold.spec.mjs`: three cases, one per dialog. The fixture
  parks the skills read until the dialog is on screen and only then lets it answer, so the dialog
  is opened inside exactly the window the bug needs; the section head's count (「已安装的插件 (0)」
  → 「(1)」) is how each case knows the refile really happened.

## Compatibility

Only which dialog is open, and where that is held. Interfaces, the data root and the successful
paths are unchanged, and the behaviour after a row's install or uninstall (the list closes) is what
it was.
