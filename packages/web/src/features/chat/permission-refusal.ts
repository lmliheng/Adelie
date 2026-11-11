/**
 * The permission picker: the sentence a refused write leaves above the input card, and why it is
 * drawn there instead of arriving as a toast.
 *
 * A preset (or, with the Sandbox switch off, an approval mode) is written straight through as one
 * PATCH on the Session — the approval mode and the Session's own sandbox policy together. The
 * button shows the pick at once and then re-reads the Session once the write settles, so a refusal
 * reverts it to the level it read before: nothing else on screen changes, and that button is the
 * retry. The route checks every field before it writes any, so a refusal stores nothing either.
 * A notification was therefore the only trace of the press, and it dismissed itself after six
 * seconds — leaving a control that looked as though the click had never registered.
 *
 * Which words: `refusalText`, the rule every refusal slot in the app follows (7.19) — an answer the
 * server gave is read through its code's own localized sentence, and a value this codebase raised
 * itself is shown as it wrote it.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/**
 * The line the composer draws above the card after a refused permission change. It says the
 * Session still holds the permission it had — that is the fact a reverted button cannot show on
 * its own, and the reason nothing was written.
 */
export function permissionRefused(error: unknown): string {
  return S.chat.permissionRefused(refusalText(error));
}
