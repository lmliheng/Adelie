# A refused approval decision keeps its reason inside the block that is still asking

- **Date:** 2026-11-16
- **Type:** fix
- **Scope:** `ui`, `web`, `docs`

[中文版](2026-11-16-approval-answer-refusal.zh.md)

A tool call waiting on you shows its approval block with **Allow** and **Deny**. Pressing either one is a
single POST, and the catch behind it answered only 404 (the call is no longer waiting) and **dropped
everything else on the floor**: a server error or a dropped connection left the block exactly as it looked
before the press, no sentence anywhere, and the same two buttons asking again. The press had not registered,
and nothing said so — not even a notification.

Now a refused decision draws its reason inside that block, directly above the two buttons: which decision
did not get through (they sit side by side, and the reader may come back to the screen), and why. Both
buttons stay — nothing was written, so pressing again really is the retry. A 404 still says nothing: the call
has already settled, the block goes away on that same answer, and a sentence would outlive its subject.
Subagent approval cards follow the same rule, each one carrying its own sentence.

## Details

- `packages/ui/src/components/chat/approval-block/approval-block.tsx`: `ApprovalRequest` gains an optional
  `refusal`, drawn between the payload and the buttons (`role="alert"`, `data-testid="approval-refusal"`,
  danger colour, two lines at most, the whole sentence one hover away).
- `packages/web/src/features/chat/approval-refusal.ts` (new): `approvalAnswerRefused(decision, err)` builds
  the sentence through `refusalText` — the rule every refusal slot follows (7.19) — naming the decision with
  the interface's own word for it; `ApprovalAnswer` is that sentence or `null`.
- `chat-page.tsx`'s `onApprove` returns `Promise<ApprovalAnswer>`: the decision landed → `null`; 404 → drop
  the pending entry and `null`; anything else → the sentence, with the pending entry left alone.
- `tool-call-card.tsx` keeps that answer in its own state per card and hands it to the approval block, gated
  on the block still being on screen (every attempt starts clean). `message-stream.tsx`'s render context
  carries the new answer type.
- One sentence pair for `chat.approvalAnswerRefused(decision, reason)` (zh/en).
- Docs: the "Approve tool calls" section in `chat.zh.md` / `chat.en.md` says what a decision that could not
  be handed over looks like.

## Tests

- `packages/web/test/approval-refusal.test.ts` (new, 5 cases): a server answer is read through its code's own
  sentence (never the wire English), allow and deny read differently, a decision that never reached the route
  keeps what it knows, a value with nothing to say falls back to the generic text, and the sentence says the
  call is still waiting in both dictionaries.
- `packages/ui/test/tool-call-card.test.ts` +1: the refusal renders inside the block, above the buttons, with
  both buttons still there.
- `packages/web/e2e/approval-answer-refusal.spec.mjs` (new, 2 cases, real server + the repo's mock model):
  the decision stubbed to 500 `internal` → the block still asks, the sentence is above the buttons and never
  the wire's English, no notification, still there after seven seconds, then the same button lands the
  decision and the turn runs on; and a 404 settles the block silently (the call had already finished).

## Compatibility

Front-end state, copy and docs only: no interface, wire format or stored data changes.
