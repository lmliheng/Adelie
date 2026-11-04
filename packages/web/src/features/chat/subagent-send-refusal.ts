/**
 * The sentence a message that never reached a subagent leaves above the panel's composer, and why
 * it is a line there rather than a toast.
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
