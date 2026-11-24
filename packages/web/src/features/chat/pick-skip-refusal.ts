/**
 * The Files panel's pick: the files the pick itself never handed over — too large for the upload
 * endpoint, or a dropped folder — and why their names stay above the listing.
 *
 * Nothing is read and no request goes out. `splitBySize` measures the batch against the endpoint's
 * ceiling first, and a folder cannot become a file the write route takes, so there is no server
 * answer to draw and the tree still holds the directory it held: the reader is looking at the same
 * panel as before the pick, with those files still only where they were picked from. The names used
 * to arrive as a toast, which dismissed itself after six seconds and left the pick looking like it
 * never happened. They now write into the slot a refused upload writes into (upload-refusal.ts) —
 * it is the same fact about the same gesture, told in the place the retry is.
 *
 * Both kinds in one sentence, because one pick can hit both: files over the ceiling and folders the
 * drop cannot carry.
 */
import { S } from "../../lib/strings";

export function pickSkipLine(
  skipped: { readonly dirs: readonly string[]; readonly oversize: readonly string[] },
  mb: number,
): string | null {
  const halves: string[] = [];
  if (skipped.oversize.length > 0)
    halves.push(S.files.uploadTooLarge(skipped.oversize.join(", "), mb));
  if (skipped.dirs.length > 0) halves.push(S.files.folderDropSkipped(skipped.dirs.join(", ")));
  return halves.length === 0 ? null : halves.join(S.files.pickSkipSeparator);
}

/**
 * The same sentence after a write that was refused as well: the server's own words first (that is
 * the answer to what the batch did), then what this pick never gave the batch to send. Without the
 * second half, a batch that was refused halfway would speak only about the files it tried and drop
 * the names of the ones it had already skipped.
 */
export function withPickSkips(refusal: string, skipped: string | null): string {
  return skipped === null ? refusal : `${refusal}${S.files.pickSkipSeparator}${skipped}`;
}
