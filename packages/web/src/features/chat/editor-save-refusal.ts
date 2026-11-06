/**
 * The Files panel's in-place editor: the sentence a refused save leaves under the header, and why
 * that sentence is drawn on the panel instead of arriving as a toast.
 *
 * A refused save changes nothing else on screen — the editor stays open, the draft stays in it,
 * and the header's Save is the retry — so the reason used to live only in a notification that
 * dismissed itself after six seconds, leaving a panel that looked as though the button had simply
 * not been pressed. The file on disk had not moved; what the reader had typed was nowhere but the
 * textarea. The sentence now stays under the header that carries Save until the draft is edited,
 * the save is pressed again, or the edit is left.
 *
 * The draft differing from the file is worth saying out loud, because that is the state the reader
 * is left in. When the two are equal (a save pressed with nothing changed) there is nothing
 * unsaved, so the sentence is just the reason.
 *
 * Which words: `refusalText`, the rule every refusal slot in the app follows (7.19) — an answer
 * the server gave is read through its code's own localized sentence, and a value this codebase
 * raised itself is shown as it wrote it.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/**
 * The line the panel draws under the header after a refused save.
 *
 * `sent` is the text the write carried (not the textarea's contents at the moment the answer came
 * back: anything typed while the write was in flight is unsaved anyway), and `baseline` is what
 * the file holds — the two being equal means there was nothing to write.
 */
export function editorSaveRefusal(error: unknown, sent: string, baseline: string): string {
  const reason = refusalText(error);
  return sent === baseline ? S.files.saveRefused(reason) : S.files.saveRefusedDraftKept(reason);
}
