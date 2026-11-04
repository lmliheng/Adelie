/**
 * The model config dialog's "Detect" button: the sentence a detection that found no protocol
 * leaves under the base URL field, and why that sentence is a line in the dialog rather than a
 * toast.
 *
 * The button probes the URL the form currently holds and writes nothing — a hit only fills in the
 * protocol, a miss changes nothing at all. So the miss is one sentence the reader has to keep
 * while they fix the two things it names (the API key, the base URL), and those two fields are
 * right there in the same dialog. As a notification it sat over the dialog and dismissed itself
 * after six seconds, leaving a form that looked exactly as it did before the button was pressed.
 *
 * A hit keeps its toast (`detectedProtocol*`): it leaves nothing to explain, and where the
 * protocol ended up is already visible in the field's suffix. A save-time fallback keeps its note
 * too — it reports a save that went through, not a refusal.
 */
import type { ModelProtocolDetectResponse } from "@adelie/server/api";
import { S } from "../../lib/strings";
import { refusalText } from "../../lib/api-error";

/** What one press came back with. */
export type DetectPress =
  /** The route answered, with or without a protocol. */
  | { readonly kind: "answer"; readonly result: ModelProtocolDetectResponse }
  /** The URL never left the browser (see `detectableBaseUrl`): the route was never asked. */
  | { readonly kind: "unprobeable" }
  /** The request itself failed on the way out (server error, login gone, connection dropped). */
  | { readonly kind: "failed"; readonly error?: unknown };

/**
 * The line the dialog draws for one press, or `null` when the press found a protocol.
 *
 * Both keyless shapes — an answer naming no protocol, and a URL that was never probeable — keep
 * the single sentence the button has always used: it names the two things the reader can act on,
 * and the per-probe differences behind it are invisible from outside (wording one of them as "the
 * endpoint responded" read as success).
 *
 * A request that never reached the route is a different fact, and telling the reader to check the
 * key and the URL for it sends them to fields that may well be fine: it reads the error code's own
 * localized sentence instead, the rule every other refusal slot in the app follows (7.19's).
 */
export function detectProtocolRefusal(press: DetectPress): string | null {
  if (press.kind === "answer") {
    return press.result.detected ? null : S.models.detectFailedBody;
  }
  if (press.kind === "unprobeable") return S.models.detectFailedBody;
  return refusalText(press.error);
}
