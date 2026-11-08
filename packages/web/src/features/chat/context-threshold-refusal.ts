/**
 * The context panel's threshold cutter: the sentence a refused write leaves inside the
 * confirmation that asked for it, and why it is drawn there instead of arriving as a toast.
 *
 * The cutter never writes straight through: a release (or Enter) opens a confirmation naming the
 * Agent and the threshold it is about to replace, and the Save in that card performs the write.
 * The card stays open on the edited value when the write is refused — the Save is the retry — so
 * the reason belongs inside the same card, right under its sentence. It used to arrive only as a
 * notification: the card that asked the question then sat there looking unanswered, and after six
 * seconds nothing on screen said why the threshold had not moved (7.19's rule, app-wide).
 *
 * Which words: `refusalText`, the rule every refusal slot in the app follows — an answer the
 * server gave is read through its code's own localized sentence, and a value this codebase raised
 * itself is shown as it wrote it. The sentence names the threshold that was asked for, because the
 * Agent still holds the old one and the dialog's field is the only place the new number lives.
 */
import { refusalText } from "../../lib/api-error";
import { humanizeTokens } from "../../lib/format";
import { S } from "../../lib/strings";

/** The line the threshold confirmation draws under its sentence after a refused write. */
export function contextThresholdRefused(tokens: number, error: unknown): string {
  return S.chat.contextThresholdRefused(humanizeTokens(tokens), refusalText(error));
}
