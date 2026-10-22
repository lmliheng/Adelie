# A plugin card's three confirmations keep their question — and the reason — when the write is refused

- **Date:** 2026-10-22
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-22-plugin-card-refusal.zh.md)

Every card in the plugin library has three writes that ask first: **uninstall** this plugin from one Agent,
**update** the copies that fell behind the library, and **delete** a user plugin from disk. All three
confirmations used to settle on the request — two of them closed before it even went out — so a refusal
left the installed files and the plugin's directory exactly as they were, while the reason only landed in
a toast that dismissed itself after six seconds and sat above the card.

All three now close only once the write landed; a refusal leaves the card open with the server's words
drawn under its sentence, so the retry is the same button. Opening one from a card action clears the
previous reason first — one attempt, one reason.

## Details

- The rule is the one the model library, schedules, the benchmark centre, the plugin market's module rows,
  session deletion, MCP servers, the Skills tab and the Hooks tab already follow (`ConfirmModal`'s
  `refusal` slot): the reason is drawn in the card that asked for the write.
- `features/plugins/plugins-page.tsx`: `toggleInstall`, `updateOutdated` and `removePlugin` answer with a
  `WriteOutcome` (the pair the model library introduced in 7.19) instead of raising a toast of their own —
  the caller places the words in the card it still has. The card's paths without a confirmation (the
  one-click install to an Agent, a manage-installs row's Install) raise the toast themselves, because
  there is no card to keep there.
- **Two writes are no longer optimistic**, both because an optimistic move unmounts the very card that
  asked:
  - Deleting a plugin no longer takes the card off the listing first. Removing it while the request is in
    flight takes the question — and a refusal's reason — with it; the card goes once the directory is
    gone, and the confirm button reads `busy` meanwhile.
  - Uninstalling no longer moves the install snapshot before the answer. Dropping the current Agent's copy
    flips the card to "not installed" and carries it into the other section, which remounts the card — and
    that remount is the confirmation, and its reason, gone. The snapshot now moves after the answer; the
    row reads "Installed" while it waits, which is also what a refused one leaves it at.
- An update is a partial success: the Agents that took it keep their new installed state, the first
  failure's words come back into the card, the ones still behind stay marked behind on the cards and in
  the notice, and the retry sends the same set again.
- New browser tests `e2e/plugin-card-refusal.spec.mjs` (three: delete / uninstall / update): a refusal
  keeps the dialog, its sentence and the card or row, leaves the notification region without a toast, and
  reopening does not carry the old reason; only the retry that lands closes the dialog (and takes the card
  with it, in the delete case). The library and the installed list are fixtures (a development data root
  ships no user plugin) and the three writes are taken over by `page.route`.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* the card closes and *where* the
  reason is drawn.
- The plugin market's bulk-update confirmation is not part of this change: it is a partial success, and
  naming which Agents did not take it is a separate piece of work.
