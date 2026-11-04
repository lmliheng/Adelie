/**
 * The messaging card's "test connection" button: the sentence a credential probe that did not get
 * through leaves under it, and why that sentence is a line in the card rather than a toast.
 *
 * The button runs the selected channel's current — still unsaved — values through the server's
 * credential probe, which writes nothing. Every failed probe is therefore a form that looks exactly
 * as it did before the press, with the one sentence that explains the failure in a notification
 * that dismisses itself after six seconds — while the App ID, the secret and the base URL that
 * sentence points at are the fields right below. So the refusal is drawn inside the card, under the
 * button that asked, and it stays until the form is edited, the channel is switched or the next
 * probe starts: the button is the retry.
 *
 * A probe that *connects* keeps its toast (the latency, Telegram's bot name and its Group Privacy
 * caveat, the MCP dialog idiom): that outcome leaves nothing behind to explain, so only one of the
 * two answers has a place on the card.
 */
import { S } from "../../lib/strings";
import { refusalText } from "../../lib/api-error";

/** What all four channels' probe routes answer with, as far as a refusal is concerned. */
export interface MessagingProbeResult {
  readonly ok: boolean;
  /** The platform's own words; absent when the route had none to give. */
  readonly error?: string;
}

/** What one press of the button came back with. */
export interface MessagingTestAnswer {
  /** The route's own answer, or `null` when the request itself failed (login gone, server down). */
  readonly result: MessagingProbeResult | null;
  /** Why the request failed; read only when `result` is `null`. */
  readonly error?: unknown;
}

/**
 * The line the card draws under the test button, or `null` when the probe connected.
 *
 * Three shapes reach it, and each keeps the rule the rest of the app's refusal slots follow
 * (`refusalText`): the route's answer carries the platform's detail (an unauthorized token, an
 * unreachable base domain), a failed request carries its code's sentence rather than the server's
 * English, and an answer with no detail at all falls back to the generic text — an empty line under
 * the button would say less than the toast it replaced.
 */
export function messagingTestRefusal(answer: MessagingTestAnswer): string | null {
  if (answer.result === null) return S.messaging.testFail(refusalText(answer.error));
  if (answer.result.ok) return null;
  return S.messaging.testFail(answer.result.error ?? S.common.unknownError);
}
