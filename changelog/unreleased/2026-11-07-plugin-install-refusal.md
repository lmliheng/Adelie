# A plugin that could not be installed to an Agent says why in its card, not in a six-second toast

- **Date:** 2026-11-07
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-07-plugin-install-refusal.zh.md)

A plugin card has two ways to put a plugin on an Agent: the card's own "Install to <agent>" button,
and the "Install" on each row of its "manage installs" dialog. Neither asks first, and when the
install did not land (the server refused, the plugin was not in the library, the request never
arrived) nothing changed: the files were still not installed, the card and that row were still
there with the same button, and the reason went to a notification that dismissed itself after six
seconds. Afterwards the screen read exactly as it had before the press, with nothing said about why.

That sentence now renders in the plugin's card (`role="alert"`, danger colour, two lines, the whole
sentence on hover) and names the Agent it could not reach — the dialog lists one row per Agent and
the card's button follows the page's selection, so without the name there is no telling which Agent
stayed empty. It stays until the next attempt starts, or until an install that lands replaces it.

## Why the page keeps the sentence, not the card

An install is optimistic: as the request leaves, the page marks the plugin present on that Agent,
which files the card into the installed section; when the server refuses, the mark rolls back and
the card returns. The card instance that sent the request is therefore unmounted once before the
answer arrives — a sentence kept inside it goes with that instance (which is what the first version
did; measured, and the page showed nothing at all). So the page keeps it, keyed by plugin, and hands
it to the card that comes back. The "manage installs" dialog closes with the same move, which is why
its rows carry no slot of their own.

## Details

- `packages/web/src/features/plugins/install-refusal.ts` (new): `installRefused(plugin, agent,
  reason)` builds the sentence and `installRefusalFor(refusal, plugin)` decides which card gets it —
  the pure part, testable without the page. The reason is the one `toggleInstall` already produced
  (`apiErrorText`, with `refusalText`' rule for a value no server answered), so it speaks with the
  same voice as the three confirmations' refusal slots.
- `packages/web/src/features/plugins/plugins-page.tsx`: the page keeps `installRefusal` (plugin +
  sentence); `toggleInstall` clears it when an install starts and writes it when the install fails
  (the uninstall path is untouched and still hands its outcome back to the confirmation that asked),
  and the card reads it through a new `installRefusal` prop. The card's outer element becomes a
  column — the existing row plus the sentence underneath.
- `packages/web/src/lib/strings{,-en}.ts`: one new sentence,
  `plugins.installRefused(plugin, agent, reason)`.

## Tests

- `packages/web/test/install-refusal.test.ts` (new, 5 cases): the sentence names the plugin and the
  Agent and carries the reason through; it uses the active language; it is handed to its own
  plugin's card and to no other; nothing is drawn when the last install was not refused.
- `packages/web/e2e/plugin-install-refusal.spec.mjs` (new, real server + real browser, 2 cases): the
  install is stubbed to a 500 (a code the interface has its own copy for, plus an English wire
  message). A refused one-click install puts the sentence in the card, names the Agent, uses the
  interface's words rather than the English message, leaves the notification region out of it, and
  keeps the retry enabled — **seven seconds later** (past the six an error notification lives) it is
  still there, and a retry that lands clears it with both request bodies identical. The second case:
  an install refused from a "manage installs" row closes that dialog with the card's optimistic
  move, the card returns to the available list with the same sentence underneath (past seven seconds
  too), and a retry through the dialog clears it once it lands.

## Compatibility

No interface change, no new dependency, no Project config change. The success path, the three
confirmations (update, uninstall, delete) and the rest of "manage installs" are untouched.
