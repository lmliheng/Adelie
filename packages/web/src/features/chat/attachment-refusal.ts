/**
 * The composer's pre-flight refusal: the sentence a pick, a paste or a drop leaves above the card
 * when a file came in over its ceiling, and why it is drawn there instead of arriving as a toast.
 *
 * The refusal is silent by construction — the file is turned away before it is read, so no chip
 * appears and nothing was ever added to the message. What the reader is left with is a list of
 * chips that does not contain the file they just chose, and a notification that dismissed itself
 * after six seconds: nothing on screen says which file was turned away or what the ceiling was.
 * The line now stays above the card until the next intake starts (7.19's rule: the sentence belongs
 * where the attempt was made, and here the picker is one click from the same list again).
 *
 * The ceilings are not one number: an inline image (INLINE_IMAGE_MAX_MB) is capped well below a
 * clip, and a file attachment rides the admin-settable per-file limit. One pick can therefore
 * refuse two files against two different numbers, so the sentence is built per ceiling and the
 * files it refused are named under it — a reader who dropped `a.png` and `b.mp4` has to learn
 * which of the two was over what.
 *
 * Names are the `File.name`s the reader saw in the picker, joined by the sentence's own dictionary
 * (Chinese 、, English ", ") — the same convention as every other list the app writes out.
 */
import { S } from "../../lib/strings";

/** One file the intake turned away, with the ceiling it was measured against (whole MB). */
export interface RefusedFile {
  name: string;
  limitMb: number;
}

/**
 * The line the composer draws, or null when this intake refused nothing (which also clears the
 * previous one: the slot is set on every intake, never left to a timer).
 *
 * Ceilings are grouped in first-seen order, so the picker's own order survives; sentences are
 * joined by a space because each already ends in a full stop of its own.
 */
export function attachmentRefusalLine(rejected: readonly RefusedFile[]): string | null {
  if (rejected.length === 0) return null;
  const byLimit = new Map<number, string[]>();
  for (const file of rejected) {
    const names = byLimit.get(file.limitMb);
    if (names === undefined) byLimit.set(file.limitMb, [file.name]);
    else names.push(file.name);
  }
  return [...byLimit]
    .map(([limitMb, names]) => S.chat.attachmentTooLarge(names, limitMb))
    .join(" ");
}
