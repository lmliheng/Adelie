/**
 * A message that did not get out of an existing conversation — the sentence the composer keeps
 * above the input card afterwards, and why it is drawn there instead of arriving as a toast.
 *
 * Sending is the card's only write, and a refusal changes nothing else on screen: the text, the
 * staged files and the send button all stay exactly as they were, so the button pressed a moment
 * ago IS the retry. What the reader used to get was a notification over the card that dismissed
 * itself after six seconds: afterwards the screen read as it had before the press, with the words
 * explaining why gone (7.19's rule, app-wide). The draft screen's first send already works this way
 * (first-send-refusal.ts, 7.94); this module is the same slot for a conversation that already
 * exists, where the attempt may be a task, a queued follow-up or a steering message — all three are
 * this one card's send button, in the mode the run state puts it in.
 *
 * The words are the same pair as the draft screen's, and deliberately shared rather than copied:
 * `sendRefusalReason` reads an answer through the code's own localized sentence (naming the model
 * where the copy needs it) and keeps what a send that never reached the route has to say, and
 * `S.chat.sendRefused` is the one sentence both screens draw.
 *
 * Scoped by Session: the sentence describes one conversation's attempt, and the composer stays
 * mounted while another conversation is opened — a refusal handed over unscoped would follow the
 * reader into a chat that never failed. The parent owns the sentence because it owns the write (the
 * same shape as the thinking level's and the permission preset's slots), and hands it over only
 * while it still describes the Session on screen.
 */
import { S } from "../../lib/strings";
import { sendRefusalReason } from "./first-send-refusal";

/** One refused send: which conversation it belongs to, and the sentence itself. */
export interface SendRefusal {
  sessionId: string;
  text: string;
}

/** The sentence for a message to `sessionId` that did not go out, aimed at `modelId` if known. */
export function sendRefusalLine(sessionId: string, err: unknown, modelId?: string): SendRefusal {
  return { sessionId, text: S.chat.sendRefused(sendRefusalReason(err, modelId)) };
}

/** What the composer draws: the sentence while it still describes the Session on screen. */
export function sendRefusalShown(refusal: SendRefusal | null, sessionId: string): string | null {
  return refusal !== null && refusal.sessionId === sessionId ? refusal.text : null;
}
