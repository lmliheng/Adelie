/**
 * The MCP server modal's "test connection" button: the sentence a probe that did not get through
 * leaves under it, and why that sentence is a line in the card rather than a toast.
 *
 * The button runs the form's current — still unsaved — values through the server's
 * connect-and-discover route. Every way a probe can fail is something the reader has to keep while
 * fixing the form: a stdio command that is not on PATH, a URL that times out, a server whose
 * stderr tail names the certificate. All of them used to arrive as one notification, which sits
 * over the card and dismisses itself after six seconds — the card then looked exactly as it did
 * before the button was pressed, with the one sentence that explains the failure gone.
 *
 * So the refusal is drawn inside the modal, under the button that asked, and it stays until the
 * form is edited or the next probe starts: the fields it describes are the ones the reader is
 * about to change, and the button is the retry.
 *
 * A probe that *connects* keeps the toast (tool count + latency, the models dialog idiom). That
 * outcome leaves nothing behind to explain — no field is wrong, and its numbers are not something
 * the form has to be read against — so only one of the two answers has a place on the card.
 */
import type { McpServerTestResponse } from "@adelie/server/api";
import { S } from "../../lib/strings";
import { refusalText } from "../../lib/api-error";

/** What one press of the button came back with. */
export interface McpTestAnswer {
  /** The route's own answer, or `null` when the request itself failed (login gone, server down). */
  readonly result: McpServerTestResponse | null;
  /** Why the request failed; read only when `result` is `null`. */
  readonly error?: unknown;
}

/**
 * The line the modal draws under the test button, or `null` when the probe connected.
 *
 * Three shapes reach it, and each keeps the rule the rest of the app's refusal slots follow
 * (`refusalText`): the route's answer carries its own detail (spawn error, timeout, stderr tail),
 * a failed request carries its code's sentence, and an answer with no detail at all falls back to
 * the generic text — an empty line under the button would say less than the toast it replaced.
 */
export function mcpTestRefusal(answer: McpTestAnswer): string | null {
  if (answer.result === null) return S.agent.mcpTestFail(refusalText(answer.error));
  if (answer.result.ok) return null;
  return S.agent.mcpTestFail(answer.result.error ?? S.common.unknownError);
}
