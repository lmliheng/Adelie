/**
 * Where a refused save of the upload limits is drawn, and what it says.
 *
 * The form has exactly one statement the server makes about the pair of numbers
 * (`invalid_attachment_limit`), so that sentence belongs under the two fields it is about. Every
 * other way the save can fail (a lost session, a dead server, a 500) is about the form as a
 * whole: nothing was written, both fields still hold what was typed, and Save is the retry. Those
 * go to the section, which is what keeps them on screen at all — a toast raised for them dismissed
 * itself after six seconds over a form that looked untouched, and a reader who had looked away was
 * left with a save that silently did not happen (7.19's rule, app-wide: the sentence belongs where
 * the attempt was made).
 *
 * The branch lives here rather than in the component so that which slot a failure lands in is one
 * sentence of code with a test, as `proxy-save-refusal.ts` and `asr-save-refusal.ts` do for the
 * sections beside it.
 */
import { ApiError } from "../../api/client";
import { refusalText } from "../../lib/api-error";

export type UploadsSaveRefusal = {
  /** `fields` draws under both numbers; `section` draws above the Save row. */
  slot: "fields" | "section";
  text: string;
};

/** Which slot the failed save's sentence goes to, already localized. */
export function uploadsSaveRefusal(error: unknown): UploadsSaveRefusal {
  const text = refusalText(error);
  if (error instanceof ApiError && error.code === "invalid_attachment_limit") {
    return { slot: "fields", text };
  }
  return { slot: "section", text };
}
