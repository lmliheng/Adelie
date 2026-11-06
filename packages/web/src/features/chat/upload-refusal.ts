/**
 * The Files panel's upload: the sentence a refused write leaves above the listing, and why it is
 * drawn on the panel instead of arriving as a toast.
 *
 * An upload that the server refuses leaves the panel looking untouched — the file is not in the
 * tree, the directory still holds what it held, and the picker is ready for the same files again —
 * so the reason used to live only in a notification that dismissed itself after six seconds. What
 * the reader is left with is a directory that simply does not contain the file they dropped, with
 * nothing to say whether the box refused it, the path has no permission, or the request never
 * arrived. The sentence now stays above the rows until the next upload starts or the Session
 * switches.
 *
 * Two states, because they are different losses: nothing landed (the whole batch is still only on
 * the reader's disk), or some files landed and the rest did not — in which case naming the ones
 * that did not is the only way to know what to pick again.
 *
 * Which words: `refusalText`, the rule every refusal slot in the app follows (7.19) — an answer
 * the server gave is read through its code's own localized sentence, and a value this codebase
 * raised itself is shown as it wrote it.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/**
 * The line the panel draws above the listing after a refused upload. Named `…Line` because the
 * panel's state for it (`uploadRefusal`) holds the sentence itself.
 *
 * `target` is the directory as the panel names it (the caller's own label: the Workspace root
 * reads as ".", a directory as its path — the sentence has to say which directory did not take the
 * files, since an upload can go to a folder other than the one in view). `sent` counts the files
 * that did land, and `unsent` names the rest, in picking order — the one that was refused and
 * every file after it that was never tried.
 */
export function uploadRefusalLine(
  error: unknown,
  target: string,
  sent: number,
  unsent: readonly string[],
): string {
  const reason = refusalText(error);
  return sent === 0
    ? S.files.uploadRefused(target, reason)
    : S.files.uploadRefusedPartial(target, unsent.join(", "), reason);
}
