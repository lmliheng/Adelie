# A refused approval decision in the API tab's Try it keeps its reason on the row

- **Date:** 2026-11-16
- **Type:** fix
- **Scope:** `web`, `ui`, `docs`

[中文版](2026-11-16-api-try-approval-refusal.zh.md)

An agent's **API** tab ends with **Try it**, which sends one real API run under your own sign-in and
prints the event stream a program would receive, one row at a time. When the approval mode asks,
**Allow** and **Deny** appear on the `approval.requested` row, and pressing one posts the decision to
the Session's approvals route — but the `catch` behind it only raised a notification that **dismissed
itself after six seconds**. A server error or a dropped connection therefore left the row exactly as it
was: the reader could not tell which button they had just pressed, why it did not land, or that the
call was still waiting on them.

Now a refused decision writes the reason into that row, just above its two buttons — "couldn't hand
your 'allow' decision to the server; this call is still waiting on you: 〈why〉". Both buttons stay,
because nothing was written: pressing one again is the retry. **404** still says nothing — the call is
no longer waiting (it finished, or another window decided it), so the row settles there rather than
outliving its subject with a sentence about a decision that no longer exists.

## Details

- `packages/ui`'s `ApprovalButtons` gains an optional `refusal`, drawn above its own two buttons, and
  `ApprovalBlock`'s slot is now drawn by it — so a decision refused in the conversation and one
  refused here are **the same drawing** (same `role="alert"`, same `data-testid="approval-refusal"`,
  same danger tone, two lines at most).
- `api-try-log.ts`: the `approval` cell gains an optional `refusal`; a new `refused` action writes it
  and leaves `pending` alone; `decided` (an answer of this panel's landed, one from elsewhere, the run
  ended) clears both. The rule is an exported `approvalAnswerFailed(toolCallId, decision, err)`: 404 →
  `decided` (settle in silence), anything else → `refused` with the sentence `approval-refusal.ts`
  already gives the conversation view.
- `api-try-panel.tsx`'s `onApprove` raises no notification any more; it hands that action to the reducer.
- Docs: the "Try it" paragraph in `agent-api.zh.md` / `agent-api.en.md` says so.

## Tests

- `packages/web/test/api-try-log.test.ts` +2: a refused answer keeps the row asking, with the sentence
  verbatim above the Allow button and never the wire's English, both buttons still offered, and a later
  `decided` clears the buttons and the sentence together; and a 404 settles the row in silence.
- `packages/ui/test/tool-call-card.test.ts`'s "draws a refused decision inside the approval block, above
  the buttons it belongs to" still passes unchanged — the sentence moved (into `ApprovalButtons`) and
  what is drawn did not.

## Compatibility

Front-end state, one shared component, copy and docs only: no interface, wire format or stored data
changes.
