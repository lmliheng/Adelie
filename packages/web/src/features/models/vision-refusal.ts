/**
 * The model config dialog's vision probe ("检测" beside the vision switch): the sentence a press
 * that decided nothing leaves under that control, and why that sentence is a line in the dialog
 * rather than a toast.
 *
 * The probe spends the user's own credential on one tiny image request and writes nothing unless it
 * learns something: a hit switches vision on, a definitive refusal switches it off, and a press that
 * got no usable answer leaves the switch exactly as it was. So the last of those is a sentence the
 * reader has to keep while they look at the same form they are about to fix — the key, the base URL
 * and the model id are all a glance away — and as a notification it sat over the dialog and
 * dismissed itself after six seconds, leaving no trace that the button had been pressed.
 *
 * Two of these three sentences used to be a single one borrowed from protocol detection ("could not
 * detect the protocol, check the API key and the base URL"), which names the wrong subject at the
 * wrong place: the reader pressed a control about images, and the answer talks about a protocol.
 *
 * The two answers keep their toast (`detectVisionOk` / `detectVisionNo`): each moved the switch in
 * front of the reader, which is the whole account of the press, and a rejection is a verdict rather
 * than a refusal. A missing model id is not a probe at all — the route must not be asked without
 * one — yet it is still a press that has to say why nothing happened, next to the button.
 */
import type { ModelVisionDetectResponse } from "@adelie/server/api";
import { S } from "../../lib/strings";
import { refusalText } from "../../lib/api-error";

/** What one press of the vision probe came back with. */
export type VisionPress =
  /** The form has no model id, so there is nothing to probe (the button still has to say so). */
  | { readonly kind: "unprobeable" }
  /** The route answered: it either took the image, refused it, or learned nothing. */
  | { readonly kind: "answer"; readonly result: ModelVisionDetectResponse }
  /** The request itself failed on the way out (server error, login gone, connection dropped). */
  | { readonly kind: "failed"; readonly error?: unknown };

/**
 * The line the dialog draws under the vision control, or `null` when the press needs none.
 *
 * Both verdicts leave nothing behind here: the switch they moved already says what was learned, and
 * they carry their own toast. A press that decided nothing reads the provider's own sentence (the
 * route truncates it) under a phrase naming what was probed, because "vision detection failed" and
 * "the endpoint never answered" have to be told apart by the reader fixing the form. Nothing at all
 * falls back to the generic text — an empty line under the control would say less than the toast it
 * replaced. A request that never reached the route reads its code's sentence (`refusalText`, 7.19's
 * rule), so a 500 is not relayed as advice about the model id this form already has.
 */
export function visionProbeRefusal(press: VisionPress): string | null {
  if (press.kind === "unprobeable") return S.models.detectVisionNeedsId;
  if (press.kind === "answer") {
    const { outcome, message } = press.result;
    if (outcome === "supported" || outcome === "unsupported") return null;
    return S.models.detectVisionFailed(message ?? S.common.unknownError);
  }
  return S.models.detectVisionFailed(refusalText(press.error));
}
