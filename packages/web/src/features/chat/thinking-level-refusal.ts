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
 * The subagent panel's picker is the third caller: it pins the level on a child Session and, since
 * 2026-11-12, adopts it only once that PATCH has landed — the same shape, the same sentence.
 *
 * Which words: `refusalText`, the rule every refusal slot in the app follows (7.19) — an answer
 * the server gave is read through its code's own localized sentence, and a value this codebase
 * raised itself is shown as it wrote it.
 *
 * The second builder here is the same rule one surface over: the mid-chat switch card's own
 * "compact, then switch" press (compactBeforeSwitchRefused), whose card is the host because it is
 * the thing that asked.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";
import { sendRefusalReason } from "./first-send-refusal";

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

/**
 * The line the switch card draws when its recommended "compact, then switch" could not start the
 * compaction.
 *
 * That press asks for two things and only the first one failed: nothing was compacted and nothing
 * was switched, so the card keeps its question open on the same pick (see compactThenThinkingSwitch)
 * and this sentence says both facts — the reason, and the level that is still in force — next to
 * the "switch anyway" button that now decides it. The reason is read the same way `/compact`'s is
 * (`sendRefusalReason`), so the same refusals say the same words on both surfaces.
 */
export function compactBeforeSwitchRefused(level: string, error: unknown): string {
  return S.chat.thinkingSwitchCompactRefused(level, sendRefusalReason(error));
}
