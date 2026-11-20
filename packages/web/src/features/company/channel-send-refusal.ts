/**
 * The sentence a channel's composer keeps above its box after a message the server did not take,
 * and why it is drawn there rather than arriving as a toast.
 *
 * Sending is the composer's only write, and a refusal changes nothing else on screen: the draft —
 * mentions included — stays in the box and the send button stays where it was, so the button
 * pressed a moment ago IS the retry. What the reader used to get was a notification over the
 * stream that dismissed itself after six seconds; afterwards the channel read exactly as it had
 * before the press, with the words explaining it gone (7.19's rule, app-wide).
 *
 * The words follow the app's other send slots (`S.chat.sendRefused` for a conversation,
 * `S.subagentPanel.sendRefused` for a child one): the interface's own lead-in plus the reason,
 * localized from the code where the app has words for it and left as the server wrote it
 * otherwise (`refusalText`). Channel writes are the one place those codes are mostly the
 * organization service's own (`channel_archived`, `not_a_member`, `mention_not_member`), which
 * this app has no sentences for — so the fallback does real work here rather than being a last
 * resort, and the line still says what happened instead of a generic failure.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The sentence for a channel message that did not go out, already localized. */
export function channelSendRefusalLine(err: unknown): string {
  return S.company.channels.sendRefused(refusalText(err));
}
