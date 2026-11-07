/**
 * The API tab's three writes that ask nothing first — turning the API on, the approval mode its
 * conversations start with, and turning keyless access off — and the line a refusal leaves under
 * the control that asked for it.
 *
 * None of these controls moves optimistically: the switch and the select show what the server
 * answered with, so a refused write leaves the tab exactly as it was — the switch in its old
 * position, the select back on the stored mode. Until 7.98 the reason lived only in a notification
 * that dismissed itself after six seconds; after it the control simply looked as if it had been
 * pressed and come back, with nothing on screen saying why. That is the shape 7.19 bans, and this
 * tab is where the refusal carries the most weight of all: a keyless-off that did not land leaves
 * anything that can reach the address talking to the Agent without a key.
 *
 * The three sentences differ on purpose.
 *
 * - Turning the API on: it is still off, so external programs are still refused. The switch is the
 *   retry.
 * - The approval mode: the select falls back to the stored mode, so the sentence has to name the
 *   mode that was asked for — otherwise it describes a change the reader no longer sees on screen.
 * - Turning keyless access off: the sentence says the exposure is still open. That is the fact the
 *   reader has to act on, and it is the opposite of what pressing the switch looks like.
 *
 * The reason goes through `refusalText` (7.19's rule): what the server answered is read by its
 * code's own localized sentence, never the English wire message.
 */
import type { ApprovalMode } from "@adelie/server/api";
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The switch at the top of the tab: still off, so nothing external got in. */
export function apiEnabledRefused(err: unknown): string {
  return S.agent.apiEnableRefused(refusalText(err));
}

/** The approval mode: still the stored one, so the sentence names the mode that was asked for. */
export function apiApprovalModeRefused(mode: ApprovalMode, err: unknown): string {
  return S.agent.apiApprovalModeRefused(S.chat.approvalModeNames[mode] ?? mode, refusalText(err));
}

/** Keyless access: still open — anything that reaches the address still gets in without a key. */
export function apiKeylessOffRefused(err: unknown): string {
  return S.agent.apiKeylessOffRefused(refusalText(err));
}
