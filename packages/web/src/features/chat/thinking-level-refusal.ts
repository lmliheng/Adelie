/**
 * The thinking-level picker: the sentence a refused write leaves above the input card, and why it
 * is drawn there instead of arriving as a toast.
 *
 * Both pickers write the picked level straight through — the draft's to the Agent settings (it
 * becomes the Agent's new default and the level the first send's Session is created on), the
 * Session's onto the Session row (applies from the next LLM request) — and both show the level
 * they read back, never the one that was clicked. A refused write therefore changes nothing on
 * screen: the control still reads the old level and is the retry. The reason used to live only in
 * a notification that dismissed itself after six seconds, leaving a control that looked as though
 * it had not registered the click.
 *
 * Which words: `refusalText`, the rule every refusal slot in the app follows (7.19) — an answer
 * the server gave is read through its code's own localized sentence, and a value this codebase
 * raised itself is shown as it wrote it.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/**
 * The line the composer draws above the card after a refused level change.
 *
 * `forAgent` marks the draft's picker: its write goes through to the Agent's settings, so a refusal
 * there leaves the Agent's default unchanged too — worth saying, because the pick reads as a
 * single draft's setting at the moment it is made.
 */
export function thinkingLevelRefused(error: unknown, forAgent = false): string {
  return S.chat.thinkingLevelRefused(refusalText(error), forAgent);
}
