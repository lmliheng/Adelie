# A refused "send to background" says why, under the tool row that asked

- **Date:** 2026-11-15
- **Kind:** fix
- **Scope:** `web`, `ui`

[中文](2026-11-15-background-move-refusal.zh.md)

Once an `exec_command` or `run_subagent` call has been executing for ten seconds, its row offers
**Send to background**: the call hands its work back as a background task and the turn carries on.
The route answers 404 when the call stopped in the click's race window and 409 when the tool has no
background form; the card settles on its own in both cases, so neither is worth a word. Every other
answer is a real failure, and the reason used to arrive as a notification that dismissed itself after
six seconds while the row looked exactly as it had before the press — the action was still there,
still enabled, and nothing said why pressing it changed nothing.

The refusal now stays under that row, in the same slot the action sits: the button that was pressed
is one line above the sentence, so pressing it again is the retry, and the reason stays for as long
as that retry is possible. The sentence names the reason and nothing more — the route reports nothing
about the call's state beyond the two answers above, so a 5xx is a failure this end cannot read
further into. Every attempt clears the previous sentence first, and the sentence goes away with the
action once the call settles.

## Details

- `packages/web/src/features/chat/background-move.ts` (new): `BackgroundMoveAnswer` (`moved` /
  `settled` for the two quiet answers / `refused` with the raw error), `backgroundMoveAnswer(error)`
  deciding which one a failed request is, and `backgroundMoveRefused(answer)` composing the sentence
  through `refusalText` — the rule every refusal slot in the app follows, 7.19.
- `packages/web/src/features/chat/chat-page.tsx`: `onSendToBackground` answers `BackgroundMoveAnswer`
  instead of toasting the reason; the 404 / 409 shapes stay silent.
- `packages/web/src/features/chat/tool-call-card.tsx`: the action's availability is computed once
  (`backgroundAction`), so the same gate decides whether the action is offered and whether the
  sentence is drawn; the card owns the sentence (`backgroundRefusal`, cleared at each attempt) and
  passes it to the shared card as `refusal`.
- `packages/ui/src/components/chat/tool-call-card/tool-call-card.tsx`: a new optional `refusal` prop,
  drawn as its own line under the row (`role="alert"`, danger ink, two lines, the whole sentence in
  the tooltip). It sits under the row rather than beside the action because the row is one line high
  at every breakpoint — a sentence at the right end would push the row's own words around.
- `packages/web/src/lib/strings.ts`, `strings-en.ts`: `chat.backgroundMoveRefused(reason)`.

## Tests

- `packages/web/test/background-move.test.ts`: 404 and 409 read as `settled` and produce no sentence;
  every other failure (including one that never reached the route) comes back as `refused`; the
  sentence uses the dictionary's wording rather than the wire message, keeps what a local error says,
  falls back to the generic text, says nothing when the call moved, and follows the active dictionary.
- `packages/ui/test/tool-call-card.test.ts`: a refused action draws the sentence on its own line with
  `role="alert"`, the action is still offered above it, and a card with nothing refused draws no slot.

## Compatibility

No API change, no new dependency, no configuration change. The notification this action used to pop
is gone in favour of one line under the row it belongs to.
