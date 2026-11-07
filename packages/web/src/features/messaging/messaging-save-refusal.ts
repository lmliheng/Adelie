/**
 * The messaging card's Save: the sentence a refused write leaves in the form, and why it is a
 * line there rather than a toast.
 *
 * Save persists the selected channel's credentials and writes nothing optimistically — the
 * fields keep every value that was typed, the baseline they are compared against does not move,
 * and a successful save is what would have popped the "saved" toast. A refused one therefore
 * leaves a form that looks exactly as it did before the press, with the one sentence that
 * explains it in a notification that dismisses itself after six seconds. Whoever looked at the
 * button rather than at the notification region is left with a form that still reads "unsaved"
 * and no reason for it — and the credential they were told to fix is a field on that same form.
 *
 * So the refusal is drawn at the end of the card, above the Save action in both hosts, and it
 * stays until the next save starts or the channel is switched: Save itself is the retry.
 */
import { S } from "../../lib/strings";
import { refusalText } from "../../lib/api-error";

/**
 * The line the card draws after a save that did not land.
 *
 * One shape reaches it — the request failed — and it keeps the rule every other refusal slot in
 * the app follows (`refusalText`, 7.19's rule): an answer the server gave is read through its
 * code's own localized sentence rather than the English wire message, a value this codebase
 * raised itself is shown as it wrote it, and anything with nothing to say falls back to the
 * generic text, because an empty line under the button would say less than the toast it replaced.
 *
 * A validation failure is NOT this: the fields that block the save answer for themselves
 * (`fieldErrors`), and naming them twice would read as two problems.
 */
export function messagingSaveRefusal(error: unknown): string {
  return S.messaging.saveRefused(refusalText(error));
}
