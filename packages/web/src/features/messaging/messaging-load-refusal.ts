/**
 * The messaging editor's initial read: what a host that keeps the failure says, and why that
 * sentence cannot be left to a toast.
 *
 * Two hosts open the same editor. The dialog closes on a failed load — there is no form to
 * show, and whoever opened it has the row behind it to press again — so a toast is enough for
 * it. The conversation's Messaging panel is not a dialog: it stays open, and until this change
 * it stayed open on its loading skeleton forever, because the only account of the failure was a
 * notification that dismissed itself after six seconds. A panel that keeps shimmering claims to
 * be still reading; the read had already come back refused.
 *
 * So the sentence is built in one place, and a host declares whether it draws it itself
 * (`saysInPlace`): the hook then leaves the notification to the hosts that do not.
 */
import { S } from "../../lib/strings";
import { refusalText } from "../../lib/api-error";

/** What one failed initial read leaves: the line a host draws, and the toast it should pop. */
export interface MessagingLoadRefusal {
  /** The sentence, in the interface's own words (the server's wire message never leaks). */
  text: string;
  /** What the caller should announce as a toast, or null when the host draws `text` itself. */
  toast: string | null;
}

/**
 * Classify a failed initial read.
 *
 * `saysInPlace` is the dock panel's flag: it puts the sentence where the form would be and
 * offers a retry button under it, so a toast would be a second, self-erasing copy of a line
 * that is already on screen. Everything else keeps the toast it had.
 */
export function messagingLoadRefusal(
  error: unknown,
  opts: { saysInPlace?: boolean } = {},
): MessagingLoadRefusal {
  const text = S.messaging.loadRefused(refusalText(error));
  return { text, toast: opts.saysInPlace === true ? null : text };
}
