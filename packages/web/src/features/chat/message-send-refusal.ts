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
 * this one card's send button, in the mode the run state puts it in — for a staged `/agent`
 * handoff or `/model` switch, whose Send opens a new conversation but is pressed on this same card,
 * and for `/compact`, which posts nothing and asks the server to close the context instead.
 * The sentences differ because the presses write different things: a handoff and a model fork write
 * nothing into this conversation, while `/model` on a DESK first writes the employee's model to the
 * org chart — a refusal there may come after that write (see `deskModelRefusalLine`) — and a
 * refused `/compact` leaves the context exactly as it was (see `compactionRefusalLine`).
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
import { ApiError } from "../../api/client";
import { refusalText } from "../../lib/api-error";
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

/**
 * The same slot for the one send that goes somewhere else: a staged `/agent` target turns Send into
 * "hand this draft over to that Agent", so the press opens a NEW conversation and posts the first
 * message there — the card it is pressed on is still this one, its draft and its chip stay when the
 * handoff is refused (the empty Session the first half created is deleted again), and the button
 * therefore is the retry. The words differ from a plain send only in naming what was being done:
 * the target Agent, and that this conversation was not touched. `modelId` is the Project's default
 * model, which the new conversation is created on (the handoff carries no model of its own), so the
 * copy can name it when the credential is the thing missing.
 */
export function handoffRefusalLine(
  sessionId: string,
  err: unknown,
  agent: string,
  modelId?: string,
): SendRefusal {
  return { sessionId, text: S.chat.handoffRefused(agent, sendRefusalReason(err, modelId)) };
}

/** The picked model as the copy names it: the chip's own label, plus the id the credential copy needs. */
export interface PickedModel {
  /** How the chip above the card names the pick (the configured display name, else the id). */
  label: string;
  /** The upstream id, for `model_credential_missing`, whose body names no model. */
  modelId: string;
}

/**
 * A staged `/model` fork that did not get out: Send opens a NEW conversation on the picked model
 * and posts the draft as its first message. Nothing is persisted when it refuses (the empty
 * conversation is deleted again and this one was never written to), so the sentence names the model
 * and says this conversation is untouched — the chip and the draft are still on the card whose
 * button is therefore the retry.
 */
export function modelSwitchRefusalLine(
  sessionId: string,
  err: unknown,
  model: PickedModel,
): SendRefusal {
  return {
    sessionId,
    text: S.chat.modelSwitchRefused(model.label, sendRefusalReason(err, model.modelId)),
  };
}

/**
 * The same press on a DESK (`/model` in an employee's desk conversation). There the switch is the
 * employee's rather than a fork: the picked model is written to the org chart, the desk is renewed
 * onto it, and only then is the message posted — so a refusal can land with the chart already
 * written, or with the new desk open and the message unsent. Claiming "nothing was written" would
 * be false one step into the sequence; the sentence says what holds in every case (the message was
 * not sent) and points at the chart for the model the desk is on now, which the caller reloads as
 * it draws the line. The card keeps the draft and the chip either way, so its button retries.
 */
export function deskModelRefusalLine(
  sessionId: string,
  err: unknown,
  model: PickedModel,
): SendRefusal {
  return {
    sessionId,
    text: S.chat.deskModelRefused(model.label, sendRefusalReason(err, model.modelId)),
  };
}

/**
 * `/compact` typed into this card: the one press in the composer that posts nothing and instead asks
 * the server to close the context. The server answers 202 when it starts and 409 when it will not —
 * and then it has written nothing either: the slash token is gone from the box (running a command
 * consumes it), the conversation is the same one with the same context, so what the reader used to
 * get was a notification that expired over an unchanged screen (7.19's rule).
 *
 * The slot is the same one a refused send uses, because the press is this card's. It lands here
 * rather than in the thinking level's "compact, then switch" path, whose press is a compound one:
 * that one still switches the level, so "this conversation is unchanged" would be a lie there (see
 * how chat-page draws that path). No `modelId` is passed on: a compaction the server refuses is
 * refused before any model call (it is configured, there is something to compact, and the Session
 * is idle), so `model_credential_missing` cannot be the answer to this press.
 */
export function compactionRefusalLine(sessionId: string, err: unknown): SendRefusal {
  return { sessionId, text: S.chat.compactRefused(sendRefusalReason(err)) };
}

/**
 * Stop pressed on this card: one POST on the Session's abort route, and the press changed nothing
 * on screen when the server did not take it — the run kept going, so the same Stop button is still
 * up (and is the retry), while the words explaining why lived only in a notification that expired
 * after six seconds (7.19's rule). The sentence is the same slot a refused send uses, because the
 * press belongs to this card too: it says what did not land and that the run is still going, which
 * is the fact the button cannot show on its own.
 *
 * **404 says nothing**: the Session itself is gone, so the run it asked about is over too — a
 * sentence about a stop without a subject would outlive it (the rule `stopFailed` applies to the
 * API tab's Try it). A 204 is not a refusal either: the route answers it when there was no run
 * left to abort, and that is the race this press was trying to bring about.
 */
export function stopRefusalLine(sessionId: string, err: unknown): SendRefusal | null {
  if (err instanceof ApiError && err.status === 404) return null;
  return { sessionId, text: S.chat.stopRefused(refusalText(err)) };
}

/** What the composer draws: the sentence while it still describes the Session on screen. */
export function sendRefusalShown(refusal: SendRefusal | null, sessionId: string): string | null {
  return refusal !== null && refusal.sessionId === sessionId ? refusal.text : null;
}
