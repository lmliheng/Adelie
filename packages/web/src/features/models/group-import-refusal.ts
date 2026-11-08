/**
 * The add-group dialog's import landing: the sentence a refused save leaves inside that dialog,
 * and why that sentence is a line in the dialog rather than a notification.
 *
 * Importing a group is one whole-table PUT (every row the endpoint listed, appended), so a
 * refusal writes nothing at all and the table goes back to what it was — the dialog is all the
 * reader has left: the name, the key and the base URL the retry sends. It also stays open (that
 * is why the caller hands the verdict back), and it already draws its own failures — an invalid
 * URL, a listing that failed — under the import button. A save that was refused used to be the
 * only one of those answers that went to a notification instead: a box over the dialog, six
 * seconds and gone, after which the dialog looked exactly as it had before the press and said
 * nothing about why the group was still missing from the page behind it.
 *
 * So the refusal is drawn in the dialog's own error slot, under the button that retries it, and
 * stays until the form is edited or another attempt starts. The sentence names the group and
 * says the table still holds what it held: the retry has to be read against something that did
 * not move, and "not created" on its own leaves the reader unsure whether half the listing
 * landed.
 */
import { S } from "../../lib/strings";
import type { WriteOutcome } from "./write-outcome";

/**
 * The line the dialog draws when the import's save did not land, or `null` when it did — a
 * written import closes the dialog, so only the refused one has a line to show.
 */
export function groupImportRefusal(name: string, outcome: WriteOutcome): string | null {
  return outcome.ok ? null : S.models.groupImportRefused(name, outcome.reason);
}
