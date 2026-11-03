/**
 * The model config dialog's "test connection" button: the sentence a probe that did not get
 * through leaves under the button row, and why that sentence is a line in the dialog rather than
 * a toast.
 *
 * The button runs the form's current — still unsaved — values past the server, so every way a
 * probe can fail is something the reader has to keep while they fix that same form: a wrong key,
 * a base URL that answers nothing, an id whose group cannot route it. All of them used to arrive
 * as one notification, which sits over the dialog and dismisses itself after six seconds — the
 * form then looked exactly as it did before the button was pressed, with the one sentence that
 * explains the failure gone.
 *
 * So the refusal is drawn inside the dialog, under the buttons that asked, and it stays until the
 * form is edited or the next probe starts: the fields it describes are the ones the reader is
 * about to change, and the button is the retry.
 *
 * A probe that *connects* keeps the toast (`testOk`, latency in the sentence). That outcome leaves
 * nothing behind to explain — no field is wrong, and the number is not something the form has to be
 * read against — so only one of the two answers has a place on the dialog.
 */
import type { ModelTestResponse } from "@adelie/server/api";
import { S } from "../../lib/strings";
import { refusalText } from "../../lib/api-error";

/** What one press of the button came back with. */
export interface ModelTestAnswer {
  /** The route's answer, or `null` when the request itself failed (login gone, server down). */
  readonly result: ModelTestResponse | null;
  /** Why the request failed; read only when `result` is `null`. */
  readonly error?: unknown;
}

/**
 * The line the dialog draws under the test button, or `null` when the probe connected.
 *
 * Two of the three shapes follow the rule the rest of the app's refusal slots follow
 * (`refusalText`): a failed request carries its code's sentence, and an answer with no detail at
 * all falls back to the generic text — an empty line under the button would say less than the
 * toast it replaced. A routable entry that failed relays the route's own sentence, which is what
 * makes a wrong key or a wrong endpoint diagnosable.
 *
 * `fix` is the third shape and comes from `unroutableFix` (judged on the form at press time, so it
 * describes what was actually probed): an entry its group cannot place fails upstream with
 * AgentHub's own vocabulary — the id, then the client types it does support — which leaves the
 * reader to infer what to do. That case keeps the advice instead, and the relayed sentence goes to
 * the console for whoever reads the report.
 */
export function modelTestRefusal(
  answer: ModelTestAnswer,
  fix: "sync" | "custom" | null,
): string | null {
  if (answer.result !== null && answer.result.ok) return null;
  if (fix === "sync") return S.models.testStalePin;
  if (fix === "custom") return S.models.testNotRoutable;
  const message =
    answer.result === null
      ? refusalText(answer.error)
      : (answer.result.message ?? S.common.unknownError);
  return S.models.testFailed(message);
}
