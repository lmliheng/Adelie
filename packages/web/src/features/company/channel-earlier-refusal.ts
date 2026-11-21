/**
 * The sentence a channel keeps under its "Earlier days" button after a day file did not come
 * back, and why it is drawn there rather than arriving as a toast.
 *
 * Paging back is a read, and a read that fails changes nothing on screen: the stream keeps every
 * day it already holds and the button stays exactly where it was, so the button pressed a moment
 * ago IS the retry. What the reader used to get was a notification over the top of the page that
 * dismissed itself after six seconds; afterwards the channel read as though nothing had been
 * pressed at all — the stream had simply not grown, and the reason was gone (7.19's rule,
 * app-wide: the sentence belongs where the attempt was made).
 *
 * The words follow the app's other read slots (`S.chat.loadEarlierRetry` above a conversation):
 * the interface's own lead-in plus the reason, localized from the code where the app has words for
 * it and left as the server wrote it otherwise (`refusalText`). Organization reads answer in codes
 * this app mostly has no sentences for, so the fallback does real work here rather than being a
 * last resort.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The sentence for an earlier day that did not load, already localized. */
export function channelEarlierRefusalLine(err: unknown): string {
  return S.company.channels.earlierRefused(refusalText(err));
}
