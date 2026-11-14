# A refused recall of a queued message says why, under the line that asked

- **Date:** 2026-11-15
- **Kind:** fix
- **Scope:** `web`

[中文](2026-11-15-queued-recall-refusal.zh.md)

While a Task runs, a message can be queued for it — a mid-run steering message or a follow-up — and
each queued entry is drawn above the composer with its content and a small `Recall` arrow. Pressing
the arrow withdraws the entry server-side and puts the content back into the input box for editing.
When the DELETE is refused, nothing on screen moved: the line still showed the message, the arrow was
still there, so that arrow was the retry. Only the reason was missing, and it arrived as a
notification that dismissed itself after six seconds over the top of the page — leaving a press that
looked like it had never registered.

The refusal now stays under the line whose arrow was pressed, keyed by the queue and the entry, so
with several messages queued it appears exactly once, beneath the one that asked. The sentence names
the reason and nothing more: the two refusals this route really produces already say what happened
(`not_pending` — the steering reached the model; `follow_up_started` — the follow-up became a task),
and a 5xx means the entry is still queued, so the line above the sentence is the honest account of
where the message stands. Every attempt clears the previous sentence first, a sentence clears itself
with its own line once that entry is gone, and the arrow pops no notification any more.

## Details

- `packages/web/src/features/chat/queued-recall-refusal.ts` (new): `queuedRecallRefused(queue, id,
  error)` with `queue` being `steer` / `followUp`; the reason goes through `refusalText` and the
  sentence lives in the dictionary. `queuedRecallRefusalShown(refusal, queue, id)` decides which
  line draws it (an entry with no id — an old server — has no arrow, so it can own none), and
  `queuedRecallRefusalHosted(refusal, steering, followUps)` says whether the entry it describes is
  still on screen. The file header explains why the queue is part of the key: both lists hang in the
  same composer card.
- `packages/web/src/features/chat/chat-input.tsx`: the two callbacks now answer `RecallAnswer`
  (`recalled` with the content / `refused` with the error), so the composer — the only place that
  knows which line was pressed — composes the sentence. New `recallRefusal` state, cleared on every
  attempt and by an effect once its entry leaves its queue; `QueuedMessageLine` takes an optional
  `refusal` and draws it as a block of its own under that row (`role="alert"`, danger tone, two
  lines, the whole sentence in the tooltip).
- `packages/web/src/features/chat/chat-page.tsx`: `onRecallSteering` / `onRecallFollowUp` report the
  refusal instead of toasting it.
- `packages/web/src/lib/strings.ts`, `strings-en.ts`: `chat.recallQueuedRefused(reason)`.

## Tests

- `packages/web/test/queued-recall-refusal.test.ts`: an answer the server gave reads as the
  dictionary's sentence rather than the wire's English (and the two queues' 409s stay distinct), the
  queue and the entry come back with it, a failure raised by this codebase keeps its own words, the
  wording never claims the recall happened, the right line draws it and the other queue's entry of
  the same id does not, and it follows the active dictionary.
- `packages/web/e2e/queued-recall-refusal.spec.mjs`: three cases against a real server, a real
  browser and a real queued message (mock LLM's slow tool run keeps the Task busy). The DELETE is
  refused at `page.route`, so the queue the server holds is never touched. A 409 `not_pending`
  (sentence under that line, the server's own wording rather than the wire message, content and
  arrow still there and still enabled, the draft untouched, no notification); a 500 followed by a
  409 (one sentence at a time, and it is the new press's); and two queued messages with only the
  second arrow pressed (a single sentence, drawn below that line and not below the first).

## Compatibility

No API change, no new dependency, no configuration change. The notification these arrows used to pop
is gone in favour of one line under the queued entry it is about.
