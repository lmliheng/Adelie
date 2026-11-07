# A refused write in the Agent's API tab says why under the switch or the select that asked

- **Date:** 2026-11-08
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-08-api-write-refusal.zh.md)

The API tab has three writes that apply on the press with no question first: turning the API on, the
approval mode its conversations start with, and turning keyless access off. None of the three
controls moves optimistically — the switch and the select show the position the server answered
with — so a refused write left the tab looking exactly as it had before the press. The one sentence
that explained it arrived as a notification that dismissed itself after six seconds; after that the
control simply looked as if it had been pressed and come back.

That is the shape 7.19 bans, and on this tab it costs the most: a keyless-off that did not land
leaves anything that can reach the address calling the Agent without a key, while the switch the
reader just pressed reads "off" in their memory.

Each of the three now keeps its reason under its own control, with `role="alert"`, the danger colour
and the whole sentence wrapping, until that control is used again — the switch and the select are
the retry. The three sentences say different things on purpose: the API is still off; the approval
mode was not changed, naming the mode that was asked for because the select fell back to the stored
one; and keyless access is still open.

## Details

- `packages/web/src/features/agents/api-write-refusal.ts` (new): `apiEnabledRefused(err)`,
  `apiApprovalModeRefused(mode, err)` and `apiKeylessOffRefused(err)`. The reason goes through
  `refusalText` (7.19's rule: an answer the server gave is read through its code's own localized
  sentence, never the English wire message), and the approval-mode sentence resolves the mode's
  display name itself, so the sentence reads the same in both languages.
- `packages/web/src/features/agents/api-tab.tsx`: `write()` hands a refused write back to the
  control that asked for it instead of a notification; the three slots are cleared when that control
  is pressed again; `ApiTabView` draws one `role="alert"` line under the switch, under the approval
  select and under the keyless switch. The import of `toastError` is gone from this file.
- `packages/web/src/lib/strings{,-en}.ts`: three new sentences, `agent.apiEnableRefused(reason)`,
  `agent.apiApprovalModeRefused(mode, reason)` and `agent.apiKeylessOffRefused(reason)`.

## Tests

- `packages/web/test/api-write-refusal.test.ts` (new, 9 cases): each sentence keeps the server's
  reason read through its code (never the wire message), keeps a sentence the interface raised
  itself, falls back to the generic text when there is nothing to say, says the API is still off /
  keyless access is still open, and names the mode that was asked for — in both languages.
- `packages/web/test/agent-api-tab.test.ts` (+1 render case): three alerts, each in its own place,
  and none at all when nothing was refused.
- `packages/web/e2e/agent-api-write-refusal.spec.mjs` (new, real server + real browser): each write
  is refused at `page.route` and read back from the server through the API. The sentence appears
  once, in the interface's words, the notification region stays empty, the control stays in its old
  position and the server stored nothing — and **seven seconds later** the sentence is still there.
  Pressing the same control again with the write allowed clears it and lands the change.

## Compatibility

No interface change, no new dependency, no Project config change. The three confirmations that ask
first (turn the API off, allow keyless access, delete a key) keep their refusal inside the card, and
their spec still passes unchanged.
