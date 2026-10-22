# Both bulk-update confirmations keep their question — and the reason — when the batch does not all land

- **Date:** 2026-10-23
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-10-23-bulk-update-refusal.zh.md)

Two page notices offer "update everything at once": **Plugins** reinstalls the library copy of every
outdated plugin on every Agent behind it, and **Agents** runs the kernel update on every Agent behind the
defaults generation. Both confirmations closed in a `finally` after the writes, and a partial failure only
reached a toast that dismissed itself after six seconds and sat above the dialog — so the one thing the
user needs while retrying (which Agents are still behind, and why) was also the first thing to leave.

Both now close only once every target landed. Anything less leaves the confirmation open with the
partial-failure sentence drawn inside it — the line that already names the Agents that did not take it,
followed by the server's own words — so the retry is the same button.

## Details

- The rule is the one the model library, the plugin cards, the Skills and Hooks tabs, session deletion,
  MCP servers and the plugin market's module rows already follow (`ConfirmModal`'s `refusal` slot, 7.19 —
  7.29): the reason is drawn in the card that asked for the write.
- `lib/bulk-update.ts` grows the two decisions the pages need, both pure and unit tested:
  - `bulkFailureText(outcome, reason, sentence, separator)` — the sentence the card draws, or `null` when
    the batch was clean. It stands on its own rather than behind `S.common.refused`'s "the operation was
    refused" lead-in: a batch that wrote three of five was not refused, and the line already says what
    happened.
  - `remainingTargets(targets, results)` — the part of a plan whose request was rejected, with the names
    left to rewrite recomputed.
- `features/plugins/plugins-page.tsx`: the batch's answer goes into the card (`bulkRefusal`), and
  `pendingBulk` is scoped down with `remainingTargets` — the retry asks about exactly the Agents the
  sentence named, instead of reinstalling the ones that already took it (every reinstall overwrites the
  Agent's installed copy, and the success line afterwards would then count attempts). Opening the batch
  from the notice clears the previous reason; closing the card clears both.
- `features/agents/agents-page.tsx`: the same, without the scoping step — the confirmation lists
  `kernelTodo.items`, which the reload after the batch re-reads from the server, so its retry already
  names the Agents still behind.
- A reload that fails *after* every write landed still closes the card and says so in a toast: the
  decision is taken, and what is left is a stale dot rather than a question this card still has to ask.
- New browser tests `e2e/bulk-update-refusal.spec.mjs` (two: the plugin batch and the kernel batch): a
  refusal keeps the dialog, its sentence, its plan and the server's words, leaves the notification region
  without a toast, and reopening does not carry the old reason; only the retry that lands closes it. Both
  trails are reads of `AgentSummary` (`pluginUpdates` / `kernelOutdated`), so one field is edited into the
  server's own Agent list and the writes are taken over by `page.route`.

## Compatibility

- No interface, wire-format, stored-data or dependency change: only *when* the card closes and *where* the
  reason is drawn. No new copy: the sentence is the existing partial-failure line plus the existing error
  text.
