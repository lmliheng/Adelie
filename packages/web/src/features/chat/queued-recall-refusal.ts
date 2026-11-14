/**
 * Recalling a queued message (`features/chat/chat-input.tsx`, the 撤回 button on a queued steering or
 * follow-up line) and the sentence a refusal leaves under the line that asked for it.
 *
 * The two queues share the button and the route shape, so a refusal has to say **which line** it is
 * about: both lists hang in the same composer, one above the other, and both keep their place on
 * screen when the DELETE is refused — the line still shows the content and still offers the button,
 * so that button is the retry. What used to arrive instead was a notification that dismissed itself
 * after six seconds while the composer looked as if the press had never happened (7.19's rule,
 * app-wide: the sentence belongs where the attempt was made).
 *
 * Which words: `refusalText`, the rule every refusal in the app follows — an answer the server gave
 * is read through its code's own localized sentence (`not_pending` / `follow_up_started` already say
 * whether the message reached the model), and a value this codebase raised itself is shown as it
 * wrote it. The sentence deliberately claims nothing beyond that: on a 5xx the message is still
 * queued, on a 409 it has just gone out, and only the reason can tell the two apart.
 */
import type { RecalledMessageResponse } from "@adelie/server/api";
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The two queues a recall button can sit on; a refusal goes back to the one that was pressed. */
export type QueuedRecallQueue = "steer" | "followUp";

/**
 * What one recall attempt answered — the shape the composer's callbacks hand back.
 *
 * It used to be `RecalledMessageResponse | null`, with the parent toasting the error before
 * answering null, so the composer could not tell "nothing was asked" from "it was refused" and the
 * reason never reached the line that asked. The refusal now travels with the answer, still as the
 * raw error: the composer composes the sentence, because it is the one that knows which line was
 * pressed (see `queuedRecallRefused`). `null` stays for the one attempt that is never made — no
 * Session selected, so no queue is on screen to own a sentence.
 */
export type RecallAnswer =
  | { readonly kind: "recalled"; readonly message: RecalledMessageResponse }
  | { readonly kind: "refused"; readonly error: unknown };

/** What a refused recall is about (which queue, which entry) and what to draw under that line. */
export interface QueuedRecallRefusal {
  readonly queue: QueuedRecallQueue;
  /** The entry the refused DELETE named — the id the queued line carries. */
  readonly id: string;
  readonly text: string;
}

/** The sentence for a refused recall of one queued entry, keyed to that entry. */
export function queuedRecallRefused(
  queue: QueuedRecallQueue,
  id: string,
  error: unknown,
): QueuedRecallRefusal {
  return { queue, id, text: S.chat.recallQueuedRefused(refusalText(error)) };
}

/**
 * The sentence to draw under one line, or null when that press was not this line's.
 *
 * The id is optional because a mirror entry from a server that predates per-entry recall carries
 * none — such a line has no button, so it can never own a refusal.
 */
export function queuedRecallRefusalShown(
  refusal: QueuedRecallRefusal | null,
  queue: QueuedRecallQueue,
  id: string | undefined,
): string | null {
  if (refusal === null || id === undefined) return null;
  return refusal.queue === queue && refusal.id === id ? refusal.text : null;
}

/**
 * Whether the refusal still has its own line on screen.
 *
 * A refusal lives exactly as long as the line it belongs to: the sentence says "this one is still
 * queued", so it must go the moment the entry does (delivered, sent, or recalled elsewhere in
 * another tab) rather than outlive it and hang under the next message in the list.
 */
export function queuedRecallRefusalHosted(
  refusal: QueuedRecallRefusal,
  steering: readonly { readonly id?: string | undefined }[],
  followUps: readonly { readonly id: string }[],
): boolean {
  const ids = refusal.queue === "steer" ? steering.map((p) => p.id) : followUps.map((p) => p.id);
  return ids.includes(refusal.id);
}
