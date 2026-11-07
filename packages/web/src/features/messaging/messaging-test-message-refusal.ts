/**
 * The messaging card's "send test message" button: the sentence a message that did not go out
 * leaves under it, and why that sentence is a line in the card rather than a toast.
 *
 * The button sends one fixed line into the chat the connection already knows, and writes nothing
 * — the card looks exactly as it did before the press either way. So a refusal used to leave the
 * one sentence that explained it in a notification that dismissed itself after six seconds, while
 * the connection it went through (and what to fix: the bot's membership, the platform's reply
 * window, a revoked scope) is on the rows right above.
 *
 * Two shapes reach here, and they are NOT the same claim:
 *
 * - An answer came back from the route — it tried to deliver and the platform refused (502
 *   `<channel>_send_failed`), it refused to try at all (409 `<channel>_no_chat`: the known chat is
 *   gone), or it rejected the request itself (403/404/500, read through `refusalText`, 7.19's
 *   rule). Every one of those means the message did not go out.
 * - No answer came back — the client's own `network_error` (`ApiError` with status 0: the exchange
 *   never completed), or a value that is not an `ApiError` at all (an answer that was not the JSON
 *   the route promises). Whether the chat received the message is then unknown: the server may
 *   have delivered it and only its answer was lost on the way back. Saying "not sent" there would
 *   claim something this side cannot know, and the reader would send a second one into a chat that
 *   may already hold the first; that shape gets its own sentence, which says so.
 */
import { ApiError } from "../../api/client";
import { S } from "../../lib/strings";
import { refusalText } from "../../lib/api-error";

/** `refusalText`'s answer, unless it is blank — an empty line says less than the toast it replaced. */
function reasonOf(error: unknown): string {
  const reason = refusalText(error);
  return reason.trim() === "" ? S.common.unknownError : reason;
}

/**
 * The line the card draws under the two probe buttons after a test message that did not land.
 *
 * The platform's own words are kept for a refused send: the code's sentence only says "sending
 * the message failed", which the button already said, while the detail is what the reader acts on
 * (a bot no longer in the chat, QQ's minute-long reply window, a revoked scope) — the same reason
 * the connection's own delivery-failure line prints it. Everything else goes through
 * `refusalText`, so a `no_chat` reads the channel's "message the bot once first" sentence and a
 * rejected request reads its code's localized one rather than the server's English.
 */
export function messagingTestMessageRefusal(error: unknown): string {
  // No answer at all: `network_error` is the client's own status-0 code, and anything that is not
  // an ApiError came from an answer this side could not read. Neither says the message is unsent.
  if (!(error instanceof ApiError) || error.status === 0) {
    return S.messaging.testMessageUnconfirmed(reasonOf(error));
  }
  // `<channel>_send_failed` with a detail: the platform's words are the actionable half. This is
  // also what an unmapped channel's code lands on (only Feishu and Telegram have a sentence of
  // their own in the table), which is right — the route forwards the connector's own message.
  if (error.code.endsWith("_send_failed") && error.message.trim() !== "") {
    return S.messaging.testMessageRefused(error.message);
  }
  return S.messaging.testMessageRefused(reasonOf(error));
}
