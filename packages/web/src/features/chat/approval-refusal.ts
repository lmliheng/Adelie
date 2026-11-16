/**
 * The conversation's approval block: the sentence a refused decision leaves above its two buttons,
 * and why it is drawn there instead of arriving as a notification.
 *
 * Pressing allow/deny is one POST on the Session (`/api/sessions/:id/approvals/:toolCallId`), and
 * the block stays on screen until the server answers — a refused decision therefore leaves the
 * card exactly as it was, buttons included: that block is the retry, and nothing else on screen
 * changes. A notification was, until now, not even that: the catch in `onApprove` answered only
 * 404 and dropped everything else on the floor, so a press could fail in complete silence and the
 * same card kept asking as though nothing had been pressed (7.19's rule).
 *
 * Which answer says nothing: **404** means the call is no longer waiting (it finished, or another
 * window already decided it) — the pending table drops the block on that same answer, so a
 * sentence about a decision that no longer exists would outlive its subject.
 *
 * Which words: `refusalText`, the rule every refusal slot in the app follows (7.19) — an answer
 * the server gave is read through its code's own localized sentence, and a value this codebase
 * raised itself is shown as it wrote it. The decision is named because the two buttons sit
 * side by side and a reader coming back to the screen should not have to guess which press this
 * was.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The two decisions a waiting call offers (the UI package's `ApprovalChoice`, kept local to the sentence's own module). */
export type ApprovalDecision = "allow" | "deny";

/**
 * What `onApprove` answers its card: `null` when the decision landed (or the call had already
 * settled, the 404 above), otherwise the sentence the block draws above its buttons.
 */
export type ApprovalAnswer = string | null;

/** The line a refused decision leaves in the approval block, naming the decision that did not get through. */
export function approvalAnswerRefused(decision: ApprovalDecision, error: unknown): string {
  return S.chat.approvalAnswerRefused(
    decision === "allow" ? S.chat.approve : S.chat.deny,
    refusalText(error),
  );
}
