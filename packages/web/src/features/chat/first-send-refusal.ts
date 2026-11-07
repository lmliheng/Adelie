/**
 * The first message a draft could not get out — the only write /chat/new makes — and the sentence
 * the page leaves under the input card afterwards.
 *
 * Sending from a draft creates the Session and posts its first task in one go. When either half
 * is refused nothing is persisted (an empty Session the first half created is deleted again), the
 * typed text and the staged files stay in the composer, and the send button is the retry. What the
 * reader used to get was a notification over the card that dismissed itself after six seconds:
 * afterwards the screen read exactly as it had before the press, with the words explaining why
 * gone.
 *
 * Whose words, when the send threw two different kinds of value:
 * - the server answered → `apiErrorText`, whose code carries the interface's own sentence, and
 *   which needs the model the draft was aimed at for `model_credential_missing` (the body names
 *   no model);
 * - nothing answered (the connection dropped, the request never left) → 7.19's rule, keeping what
 *   the value itself has to say rather than flattening it to the generic text.
 * The same pair the confirmation dialogs' refusal slots and 7.89–7.93 use.
 */
import { ApiError } from "../../api/client";
import { apiErrorText, refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The reason out of whatever the send threw, with the model the draft was aimed at (if any). */
export function sendRefusalReason(err: unknown, modelId?: string): string {
  if (err instanceof ApiError) return apiErrorText(err, modelId !== undefined ? { modelId } : {});
  return refusalText(err);
}

/** The sentence: what could not be sent, then why. */
export function sendRefused(reason: string): string {
  return S.chat.draftSendRefused(reason);
}
