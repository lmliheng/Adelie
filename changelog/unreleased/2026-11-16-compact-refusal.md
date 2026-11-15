# A `/compact` the server will not start keeps its reason above the input card

- **Date:** 2026-11-16
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-16-compact-refusal.zh.md)

`/compact` is the one press in the composer that posts nothing: it asks the server to close the context. The
route answers 202 when the compaction starts and 409 when it will not — this agent has no context compaction
configured, no conversation turn has finished yet, or the context was just compacted and nothing has happened
since. A refusal writes nothing either: running the command consumes the slash token, and the conversation is
the same one with the same context. The reason used to live only in a notification that **dismissed itself
after six seconds**, over a screen that had not changed; it is now written on the line **above the input
card** — the slot a refused send, a `/agent` handoff and a `/model` switch already use — scoped to this
Session and cleared when the next attempt starts.

The thinking level dialog's "compact, then switch" deliberately keeps its notice: that press is a compound
one — the level **is** switched even when the compaction cannot start — so "this conversation is unchanged"
would be false there, and that path already reports the failure as its own notice.

## Details

- `packages/web/src/features/chat/message-send-refusal.ts` gains `compactionRefusalLine(sessionId, err)`: the
  reason still comes from the plain send's `sendRefusalReason`, so the route's own codes
  (`nothing_to_compact`, `already_compacted`, `compaction_not_configured`) are read through the interface's
  sentences. No model id is passed: a refused compaction never reaches a model call.
- `chat-page.tsx`'s `runCompaction` takes an optional `onRefused` — the one path to the server, shared by the
  command and the dialog. The `/compact` command passes a writer for the card's slot; the dialog still gets
  the toast.
- One sentence pair for `chat.compactRefused(reason)` (zh/en): "could not compact this context; this
  conversation is unchanged" — true of every refusal, and it names no retry the card cannot offer (the
  command's token is already consumed).
- Docs: a paragraph under "Use slash commands" in `chat.zh.md` / `chat.en.md`, saying when the server refuses,
  that a refusal changes nothing, where the reason is drawn, and that a compaction that did start and then
  failed is recorded on the compaction row instead.

## Tests

- `packages/web/test/message-send-refusal.test.ts` grows by 6 cases: the sentence says the context was left as
  it was and belongs to the Session, reads each of the route's three 409 codes through its own sentence (never
  the wire message), names no model, keeps what a request that never reached the route has to say, speaks the
  active language, and is drawn only while the reader is still in that conversation.
- `packages/web/e2e/compact-refusal.spec.mjs` (new, 2 cases, real server + the repo's mock model): the route
  stubbed to 500 `internal` → the sentence above the card (measured against the card's top edge), not a
  notification, one request, the token consumed, still there after seven seconds; and the real refusal
  (`nothing_to_compact` on a conversation that never ran) → the code's own sentence on the card, no
  notification, still there after seven seconds.

## Compatibility

Front-end state, copy and rendering only: no interface, wire format or stored data changes.
