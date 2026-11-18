/**
 * What a press in the subagent panel's composer that the server did not take leaves above the box
 * — a message that never reached the child, and a Stop that did not land — and why it is a line
 * there rather than a toast.
 *
 * The child composer keeps what was typed when the send comes back refused — that is the whole
 * point of `onSend` answering `false` — so after the failure the reader is still looking at the
 * message they meant to send, with the same button to retry it. The reason used to be a
 * notification: it floated over the panel, dismissed itself after six seconds, and left a composer
 * that read exactly as it did before the press. Whatever has to change (the child was released, the
 * server refused it mid-turn, the connection dropped) is a sentence the reader needs while looking
 * at that draft, so it is drawn right above the box.
 *
 * `subagent_gone` keeps its own sentence (`S.subagentPanel.subagentGone`, "该子会话已不存在，无法
 * 恢复"): there the child is what is missing, not the message, and it is the one answer that also
 * decides what the panel should do next. Everything else reads through `refusalText` — 7.19's rule,
 * so a request that never reached the route says what its own code means rather than the code's
 * wire message.
 */
import { ApiError } from "../../api/client";
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The line under the child composer, naming what failed before the server's own words. */
export function subagentSendRefused(err: unknown): string {
  if (err instanceof ApiError && err.code === "subagent_gone") {
    return S.subagentPanel.subagentGone;
  }
  return S.subagentPanel.sendRefused(refusalText(err));
}

/**
 * Stop pressed in the child composer: one POST on the panel's own abort route
 * (`…/subagents/:child/abort`), and a refusal changes nothing on screen — only the child's
 * current run is aborted, the Session survives, so the same Stop button is still up and is the
 * retry. What the sentence adds is the fact the button cannot show: nothing was stopped, the run
 * is still going. The panel's catch used to swallow it entirely (`catch(() => undefined)`), so a
 * server error left a composer that looked exactly as it had before the press, with no word
 * anywhere — not even the six-second notification this file replaced for sends (7.19's rule).
 *
 * **404 says nothing**: it is the parent Session that is missing (the child's own absence is a
 * 204, "nothing left to stop"), so the run this press asked about is over too and a sentence
 * would outlive its subject — the same rule the chat card's `stopRefusalLine` applies.
 *
 * The words are the panel's own rather than the chat card's: this line sits above a CHILD's
 * composer, next to the parent's card on screen, so it names which run is still going.
 */
export function subagentStopRefused(err: unknown): string | null {
  if (err instanceof ApiError && err.status === 404) return null;
  return S.subagentPanel.stopRefused(refusalText(err));
}
