/**
 * The ledger page's three background failures, and the line each one leaves where its own control
 * is.
 *
 * All three used to be a toast plus a sentence without the reason: a walk of the whole data root
 * that could not be read said only "could not read the storage report", the read of the mode (and
 * through it the trash and the bills) said only that it treats the mode as off, and a scan that
 * was refused said only that there is no bill — and the server's own words lived six seconds in a
 * notification over the top of the page. A page whose first promise is that nothing moves without
 * a review has to account for the failures of that promise where the reader is looking: under the
 * button that measured, beside the switch that could not be read, above the bill that was not
 * written (7.19's rule, app-wide).
 *
 * The reason is whatever `refusalText` decided — the server's localized message for anything it
 * answered, a locally raised sentence as it is — and it travels verbatim; the sentence around it
 * only says which of the three failures this is.
 */
import { S } from "../../lib/strings";

/** Which of the page's three failures a sentence is about. */
export type StorageFailure = "report" | "state" | "scan";

/**
 * The sentence for one failure, with the reason inside it.
 *
 * The three are kept apart rather than merged into "the storage page failed": they are drawn in
 * three different places, and the reader has to know which of the page's promises went unanswered
 * — the measurement, the mode (which decides what the page may offer at all), or the scan.
 */
export function storageFailureText(failure: StorageFailure, reason: string): string {
  switch (failure) {
    case "report":
      return S.settings.storageFailed(reason);
    case "state":
      return S.settings.storageModeFailed(reason);
    case "scan":
      return S.settings.storageScanFailed(reason);
  }
}
