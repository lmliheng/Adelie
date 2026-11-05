/**
 * The handbook editor's Save button: the sentence a refused write leaves above the draft, and why
 * that sentence is drawn on the page instead of arriving as a toast.
 *
 * A refused save changes nothing else on screen — the editor stays open, the draft stays in it,
 * and Save is the retry — so the reason used to live only in a notification that dismissed itself
 * after six seconds, leaving an editor that looked like it had simply not been pressed. The
 * sentence now stays above the draft until the text is edited, the save is pressed again or the
 * edit is cancelled: while the words in the editor are still the ones that were not written.
 *
 * The draft being different from the file is worth saying out loud, because that is the state the
 * reader is left in: the file still holds what it held, and what they typed is still on screen
 * but nowhere else. When the two are equal (Save pressed on a document nobody edited) there is
 * nothing lost, so the sentence is just the reason.
 *
 * Which words: `refusalText`, the rule every refusal slot in the app follows (7.19) — a request
 * the server answered is read through its code's own localized sentence, a value this codebase
 * raised itself is shown as it wrote it.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/**
 * The line the editor draws above the draft after a refused save.
 *
 * `draft` and `stored` are the text in the editor and the text the server last returned for the
 * document; they are compared rather than trusted to differ, because cancelling an edit and
 * starting a new one leaves the editor open with nothing changed.
 */
export function handbookSaveRefusal(error: unknown, draft: string, stored: string): string {
  const reason = refusalText(error);
  return draft === stored
    ? S.company.handbook.saveRefused(reason)
    : S.company.handbook.saveRefusedDraftKept(reason);
}
